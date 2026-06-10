/**
 * discord-register-commands.ts — idempotent guild-scoped registration of the
 * listener's slash commands. PUT overwrites the full guild command set, so
 * re-running is always safe. Run once at deploy (and after editing
 * src/discord/commands.ts).
 *
 *   bun run scripts/discord-register-commands.ts
 *
 * Uses REST only (no gateway). The application id isn't in .env, so it is
 * fetched from GET /applications/@me with the bot token.
 */

import { REST, Routes } from "discord.js";
import { loadDiscordConfig } from "../src/discord/config";
import { buildCommandDefinitions } from "../src/discord/commands";

if (import.meta.main) {
  const config = loadDiscordConfig(process.env);
  const rest = new REST({ version: "10" }).setToken(config.botToken);

  const app = (await rest.get(Routes.currentApplication())) as { id: string };
  const commands = buildCommandDefinitions();

  await rest.put(Routes.applicationGuildCommands(app.id, config.guildId), {
    body: commands,
  });

  const names = commands.map((command) => `/${command.name}`).join(", ");
  console.log(
    `registered ${commands.length} guild commands (${names}) for app ${app.id} in guild ${config.guildId}`
  );
}
