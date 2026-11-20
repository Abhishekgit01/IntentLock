import { spawnSync } from "node:child_process";
import { repositoryRoot } from "./env.mjs";

const result = spawnSync(
  "forge",
  [
    "build",
    "--root",
    repositoryRoot,
    "--out",
    "out-quai",
    "--use",
    "0.8.19",
    "--evm-version",
    "london",
  ],
  {
    cwd: repositoryRoot,
    stdio: "inherit",
    env: Object.fromEntries(
      Object.entries(process.env).filter(
        ([name]) => !/(PRIVATE_KEY|SECRET|TOKEN)/i.test(name),
      ),
    ),
  },
);

if (result.error) {
  console.error(`Could not start Foundry: ${result.error.message}`);
  process.exitCode = 1;
} else if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
}
