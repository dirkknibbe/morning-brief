/**
 * commands.ts — slash command definitions (guild-scoped).
 *
 * Single source of truth for command/option names: the register script PUTs
 * these, the listener dispatches on them.
 */

import { SlashCommandBuilder } from "discord.js";
import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from "discord.js";

export const COMMAND_BUILD = "build";
export const COMMAND_ABORT = "abort";
export const COMMAND_FACTORY_STATUS = "factory-status";
export const OPTION_SLUG = "slug";

/** customId prefix of the [Abort] button on the build-started message. */
export const BUTTON_ABORT_ID = "factory:abort";

/**
 * Slug-bound customId: buttons on old build-started messages stay clickable
 * forever, so each must name the build it announced — performAbort's
 * slug-mismatch guard then refuses a stale tap instead of killing whatever
 * build happens to be running.
 */
export function abortButtonId(slug: string): string {
  return `${BUTTON_ABORT_ID}:${slug}`;
}

export interface AbortButtonParse {
  readonly isAbort: boolean;
  readonly slug: string | null;
}

/** Parse an interaction customId; bare BUTTON_ABORT_ID (legacy) → null slug. */
export function parseAbortButtonId(customId: string): AbortButtonParse {
  if (customId === BUTTON_ABORT_ID) return { isAbort: true, slug: null };
  if (customId.startsWith(`${BUTTON_ABORT_ID}:`)) {
    return { isAbort: true, slug: customId.slice(BUTTON_ABORT_ID.length + 1) };
  }
  return { isAbort: false, slug: null };
}

export function buildCommandDefinitions(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  const build = new SlashCommandBuilder()
    .setName(COMMAND_BUILD)
    .setDescription("Start a factory build for a queued idea")
    .addStringOption((option) =>
      option
        .setName(OPTION_SLUG)
        .setDescription("Idea slug (autocompletes from queued ideas)")
        .setRequired(true)
        .setAutocomplete(true)
    );

  const abort = new SlashCommandBuilder()
    .setName(COMMAND_ABORT)
    .setDescription("Stop the running factory build")
    .addStringOption((option) =>
      option
        .setName(OPTION_SLUG)
        .setDescription("Optional: only abort if this slug is the one running")
        .setRequired(false)
    );

  const factoryStatus = new SlashCommandBuilder()
    .setName(COMMAND_FACTORY_STATUS)
    .setDescription("Check whether a factory build is running");

  return [build, abort, factoryStatus].map((command) => command.toJSON());
}
