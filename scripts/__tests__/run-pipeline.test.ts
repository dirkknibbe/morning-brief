import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SRC = readFileSync(new URL("../run-pipeline.sh", import.meta.url), "utf8");
const ALL = ["scheduled-brief", "action-research", "extract", "synthesize", "triage"];
const DATE = "2026-11-12";

// Stubs are plain files run via `bash`, so no executable bit (and no slow macOS first-run assessment).
const STUB = `
stem="$(basename "\${1:-extract}" .md)"
echo "$stem skip=\${SKIP_DEDUPE:-unset}" >> "$CALLS_FILE"
[ "$stem" = "\${FAIL_STAGE:-}" ] && exit 1
exit 0
`;

async function runPipeline(o: { hour: string | number; failStage?: string; preDone?: string[]; runs?: number }) {
  const root = mkdtempSync(join(tmpdir(), "run-pipeline-"));
  mkdirSync(join(root, "scripts"));
  writeFileSync(join(root, "scripts/run-pipeline.sh"), SRC);
  writeFileSync(join(root, "scripts/run-trigger.sh"), STUB);
  writeFileSync(join(root, "scripts/run-extract.sh"), STUB);
  mkdirSync(join(root, "logs/.done"), { recursive: true });
  for (const s of o.preDone ?? []) writeFileSync(join(root, `logs/.done/${DATE}-${s}`), "");

  const callsFile = join(root, "calls");
  const alertsFile = join(root, "alerts");
  const env = {
    HOME: join(root, "home"),
    PATH: "/usr/bin:/bin",
    PIPELINE_DATE: DATE,
    PIPELINE_HOUR: String(o.hour),
    PIPELINE_SEND: `tee -a ${alertsFile}`,
    CALLS_FILE: callsFile,
    FAIL_STAGE: o.failStage ?? "",
  };
  const codes: number[] = [];
  for (let i = 0; i < (o.runs ?? 1); i++) {
    const p = Bun.spawn(["bash", join(root, "scripts/run-pipeline.sh")], { env, stdout: "pipe", stderr: "pipe" });
    codes.push(await p.exited);
  }
  const lines = existsSync(callsFile) ? readFileSync(callsFile, "utf8").split("\n").filter(Boolean) : [];
  return {
    codes,
    calls: lines.map((l) => l.split(" ")[0]),
    allSkipDedupe: lines.every((l) => l.endsWith("skip=1")),
    alerts: existsSync(alertsFile) ? readFileSync(alertsFile, "utf8") : "",
    done: readdirSync(join(root, "logs/.done")).filter((f) => f !== `${DATE}-alert`),
  };
}

test("runs all stages in order and marks them done", async () => {
  const r = await runPipeline({ hour: 6 });
  expect(r.calls).toEqual(ALL);
  expect(r.allSkipDedupe).toBe(true);
  expect(r.done.sort()).toEqual(ALL.map((s) => `${DATE}-${s}`).sort());
  expect(r.codes).toEqual([0]);
});

test("skips done stages", async () => {
  const r = await runPipeline({ hour: 9, preDone: ALL });
  expect(r.calls).toEqual([]);
  expect(r.codes).toEqual([0]);
});

test("stops at first failure", async () => {
  const r = await runPipeline({ hour: 9, failStage: "scheduled-brief" });
  expect(r.calls).toEqual(["scheduled-brief"]);
  expect(r.codes).toEqual([1]);
  expect(r.done).toEqual([]);
});

test("resumes from the failed stage next hour", async () => {
  const r = await runPipeline({ hour: 14, preDone: ALL.slice(0, 2) });
  expect(r.calls).toEqual(ALL.slice(2));
});

test("outside window does nothing", async () => {
  for (const hour of [5, 18]) {
    const r = await runPipeline({ hour, failStage: "extract" });
    expect(r.calls).toEqual([]);
    expect(r.alerts).toBe("");
    expect(r.codes).toEqual([0]);
  }
});

test("hour 08 and 09 parse as base-10", async () => {
  for (const hour of ["08", "09"]) {
    expect((await runPipeline({ hour })).calls).toEqual(ALL);
  }
});

test("alert once at 17 when incomplete", async () => {
  const r = await runPipeline({ hour: 17, failStage: "extract", runs: 2 });
  for (const s of ["extract", "synthesize", "triage", DATE]) expect(r.alerts).toContain(s);
  expect(r.alerts.trim().split("\n")).toHaveLength(1);
});

test("no alert when complete at 17", async () => {
  expect((await runPipeline({ hour: 17 })).alerts).toBe("");
});

test("no alert before 17", async () => {
  expect((await runPipeline({ hour: 16, failStage: "extract" })).alerts).toBe("");
});
