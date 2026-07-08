#!/usr/bin/env node

import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(rootDir, "data", "house-tracker", "latest.json");
const destinationDir = path.join(rootDir, "public", "data", "house-tracker");
const destination = path.join(destinationDir, "latest.json");

await mkdir(destinationDir, { recursive: true });
await copyFile(source, destination);

console.log(`Synced ${path.relative(rootDir, source)} to ${path.relative(rootDir, destination)}.`);
