import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function fail(message) {
  process.stderr.write(`[play-notices] ERROR: ${message}\n`);
  process.exit(1);
}

const metadataResult = spawnSync(
  "cargo",
  [
    "metadata",
    "--locked",
    "--format-version",
    "1",
    "--manifest-path",
    "src-tauri/Cargo.toml",
    "--filter-platform",
    "x86_64-pc-windows-msvc",
  ],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);
if (metadataResult.error) fail(`could not run cargo metadata: ${metadataResult.error.message}`);
if (metadataResult.status !== 0) {
  fail(`cargo metadata failed (exit code ${metadataResult.status}):\n${metadataResult.stderr.trim()}`);
}

let cargoMetadata;
try {
  cargoMetadata = JSON.parse(metadataResult.stdout);
} catch {
  fail("cargo metadata did not return valid JSON.");
}

let packageLock;
try {
  packageLock = JSON.parse(readFileSync("package-lock.json", "utf8"));
} catch (error) {
  fail(`could not read package-lock.json: ${error.message}`);
}

const resolvedCargoIds = new Set((cargoMetadata.resolve?.nodes ?? []).map((node) => node.id));
const rootId = cargoMetadata.resolve?.root;
const cargoPackages = cargoMetadata.packages
  .filter((pkg) => resolvedCargoIds.has(pkg.id) && pkg.id !== rootId)
  .map((pkg) => ({
    name: pkg.name,
    version: pkg.version,
    license: pkg.license?.trim() || (pkg.license_file ? `SEE ${pkg.license_file}` : ""),
  }))
  .sort((left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version));

const npmPackages = Object.entries(packageLock.packages ?? {})
  .filter(([path, pkg]) => path.startsWith("node_modules/") && pkg.dev !== true)
  .map(([path, pkg]) => ({
    name: pkg.name || path.slice("node_modules/".length),
    version: pkg.version || "unknown-version",
    license: typeof pkg.license === "string" ? pkg.license.trim() : "",
  }))
  .sort((left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version));

const missing = [
  ...cargoPackages.filter((pkg) => !pkg.license).map((pkg) => `Cargo: ${pkg.name}@${pkg.version}`),
  ...npmPackages.filter((pkg) => !pkg.license).map((pkg) => `npm: ${pkg.name}@${pkg.version}`),
];
if (missing.length) {
  fail(`license metadata is missing for ${missing.length} dependency package(s):\n${missing.map((item) => `- ${item}`).join("\n")}`);
}

const version = packageLock.packages?.[""]?.version || packageLock.version || "unknown";
const lines = [
  `Lalin Play ${version} — third-party dependency license inventory`,
  `Generated: ${new Date().toISOString()}`,
  "",
  "This inventory records license metadata for resolved dependencies. It is not a substitute for reviewing and satisfying each license's terms.",
  "Lalin Play itself is licensed under the MIT License (apps/play-desktop/LICENSE).",
  "",
  "Rust dependencies (Cargo metadata, Windows x86_64 target):",
  ...cargoPackages.map((pkg) => `- ${pkg.name} ${pkg.version} — ${pkg.license}`),
  "",
  "Production npm dependencies (package-lock.json; dev-only packages excluded):",
  ...npmPackages.map((pkg) => `- ${pkg.name} ${pkg.version} — ${pkg.license}`),
  "",
];

writeFileSync(resolve("THIRD_PARTY_NOTICES.txt"), lines.join("\n"), "utf8");
process.stdout.write(`[play-notices] Generated THIRD_PARTY_NOTICES.txt (${cargoPackages.length} Cargo, ${npmPackages.length} npm packages).\n`);
