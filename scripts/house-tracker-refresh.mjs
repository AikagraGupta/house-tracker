#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function runNodeScript(scriptPath) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: rootDir,
      stdio: "inherit"
    });

    child.on("close", resolve);
  });
}

const scanCode = await runNodeScript(path.join(rootDir, "scripts", "house-tracker.mjs"));

if (scanCode !== 0) {
  process.exit(scanCode ?? 1);
}

const syncCode = await runNodeScript(path.join(rootDir, "scripts", "sync-public-data.mjs"));
process.exit(syncCode ?? 0);
