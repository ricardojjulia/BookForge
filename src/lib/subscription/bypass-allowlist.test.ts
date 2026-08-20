import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * Every call site of providerChatCompletion()/createProviderClient() bypasses
 * src/lib/lmstudio/orchestrator.ts's selectAndPrepareActiveModel() -- the
 * subscription-tier allowlist gate (src/lib/subscription/enforcement.ts)
 * only runs there. Two such bypasses (Publishing Lab's cloud judge, both LLM
 * connection-test routes) already existed undetected before this was fixed.
 *
 * This test doesn't re-verify each file is correctly gated (see
 * orchestrator.test.ts and the route-level checks for that) -- it exists so
 * a THIRD, future bypass fails CI instead of silently shipping ungated.
 * Adding a new call site requires a deliberate addition to this allowlist,
 * which is the point.
 */
const KNOWN_BYPASS_FILES = [
  // Gated: assertModelAllowedForUser() before providerChatCompletion().
  "src/lib/publishing-lab/run.ts",
  // Gated: assertModelAllowedForUser() before providerChatCompletion(), but
  // only when the caller omits apiKey (their own key isn't billed to us).
  "src/app/api/lmstudio/test/route.ts",
  // Not gated deliberately: only calls createProviderClient() to list
  // models (client.models.list()), never providerChatCompletion() -- no
  // generation tokens are spent, so there's no subscription cost to gate.
  "src/app/api/llm/test/route.ts",
  // The chokepoint itself: selectAndPrepareActiveModel()'s cloud branch is
  // gated inline. Matches here because it defines/re-exports
  // createProviderClient usage, not because it's an ungated bypass.
  "src/lib/lmstudio/orchestrator.ts",
];

describe("providerChatCompletion/createProviderClient bypass allowlist", () => {
  it("has no call sites outside the reviewed allowlist", () => {
    const output = execFileSync(
      "grep",
      ["-rl", "-E", "providerChatCompletion\\(|createProviderClient\\(", "src", "--include=*.ts", "--include=*.tsx"],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    const files = output
      .split("\n")
      .filter(Boolean)
      .filter((file) => !file.includes(".test.") && file !== "src/lib/ai/providers.ts");

    const unexpected = files.filter((file) => !KNOWN_BYPASS_FILES.includes(file));
    expect(unexpected).toEqual([]);

    // Also catch the inverse: an allowlist entry that no longer calls either
    // function (stale entry hiding a real regression elsewhere).
    const missing = KNOWN_BYPASS_FILES.filter((file) => !files.includes(file));
    expect(missing).toEqual([]);
  });
});
