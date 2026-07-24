import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const portFile = path.join(root, ".dev-server-port");
const electronBinary = require("electron");
const timeoutMs = 120_000;
const startedAt = Date.now();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDevServer() {
  while (Date.now() - startedAt < timeoutMs) {
    if (fs.existsSync(portFile)) {
      const port = Number.parseInt(fs.readFileSync(portFile, "utf8").trim(), 10);
      if (Number.isFinite(port) && port > 0) {
        try {
          const response = await fetch(`http://127.0.0.1:${port}/`, {
            signal: AbortSignal.timeout(2000),
          });
          if (response) return port;
        } catch {
          // Server port file can appear slightly before listen is ready.
        }
      }
    }
    await sleep(250);
  }

  throw new Error(
    `Timed out waiting for the Hello Darzi dev server (${portFile}). ` +
      "Start it from the Stich-Master directory with `npm run dev` or `npm run dev:desktop`."
  );
}

const port = await waitForDevServer();
const { ELECTRON_RUN_AS_NODE: _ignored, ...baseEnv } = process.env;
const child = spawn(electronBinary, ["apps/desktop/electron/main.cjs"], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...baseEnv,
    DEV_SERVER_PORT: String(port),
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
  console.error("Failed to start Electron:", err.message);
  process.exit(1);
});
