import path from "node:path";
import { readFileSync } from "node:fs";
import { quaiDir } from "./env.mjs";
import { compilePolicyFile } from "../../backend/src/policy-format.js";

export function resolvePolicyFile(requestedPath = "policy.orchard.json") {
  const policyFile = path.resolve(quaiDir, requestedPath);
  const relativePolicyPath = path.relative(quaiDir, policyFile);
  if (
    relativePolicyPath.startsWith("..") ||
    path.isAbsolute(relativePolicyPath)
  ) {
    throw new Error("Policy file must be inside quai/.");
  }
  return policyFile;
}

export function compileDeploymentPolicy(policyFile) {
  let input;
  try {
    input = JSON.parse(readFileSync(policyFile, "utf8"));
  } catch {
    throw new Error("Policy file must be readable JSON inside quai/.");
  }
  const policyResult = compilePolicyFile(input);
  if (!/^0x[0-9a-fA-F]{64}$/.test(policyResult.policyHash ?? "")) {
    throw new Error(
      "Shared backend policy compiler did not return a valid policyHash.",
    );
  }
  return policyResult;
}
