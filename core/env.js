import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let loaded = false;

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const sep = trimmed.indexOf("=");
  if (sep === -1) return null;

  const key = trimmed.slice(0, sep).trim();
  if (!key) return null;

  let value = trimmed.slice(sep + 1).trim();

  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

export function bootstrapEnv() {
  if (loaded) return;

  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(moduleDir, "..");
  const candidates = [path.resolve(process.cwd(), ".env"), path.resolve(projectRoot, ".env")];
  const envPath = candidates.find((p) => existsSync(p));

  if (!envPath) {
    loaded = true;
    return;
  }

  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;

    process.env[parsed.key] = parsed.value;
  }

  loaded = true;
}
