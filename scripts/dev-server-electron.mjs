import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Desktop offline-first: always enable local SQLite + sync queue for Electron
 * desktop development (same path as packaged ELECTRON_RUN=true).
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { ELECTRON_RUN_AS_NODE: _ignored, ...baseEnv } = process.env;

const child = spawn("npx", ["tsx", "server.ts"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: {
    ...baseEnv,
    ELECTRON_RUN: "true",
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on("error", (err) => {
  console.error("Failed to start desktop local server:", err.message);
  process.exit(1);
});
