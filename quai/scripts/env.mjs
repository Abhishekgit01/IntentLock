import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const quaiDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const repositoryRoot = path.resolve(quaiDir, "..");

export function loadQuaiEnv() {
  const file = path.join(quaiDir, ".env.quai");
  let contents = "";
  try {
    contents = readFileSync(file, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1)
      throw new Error("Invalid .env.quai line; expected KEY=value.");
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(key))
      throw new Error("Invalid key in .env.quai.");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required; set it in quai/.env.quai.`);
  return value;
}

export function assertOrchardRpcUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "orchard.rpc.quai.network" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "QUAI_RPC_URL must use the official HTTPS Orchard RPC host from docs.qu.ai.",
    );
  }
  return url.toString();
}
