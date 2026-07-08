#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_SCRIPT = path.join(ROOT_DIR, "scripts", "house-tracker-refresh.mjs");
const INTERVAL_MS = 3 * 60 * 60 * 1000;

function runScan() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCAN_SCRIPT], {
      cwd: ROOT_DIR,
      stdio: "inherit"
    });

    child.on("close", (code) => {
      if (code !== 0) {
        console.error(`House tracker refresh exited with code ${code}.`);
      }

      resolve();
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

while (true) {
  const startedAt = new Date();
  console.log(`[${startedAt.toISOString()}] Starting house tracker scan.`);
  await runScan();

  const nextRun = new Date(Date.now() + INTERVAL_MS);
  console.log(`[${new Date().toISOString()}] Next scan: ${nextRun.toISOString()}`);
  await sleep(INTERVAL_MS);
}
