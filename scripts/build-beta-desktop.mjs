import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function run(command, args, cwd = root, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function getBaseVersion() {
  const pkgRaw = readFileSync(join(root, "package.json"), "utf8");
  const pkg = JSON.parse(pkgRaw);
  if (!pkg.version || typeof pkg.version !== "string") {
    throw new Error("Missing version in package.json");
  }
  return pkg.version;
}

function buildBetaVersion(baseVersion) {
  const custom = process.env.BETA_VERSION?.trim();
  if (custom) return custom;

  const now = new Date();
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
    String(now.getUTCHours()).padStart(2, "0"),
    String(now.getUTCMinutes()).padStart(2, "0"),
  ].join("");
  return `${baseVersion}-beta.${stamp}`;
}

const baseVersion = getBaseVersion();
const betaVersion = buildBetaVersion(baseVersion);

console.log(`Building Hello Darzi Beta ${betaVersion}`);

run("node", ["scripts/prepare-desktop-env.cjs"]);
run("npm", ["run", "build:all"]);
run("npm", ["run", "electron:rebuild-native"]);
run("npx", [
  "electron-builder",
  "--win",
  "--x64",
  "--config",
  "electron-builder.beta.json",
  "--config.extraMetadata.version=" + betaVersion,
], join(root, "apps", "desktop"), {
  // Unsigned beta builds for internal testing.
  CSC_IDENTITY_AUTO_DISCOVERY: "false",
});
