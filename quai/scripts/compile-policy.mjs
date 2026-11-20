import path from "node:path";
import { compileDeploymentPolicy, resolvePolicyFile } from "./policy.mjs";
import { quaiDir } from "./env.mjs";

try {
  const policyFile = resolvePolicyFile(process.argv[2]);
  const result = compileDeploymentPolicy(policyFile);
  console.log(
    JSON.stringify(
      {
        source: "shared_backend_policy_compiler",
        policyFile: path.join("quai", path.relative(quaiDir, policyFile)),
        policyHash: result.policyHash,
        policy: result.policy,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(`Policy compile failed: ${error.message}`);
  process.exitCode = 1;
}
