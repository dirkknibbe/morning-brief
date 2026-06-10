/**
 * discord-listener.ts — dumb always-on Discord daemon (design spec
 * docs/superpowers/specs/2026-06-09-discord-listener-design.md, Approach A).
 *
 * Slash commands are deterministic shell-outs (argv arrays, never shell
 * strings); free-form messages get a static reply. LLM dispatch is an
 * explicitly deferred follow-up — see triggers/listener.md.
 *
 * Run under launchd (KeepAlive): transient errors are logged and retried
 * in-process; the only fatal exits are missing config and an invalid token.
 *
 *   bun run scripts/discord-listener.ts [--once]
 */

import { appendFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MongoClient } from "mongodb";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  ThreadAutoArchiveDuration,
} from "discord.js";
import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  Interaction,
  Message,
  TextChannel,
} from "discord.js";
import { loadDiscordConfig, type DiscordConfig } from "../src/discord/config";
import { checkAccess, type InteractionOrigin } from "../src/discord/gate";
import { isStaleInteraction, isValidSlug } from "../src/discord/validate";
import { firstLine, formatElapsed } from "../src/discord/format";
import {
  COMMAND_ABORT,
  COMMAND_BUILD,
  COMMAND_FACTORY_STATUS,
  OPTION_SLUG,
  abortButtonId,
  parseAbortButtonId,
} from "../src/discord/commands";
import { THREAD_HANDOFF_FILE } from "../src/discord/send-core";

const REPO_ROOT = join(import.meta.dir, "..");
const LOG_DIR = join(REPO_ROOT, "logs");

const FULL_INTENTS = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
];
const FALLBACK_INTENTS = [GatewayIntentBits.Guilds];

const LOGIN_BACKOFF_MS = [5_000, 15_000, 30_000, 60_000] as const;
const ONCE_MODE_MAX_LOGIN_ATTEMPTS = 3;
const AUTOCOMPLETE_MAX_CHOICES = 25;
const THREAD_NAME_MAX_LEN = 100;

const STATIC_REPLY = [
  "I'm the morning-brief daemon — I only do slash commands:",
  "`/build slug` — start a factory build (slug autocompletes from queued ideas)",
  "`/abort` — stop the running build",
  "`/factory-status` — check the running build",
  "",
  "Free-form Q&A is not wired up yet.",
].join("\n");
// LLM dispatch follow-up (deferred per design spec §6): non-command messages
// should eventually route through `claude --print` with triggers/listener.md
// as the dispatch spec. v1 is the static reply above on purpose.

// ── logging ───────────────────────────────────────────────────────────

function localDateStem(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Append to logs/listener-<YYYY-MM-DD>.log AND mirror to stdout (launchd). */
function log(level: "info" | "warn" | "error", message: string): void {
  const line = `${new Date().toISOString()} [${level}] ${message}`;
  console.log(line);
  try {
    appendFileSync(join(LOG_DIR, `listener-${localDateStem()}.log`), `${line}\n`);
  } catch {
    // stdout already has the line; never crash the daemon over log I/O
  }
}

// ── shell-outs (argv arrays only — never a shell string) ──────────────

interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function runCommand(argv: readonly string[]): Promise<CommandResult> {
  const proc = Bun.spawn([...argv], {
    cwd: REPO_ROOT,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

// ── factory lock ──────────────────────────────────────────────────────

interface LockState {
  readonly idea_slug: string;
  readonly started_at: string;
  readonly pid: number;
  readonly pgid: number;
}

/** `bun run factory lock-check` → LockState | null (stdout is JSON or "null").
 *  --silent everywhere: without it bun's `$ bun run …` banner is stderr line 1
 *  and firstLine() would log the banner instead of the actual error. */
async function readLockState(): Promise<LockState | null> {
  const result = await runCommand(["bun", "run", "--silent", "factory", "lock-check"]);
  if (result.exitCode !== 0) {
    throw new Error(`factory lock-check failed: ${firstLine(result.stderr)}`);
  }
  const out = result.stdout.trim();
  if (!out || out === "null") return null;
  return JSON.parse(out) as LockState;
}

/** SIGTERM the whole factory process group; ESRCH (already gone) is fine.
 *  Returns false on a refused (suspicious) pgid so the caller can hard-fail
 *  instead of releasing the lock for a build that was never signalled. */
function killProcessGroup(pgid: number): boolean {
  if (!Number.isInteger(pgid) || pgid <= 1) {
    // -1/-0 would signal far more than the factory; refuse.
    log("error", `refusing to kill suspicious pgid: ${pgid}`);
    return false;
  }
  try {
    process.kill(-pgid, "SIGTERM");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ESRCH") throw err;
  }
  return true;
}

// ── autocomplete (Mongo, fail soft) ───────────────────────────────────

// Autocomplete must answer within ~3s and cannot be deferred; the driver's
// 30s default server selection guarantees a dead-on-arrival response.
const MONGO_SERVER_SELECTION_TIMEOUT_MS = 2_000;

// Cache the CONNECT PROMISE, not the connected client: concurrent keystrokes
// during a slow connect would otherwise each spawn another MongoClient
// (last-writer-wins, earlier ones leaked). A failed connect self-cleans —
// the driver closes its topology on rejection — so resetting to null is safe.
let mongoClientPromise: Promise<MongoClient> | null = null;

function getMongoClient(uri: string): Promise<MongoClient> {
  mongoClientPromise ??= new MongoClient(uri, {
    serverSelectionTimeoutMS: MONGO_SERVER_SELECTION_TIMEOUT_MS,
  })
    .connect()
    .catch((err) => {
      mongoClientPromise = null; // next call retries with a fresh client
      throw err;
    });
  return mongoClientPromise;
}

async function fetchQueuedSlugs(): Promise<string[]> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not set");
  const client = await getMongoClient(uri);
  const dbName = process.env.MONGODB_DB ?? "morning-brief";
  const docs = await client
    .db(dbName)
    .collection("ideas")
    .find({ status: "queued" }, { projection: { slug: 1, _id: 0 } })
    .sort({ signal_strength: -1, created_at: -1 })
    .limit(AUTOCOMPLETE_MAX_CHOICES)
    .toArray();
  return docs.map((doc) => String(doc.slug));
}

async function closeMongo(): Promise<void> {
  const pending = mongoClientPromise;
  mongoClientPromise = null;
  if (!pending) return;
  try {
    const client = await pending;
    await client.close();
  } catch {
    // connect never succeeded — the driver already cleaned up after itself
  }
}

// ── handlers ──────────────────────────────────────────────────────────

// /build and /abort run multi-second advisory checks before the factory
// trigger acquires the authoritative Mongo lock; two interleaved commands
// can both pass them and clobber the pgid handoff file. The daemon is
// single-threaded, so a synchronous check-and-set flag serializes them.
let mutatingCommandInFlight = false;
const BUSY_REPLY = "another command is in flight — retry in a few seconds";

function originOf(source: {
  guildId: string | null;
  channelId: string | null;
  channel?: { isThread(): boolean; parentId?: string | null } | null;
  user?: { id: string };
}): InteractionOrigin {
  // Interactions inside the build thread carry the THREAD's id as channelId;
  // the gate allowlists parent channels, so resolve threads to their parent
  // (heartbeats route Dirk into the thread — /abort must work there).
  const channelId = source.channel?.isThread()
    ? source.channel.parentId ?? source.channelId
    : source.channelId;
  return {
    guildId: source.guildId,
    channelId,
    userId: source.user?.id,
  };
}

async function refuseEphemeral(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  content: string
): Promise<void> {
  await interaction
    .reply({ content, flags: MessageFlags.Ephemeral })
    .catch((err) => log("warn", `refusal reply failed: ${err}`));
}

async function handleAutocomplete(
  config: DiscordConfig,
  interaction: AutocompleteInteraction
): Promise<void> {
  const respond = (choices: { name: string; value: string }[]) =>
    interaction
      .respond(choices)
      .catch((err) => log("warn", `autocomplete respond failed: ${err}`));

  if (interaction.commandName !== COMMAND_BUILD) return void (await respond([]));
  const gate = checkAccess(config, originOf(interaction));
  if (!gate.allowed) {
    log("warn", `autocomplete refused — ${gate.reason}`);
    return void (await respond([]));
  }
  // Fail SOFT: a Mongo hiccup must never crash the daemon or the interaction.
  let slugs: string[] = [];
  try {
    slugs = await fetchQueuedSlugs();
  } catch (err) {
    log("error", `autocomplete mongo query failed (soft): ${err}`);
    await closeMongo(); // drop the possibly-broken client; next call reconnects
  }
  const focused = interaction.options.getFocused().toLowerCase();
  const choices = slugs
    .filter((slug) => slug.includes(focused))
    .slice(0, AUTOCOMPLETE_MAX_CHOICES)
    .map((slug) => ({ name: slug, value: slug }));
  await respond(choices);
}

/** Post the build-started message (+[Abort] button) in #factory, open the
 *  heartbeat thread, and write its id to the handoff file for `bun run send`. */
async function announceBuildStarted(
  config: DiscordConfig,
  client: Client,
  slug: string
): Promise<void> {
  const channel = await client.channels.fetch(config.factoryChannelId);
  if (!channel || !channel.isTextBased()) {
    throw new Error("factory channel is not a text channel");
  }
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(abortButtonId(slug))
      .setLabel("Abort")
      .setStyle(ButtonStyle.Danger)
  );
  const message = await (channel as TextChannel).send({
    content: `🏭 building ${slug}`,
    components: [row],
  });
  const thread = await message.startThread({
    name: `factory-${slug}`.slice(0, THREAD_NAME_MAX_LEN),
    autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
  });
  writeFileSync(THREAD_HANDOFF_FILE, thread.id);
  log("info", `build thread ${thread.id} for ${slug} → ${THREAD_HANDOFF_FILE}`);
}

async function handleBuild(
  config: DiscordConfig,
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply(); // 3s ack rule — shell-outs below are slow
  if (mutatingCommandInFlight) {
    await interaction.editReply(BUSY_REPLY);
    return;
  }
  mutatingCommandInFlight = true;
  try {
    await runBuild(config, interaction);
  } finally {
    mutatingCommandInFlight = false;
  }
}

async function runBuild(
  config: DiscordConfig,
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const slug = interaction.options.getString(OPTION_SLUG, true);
  // Injection boundary: reject before ANY shell-out.
  if (!isValidSlug(slug)) {
    await interaction.editReply(
      "invalid slug — lowercase letters, digits and hyphens only"
    );
    return;
  }
  const lock = await readLockState();
  if (lock) {
    await interaction.editReply(`🏭 a build is already running: ${lock.idea_slug}`);
    return;
  }
  const show = await runCommand(["bun", "run", "--silent", "ideas", "show", slug]);
  if (show.exitCode !== 0) {
    // `ideas show` exits 1 both for a missing idea and for a Mongo outage —
    // only the "no idea:" marker means the slug is actually unknown.
    const reason = firstLine(show.stderr);
    if (reason.startsWith("no idea:")) {
      await interaction.editReply(`slug unknown: ${slug}`);
    } else {
      log("error", `ideas show failed for ${slug}: ${reason}`);
      await interaction.editReply("ideas lookup failed — check listener logs");
    }
    return;
  }
  const idea = JSON.parse(show.stdout) as { status?: string };
  if (idea.status !== "queued") {
    await interaction.editReply(
      `${slug} is ${idea.status}, not queued — only queued ideas can be built`
    );
    return;
  }
  // A finished build never cleans up the thread-handoff file; the new build's
  // tree gets IDEA_SLUG before announceBuildStarted writes the fresh thread
  // id, so a stale id would route its heartbeats into the PREVIOUS build's
  // dead thread (worse if the announce below fails). Remove it up front —
  // sends fall back to #brief until the new thread exists.
  try {
    rmSync(THREAD_HANDOFF_FILE, { force: true });
  } catch (err) {
    log("warn", `couldn't remove stale ${THREAD_HANDOFF_FILE}: ${err}`);
  }
  const start = await runCommand(["bash", "scripts/start-factory.sh", slug]);
  if (start.exitCode !== 0) {
    await interaction.editReply(
      `start-factory failed (exit ${start.exitCode}): ${firstLine(start.stderr)}`
    );
    return;
  }
  log("info", `factory started for ${slug}: ${firstLine(start.stdout)}`);
  let threadNote = "";
  try {
    await announceBuildStarted(config, interaction.client, slug);
  } catch (err) {
    log("error", `build-started announce failed: ${err}`);
    threadNote =
      "\n⚠️ couldn't open the heartbeat thread — heartbeats go to the brief channel, check logs";
  }
  await interaction.editReply(
    `🏭 building ${slug} — heartbeats incoming, /factory-status to check, /abort to stop${threadNote}`
  );
}

/** Shared by /abort and the [Abort] button. Returns the user-facing reply. */
async function performAbort(requestedSlug: string | null): Promise<string> {
  if (mutatingCommandInFlight) return BUSY_REPLY;
  mutatingCommandInFlight = true;
  try {
    return await runAbort(requestedSlug);
  } finally {
    mutatingCommandInFlight = false;
  }
}

async function runAbort(requestedSlug: string | null): Promise<string> {
  const lock = await readLockState();
  if (!lock) return "no build running";
  if (requestedSlug && requestedSlug !== lock.idea_slug) {
    return `running build is ${lock.idea_slug}, not ${requestedSlug} — re-run /abort with no arg to stop it`;
  }
  if (!isValidSlug(lock.idea_slug)) {
    // Never shell out with a slug that fails the injection boundary, even
    // one read back from our own lock doc.
    throw new Error(`lock holds invalid slug: ${JSON.stringify(lock.idea_slug)}`);
  }
  if (!killProcessGroup(lock.pgid)) {
    // Hard failure: do NOT release the lock for a build we never signalled —
    // that would let /build start a second, concurrent build.
    return `⚠️ abort failed: lock holds suspicious pgid ${lock.pgid} — nothing killed, check listener logs`;
  }
  const steps: readonly { readonly name: string; readonly argv: readonly string[] }[] = [
    { name: "lock-release", argv: ["bun", "run", "--silent", "factory", "lock-release", "--slug", lock.idea_slug] },
    // run-abort already finalizes the open run doc (terminator: "aborted",
    // ended_at) as of PR #8 — no extra finalization here.
    { name: "run-abort", argv: ["bun", "run", "--silent", "factory", "run-abort", "--slug", lock.idea_slug] },
    { name: "set-status", argv: ["bun", "run", "--silent", "ideas", "set-status", lock.idea_slug, "queued"] },
  ];
  const failedSteps: string[] = [];
  for (const step of steps) {
    const result = await runCommand(step.argv);
    if (result.exitCode !== 0) {
      log("error", `abort step failed (${step.argv.join(" ")}): ${firstLine(result.stderr)}`);
      failedSteps.push(step.name);
    }
  }
  try {
    rmSync(THREAD_HANDOFF_FILE, { force: true });
  } catch (err) {
    log("warn", `couldn't remove ${THREAD_HANDOFF_FILE}: ${err}`);
  }
  if (failedSteps.length > 0) {
    // Discord is the only operator surface — never report a clean abort when
    // cleanup failed (a held lock silently wedges every subsequent /build).
    return `🛑 killed ${lock.idea_slug} — ⚠️ cleanup failed: ${failedSteps.join(", ")} — re-run /abort to retry, see listener logs`;
  }
  return `🛑 aborted ${lock.idea_slug} — returned to queued, build dir left intact`;
}

async function handleAbort(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const requestedSlug = interaction.options.getString(OPTION_SLUG);
  await interaction.editReply(await performAbort(requestedSlug));
}

async function handleFactoryStatus(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply();
  const lock = await readLockState();
  if (!lock) {
    await interaction.editReply("no build running");
    return;
  }
  const elapsed = formatElapsed(Date.now() - new Date(lock.started_at).getTime());
  await interaction.editReply(
    `🏭 ${lock.idea_slug} running for ~${elapsed}\n\nPer-round heartbeats land in the build thread in the factory channel.`
  );
}

async function handleChatCommand(
  config: DiscordConfig,
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const gate = checkAccess(config, originOf(interaction));
  if (!gate.allowed) {
    log("warn", `/${interaction.commandName} refused — ${gate.reason}`);
    await refuseEphemeral(interaction, "not allowed here");
    return;
  }
  if (isStaleInteraction(interaction.createdTimestamp, Date.now())) {
    log("warn", `/${interaction.commandName} discarded — older than staleness cutoff`);
    await refuseEphemeral(interaction, "stale command discarded — re-issue it");
    return;
  }
  switch (interaction.commandName) {
    case COMMAND_BUILD:
      return handleBuild(config, interaction);
    case COMMAND_ABORT:
      return handleAbort(interaction);
    case COMMAND_FACTORY_STATUS:
      return handleFactoryStatus(interaction);
    default:
      log("warn", `unknown command: /${interaction.commandName}`);
      await refuseEphemeral(interaction, "unknown command");
  }
}

async function handleButton(
  config: DiscordConfig,
  interaction: ButtonInteraction
): Promise<void> {
  const parsed = parseAbortButtonId(interaction.customId);
  if (!parsed.isAbort) return;
  const gate = checkAccess(config, originOf(interaction));
  if (!gate.allowed) {
    log("warn", `abort button refused — ${gate.reason}`);
    await refuseEphemeral(interaction, "not allowed here");
    return;
  }
  if (isStaleInteraction(interaction.createdTimestamp, Date.now())) {
    log("warn", "abort button discarded — older than staleness cutoff");
    return;
  }
  // The slug encoded at button creation scopes the abort to the build the
  // message announced — performAbort's mismatch guard then refuses a tap on
  // an old build-started message instead of killing the current build.
  if (parsed.slug !== null && !isValidSlug(parsed.slug)) {
    log("warn", `abort button discarded — invalid slug in customId: ${interaction.customId}`);
    await refuseEphemeral(interaction, "malformed abort button");
    return;
  }
  await interaction.deferReply();
  await interaction.editReply(await performAbort(parsed.slug));
}

async function handleMessage(config: DiscordConfig, message: Message): Promise<void> {
  if (message.author.bot) return;
  const gate = checkAccess(
    config,
    originOf({
      guildId: message.guildId,
      channelId: message.channelId,
      channel: message.channel,
      user: { id: message.author.id },
    })
  );
  if (!gate.allowed) {
    // Don't reply in places we don't own — just log.
    log("warn", `message ignored — ${gate.reason}`);
    return;
  }
  await message.reply(STATIC_REPLY);
}

// ── client wiring / lifecycle ─────────────────────────────────────────

function wireHandlers(
  config: DiscordConfig,
  client: Client,
  options: { messageContent: boolean }
): void {
  client.on(Events.InteractionCreate, (interaction: Interaction) => {
    void dispatchInteraction(config, interaction);
  });
  if (options.messageContent) {
    client.on(Events.MessageCreate, (message) => {
      handleMessage(config, message).catch((err) =>
        log("error", `message handler failed: ${err}`)
      );
    });
  }
  // No ShardDisconnect handler here: pre-login it surfaces as a login()
  // rejection (handled in connectWithRetry); post-login it is fatal — see
  // installFatalGatewayHandlers.
  client.on(Events.ShardReconnecting, (id) => log("info", `shard ${id} reconnecting`));
  client.on(Events.ShardResume, (id, replayed) =>
    log("info", `shard ${id} resumed (${replayed} events replayed)`)
  );
  client.on(Events.ShardError, (err) => log("error", `shard error: ${err}`));
  client.on(Events.Error, (err) => log("error", `client error: ${err}`));
  client.on(Events.Warn, (message) => log("warn", `client warn: ${message}`));
}

async function dispatchInteraction(
  config: DiscordConfig,
  interaction: Interaction
): Promise<void> {
  try {
    if (interaction.isAutocomplete()) return await handleAutocomplete(config, interaction);
    if (interaction.isChatInputCommand()) return await handleChatCommand(config, interaction);
    if (interaction.isButton()) return await handleButton(config, interaction);
  } catch (err) {
    // 10062 Unknown interaction (token expired) and friends — log, never crash.
    log("error", `interaction handler failed: ${err}`);
    if (interaction.isRepliable()) {
      const content = "internal error — check listener logs";
      await (interaction.deferred || interaction.replied
        ? interaction.editReply({ content })
        : interaction.reply({ content, flags: MessageFlags.Ephemeral })
      ).catch(() => {});
    }
  }
}

function isInvalidTokenError(err: unknown): boolean {
  const code = (err as { code?: unknown })?.code;
  const message = err instanceof Error ? err.message : String(err);
  return code === "TokenInvalid" || /token.*invalid|invalid.*token/i.test(message);
}

function isDisallowedIntentsError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /disallowed intents/i.test(message);
}

function backoffDelay(attempt: number): number {
  return LOGIN_BACKOFF_MS[Math.min(attempt, LOGIN_BACKOFF_MS.length - 1)]!;
}

/**
 * Connect with retry. Privileged-intent rejection degrades to slash-commands
 * only (a failed-login client can't be reused — rebuild). Invalid token and
 * (in --once mode) exhausted retries are the only exits.
 */
async function connectWithRetry(
  config: DiscordConfig,
  onceMode: boolean
): Promise<Client> {
  let useFallbackIntents = false;
  for (let attempt = 0; ; attempt++) {
    const client = new Client({
      intents: useFallbackIntents ? FALLBACK_INTENTS : FULL_INTENTS,
    });
    wireHandlers(config, client, { messageContent: !useFallbackIntents });
    try {
      await client.login(config.botToken);
      if (useFallbackIntents) {
        log(
          "warn",
          "MessageContent intent unavailable — free-form replies disabled, slash commands still work"
        );
      }
      installFatalGatewayHandlers(client);
      return client;
    } catch (err) {
      // Drop handlers first: destroy() emits gateway events, and a stray
      // ShardDisconnect must not be mistaken for a post-login fatal.
      client.removeAllListeners();
      await client.destroy().catch(() => {});
      if (isDisallowedIntentsError(err) && !useFallbackIntents) {
        log("warn", `login rejected for privileged intents — retrying without MessageContent`);
        useFallbackIntents = true;
        continue;
      }
      if (isInvalidTokenError(err)) {
        log("error", "fatal: DISCORD_BOT_TOKEN is invalid");
        process.exit(1);
      }
      if (onceMode && attempt + 1 >= ONCE_MODE_MAX_LOGIN_ATTEMPTS) {
        log("error", `fatal (--once): login still failing after ${attempt + 1} attempts: ${err}`);
        process.exit(1);
      }
      const delay = backoffDelay(attempt);
      log("error", `login failed (transient): ${err} — retrying in ${delay}ms`);
      await Bun.sleep(delay);
    }
  }
}

/**
 * Post-login only. In discord.js v14, Events.ShardDisconnect fires ONLY for
 * UNRECOVERABLE close codes (4004 rotated token, 4013/4014 intents, …) — the
 * shard is destroyed and never reconnects, so staying up means a zombie
 * daemon that launchd KeepAlive can't heal (the exact silent-listener outage
 * this migration exists to kill). Exit instead: KeepAlive restarts us into
 * connectWithRetry, which classifies the failure at login (fatal token /
 * intents fallback / backoff). Pre-login these closes reject login() and are
 * handled there, which is why this is not wired in wireHandlers.
 * Events.Invalidated is defined-but-never-emitted in 14.26.4; handled anyway
 * in case a future discord.js re-enables it.
 */
function installFatalGatewayHandlers(client: Client): void {
  client.on(Events.ShardDisconnect, (event, id) => {
    log(
      "error",
      `shard ${id} disconnected with unrecoverable close code ${event.code} — exiting so launchd restarts the listener`
    );
    process.exit(1);
  });
  client.on(Events.Invalidated, () => {
    log("error", "gateway session invalidated — exiting so launchd restarts the listener");
    process.exit(1);
  });
}

function installProcessGuards(): void {
  // KeepAlive daemons must not die on stray async errors — log and live on.
  process.on("unhandledRejection", (reason) =>
    log("error", `unhandledRejection: ${reason}`)
  );
  process.on("uncaughtException", (err) =>
    log("error", `uncaughtException: ${err?.stack ?? err}`)
  );
}

function installShutdownHandlers(client: Client): void {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      log("info", `${signal} — shutting down`);
      client.removeAllListeners(); // intentional teardown — drop reconnect noise
      void Promise.allSettled([client.destroy(), closeMongo()]).then(() =>
        process.exit(0)
      );
    });
  }
}

async function waitForReady(client: Client): Promise<void> {
  if (client.isReady()) return;
  await new Promise<void>((resolve) =>
    client.once(Events.ClientReady, () => resolve())
  );
}

async function main(): Promise<void> {
  const onceMode = process.argv.includes("--once");
  mkdirSync(LOG_DIR, { recursive: true });

  let config: DiscordConfig;
  try {
    config = loadDiscordConfig(process.env);
  } catch (err) {
    // Fatal: bad config. Message names missing keys only — never values.
    log("error", `fatal: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  installProcessGuards();
  const client = await connectWithRetry(config, onceMode);
  installShutdownHandlers(client);
  await waitForReady(client);
  log("info", `gateway ready as ${client.user?.tag ?? "unknown"}${onceMode ? " (--once)" : ""}`);

  if (onceMode) {
    client.removeAllListeners(); // intentional teardown — drop reconnect noise
    await client.destroy();
    await closeMongo();
    log("info", "--once smoke OK");
    process.exit(0);
  }
}

if (import.meta.main) {
  await main();
}
