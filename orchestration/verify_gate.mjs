// verify_gate.mjs — deterministic Verify Gate สำหรับ micro-task ของ local model
// (SPEC--LOCAL-LLM-DISPATCH-V2 §10: tsc + assertion บน visible + holdout — ไม่มี LLM ตัดสิน)
// ใช้: node verify_gate.mjs <file.ts> <taskId> [--skip-tsc]
// stdout: JSON ผลตรวจ · exit 0 = gate pass, 1 = fail

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "..", "frontend", "package.json"));
const esbuild = require("esbuild");

const [, , tsFile, taskId, ...flags] = process.argv;
const skipTsc = flags.includes("--skip-tsc");

const tasks = JSON.parse(readFileSync(join(here, "bench_tasks.json"), "utf8")).tasks;
const task = tasks.find((t) => t.id === taskId);
if (!task) {
  console.log(JSON.stringify({ gate: "fail", error: `unknown task ${taskId}` }));
  process.exit(1);
}

const result = {
  task: taskId, tsc_ok: null, transform_ok: false, run_ok: false,
  visible_pass: false, holdout_pass: false, gate: "fail", failures: [],
};

const src = readFileSync(tsFile, "utf8");

// --- 1) tsc --noEmit --strict (ต่อไฟล์, ใช้ typescript ของ frontend) ---
if (!skipTsc) {
  const tscJs = join(here, "..", "frontend", "node_modules", "typescript", "lib", "tsc.js");
  const tsc = spawnSync(process.execPath, [tscJs, "--noEmit", "--strict", "--target", "es2022", "--lib", "es2022", tsFile], { encoding: "utf8", timeout: 120000 });
  result.tsc_ok = tsc.status === 0;
  if (!result.tsc_ok) result.failures.push({ kind: "tsc", detail: (tsc.stdout || "").slice(0, 800) });
}

// --- 2) transform TS -> CJS แล้วรันใน sandbox ---
let exportsObj = {};
try {
  const js = esbuild.transformSync(src, { loader: "ts", format: "cjs", target: "es2022" }).code;
  result.transform_ok = true;
  const mod = { exports: {} };
  new Function("module", "exports", js)(mod, mod.exports);
  exportsObj = mod.exports;
  result.run_ok = true;
} catch (e) {
  result.failures.push({ kind: "run", detail: String(e).slice(0, 400) });
}

// --- 3) assertion: deep-equal พร้อม eps สำหรับตัวเลข ---
const EPS = 1e-6;
function close(a, b, eps) {
  if (typeof a === "number" && typeof b === "number") {
    if (Number.isNaN(a) && Number.isNaN(b)) return true;
    return Math.abs(a - b) <= eps;
  }
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => close(v, b[i], eps));
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => close(a[k], b[k], eps));
  }
  return a === b;
}

function runChecks(checks, label) {
  if (!result.run_ok) return false;
  let ok = true;
  const names = Object.keys(exportsObj);
  const header = names.map((n) => `const ${n} = __x[${JSON.stringify(n)}];`).join("\n");
  for (const c of checks) {
    try {
      const expr = c.assert ?? c.call;
      const got = new Function("__x", `${header}\nreturn (${expr});`)(exportsObj);
      const pass = c.assert ? got === true : close(got, c.expect, c.eps ?? EPS);
      if (!pass) {
        ok = false;
        result.failures.push({ kind: label, expr, got: JSON.stringify(got)?.slice(0, 200), want: c.assert ? "true" : JSON.stringify(c.expect) });
      }
    } catch (e) {
      ok = false;
      result.failures.push({ kind: label, expr: c.assert ?? c.call, got: `throw: ${String(e).slice(0, 200)}` });
    }
  }
  return ok;
}

result.visible_pass = runChecks(task.checks_visible, "visible");
result.holdout_pass = runChecks(task.checks_holdout, "holdout");
result.gate =
  (skipTsc || result.tsc_ok) && result.run_ok && result.visible_pass && result.holdout_pass
    ? "pass" : "fail";

console.log(JSON.stringify(result));
process.exit(result.gate === "pass" ? 0 : 1);
