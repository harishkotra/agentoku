import { buildAgents } from "./agents/index.js";
import { loadConfig } from "./core/config.js";
import { runCompetition } from "./core/orchestrator.js";
import { getPuzzle } from "./core/puzzles.js";
import { boardToPrettyString, renderAgentStatus, renderLeaderboard } from "./utils/format.js";

async function main() {
  const config = loadConfig();
  const puzzle = getPuzzle(config.general.puzzleLevel);
  const agents = buildAgents(config);

  if (agents.length === 0) {
    console.error("No agents enabled/configured. Set API keys or enable local providers.");
    process.exitCode = 1;
    return;
  }

  console.log("=== AI Sudoku Agent Race ===");
  console.log(`Mode: ${config.general.mode}`);
  console.log(`Puzzle: ${config.general.puzzleLevel}`);
  console.log("\nInitial Puzzle:\n");
  console.log(boardToPrettyString(puzzle));
  console.log("\nStarting agents in parallel...\n");

  const { results, winner } = await runCompetition({
    agents,
    puzzle,
    mode: config.general.mode,
    timeoutMs: config.general.timeoutMs,
    retries: config.general.retries,
    maxSteps: config.general.maxSteps,
    onProgress: (message) => {
      if (config.general.verbose) {
        console.log(`[progress] ${message}`);
      }
    },
  });

  for (const result of results) {
    console.log(renderAgentStatus(result));
  }

  console.log(renderLeaderboard(results));

  if (winner) {
    console.log(`\nWinner: ${winner.agent}`);
  } else {
    console.log("\nWinner: none (no valid solution)");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exitCode = 1;
});
