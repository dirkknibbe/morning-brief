import { test, expect } from "bun:test";

const SCRIPT = new URL("../start-factory.sh", import.meta.url).pathname;

test("exits 2 with usage when no slug is given", async () => {
  const p = Bun.spawn(["bash", SCRIPT], { stdout: "pipe", stderr: "pipe" });
  const code = await p.exited;
  expect(code).toBe(2);
  expect(await new Response(p.stderr).text()).toContain("usage: start-factory.sh");
});

test("script passes bash -n syntax check", async () => {
  const p = Bun.spawn(["bash", "-n", SCRIPT], { stderr: "pipe" });
  const code = await p.exited;
  expect(code).toBe(0);
});

test("launch line detaches a new group (perl setsid), sets factory env, skips dedupe", async () => {
  const src = await Bun.file(SCRIPT).text();
  expect(src).toContain("POSIX::setsid()");
  expect(src).toContain("SKIP_DEDUPE=1");
  expect(src).toContain("MAX_BUDGET_USD=20");
  expect(src).toContain("triggers/factory.md");
});

test("records the group-leader pid ($!) to the pgid file for /abort", async () => {
  const src = await Bun.file(SCRIPT).text();
  expect(src).toContain("LEADER_PGID=$!");
  expect(src).toContain("/tmp/morning-brief-factory.pgid");
});
