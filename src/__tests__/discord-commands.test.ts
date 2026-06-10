import { describe, test, expect } from "bun:test";
import {
  BUTTON_ABORT_ID,
  COMMAND_ABORT,
  COMMAND_BUILD,
  COMMAND_FACTORY_STATUS,
  OPTION_SLUG,
  abortButtonId,
  buildCommandDefinitions,
  parseAbortButtonId,
} from "../discord/commands";

describe("abort button customId", () => {
  test("round-trips the slug it was created with", () => {
    expect(parseAbortButtonId(abortButtonId("my-idea-7"))).toEqual({
      isAbort: true,
      slug: "my-idea-7",
    });
  });

  test("legacy bare id parses as abort with no slug", () => {
    expect(parseAbortButtonId(BUTTON_ABORT_ID)).toEqual({
      isAbort: true,
      slug: null,
    });
  });

  test("foreign customIds are not abort buttons", () => {
    expect(parseAbortButtonId("factory:other")).toEqual({
      isAbort: false,
      slug: null,
    });
    expect(parseAbortButtonId("factory:abortive")).toEqual({
      isAbort: false,
      slug: null,
    });
    expect(parseAbortButtonId("")).toEqual({ isAbort: false, slug: null });
  });
});

describe("buildCommandDefinitions", () => {
  const definitions = buildCommandDefinitions();

  test("registers exactly the three listener commands", () => {
    expect(definitions.map((d) => d.name).sort()).toEqual(
      [COMMAND_ABORT, COMMAND_BUILD, COMMAND_FACTORY_STATUS].sort()
    );
  });

  test("/build has a required slug option with autocomplete", () => {
    const build = definitions.find((d) => d.name === COMMAND_BUILD)!;
    const slug = build.options?.find((o) => o.name === OPTION_SLUG) as {
      required?: boolean;
      autocomplete?: boolean;
    };
    expect(slug).toBeDefined();
    expect(slug.required).toBe(true);
    expect(slug.autocomplete).toBe(true);
  });

  test("/abort slug option is optional", () => {
    const abort = definitions.find((d) => d.name === COMMAND_ABORT)!;
    const slug = abort.options?.find((o) => o.name === OPTION_SLUG) as {
      required?: boolean;
    };
    expect(slug).toBeDefined();
    expect(slug.required ?? false).toBe(false);
  });
});
