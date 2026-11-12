import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SRC = readFileSync(new URL("../run-extract.sh", import.meta.url), "utf8");

// Copy the wrapper into a sandbox repo, with a stub `bun` exiting `bunExit`.
// The /tmp dedupe marker is redirected into the sandbox so the real one is untouched.
async function runWrapper(bunExit: 0 | 1) {
  const root = mkdtempSync(join(tmpdir(), "run-extract-"));
  const marker = join(root, "last-run");
  mkdirSync(join(root, "scripts"));
  writeFileSync(
    join(root, "scripts/run-extract.sh"),
    SRC.replace('"/tmp/morning-brief-${STEM}-last-run"', `"${marker}"`),
  );
  const bunDir = join(root, "home/.bun/bin");
  mkdirSync(bunDir, { recursive: true });
  // Symlink to a system binary: a freshly written executable triggers a slow
  // first-run macOS security assessment that can blow the test timeout.
  symlinkSync(bunExit === 0 ? "/usr/bin/true" : "/usr/bin/false", join(bunDir, "bun"));

  const p = Bun.spawn(["bash", join(root, "scripts/run-extract.sh")], {
    env: { HOME: join(root, "home"), PATH: "/usr/bin:/bin" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const code = await p.exited;
  const logFile = readdirSync(join(root, "logs"))[0];
  const log = readFileSync(join(root, "logs", logFile), "utf8");
  return { code, log, markerExists: existsSync(marker) };
}

test("failed extract: exits non-zero, logs the real status, clears the dedupe marker", async () => {
  const r = await runWrapper(1);
  expect(r.code).toBe(1);
  expect(r.log).toContain("finished extract (exit 1)");
  expect(r.markerExists).toBe(false);
});

test("successful extract: exits 0 and keeps the dedupe marker", async () => {
  const r = await runWrapper(0);
  expect(r.code).toBe(0);
  expect(r.log).toContain("finished extract (exit 0)");
  expect(r.markerExists).toBe(true);
});
