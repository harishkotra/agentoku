import { formatMs } from "./timer.js";

export function boardToPrettyString(board) {
  const lines = [];
  for (let row = 0; row < 9; row += 1) {
    const cells = board[row].map((v) => (v === 0 ? "." : String(v)));
    lines.push(
      `${cells.slice(0, 3).join(" ")} | ${cells.slice(3, 6).join(" ")} | ${cells.slice(6, 9).join(" ")}`,
    );
    if (row === 2 || row === 5) {
      lines.push("------+-------+------");
    }
  }
  return lines.join("\n");
}

export function renderAgentStatus(result) {
  const base = `Agent: ${result.agent}`;
  if (result.status === "solved") {
    return `${base} -> Solved in ${formatMs(result.elapsedMs)} ✅ (attempts: ${result.attempts})`;
  }
  if (result.status === "invalid") {
    return `${base} -> Invalid solution ❌ (attempts: ${result.attempts})`;
  }
  if (result.status === "timeout") {
    return `${base} -> Timeout ⏱ (attempts: ${result.attempts})`;
  }
  return `${base} -> Failed: ${result.reason ?? "unknown"} ❌ (attempts: ${result.attempts})`;
}

export function renderLeaderboard(results) {
  const sorted = [...results].sort((a, b) => {
    const scoreA = scoreForSort(a);
    const scoreB = scoreForSort(b);
    if (scoreA !== scoreB) return scoreA - scoreB;
    return a.elapsedMs - b.elapsedMs;
  });

  const lines = ["\nLeaderboard:"];
  sorted.forEach((r, index) => {
    lines.push(
      `${index + 1}. ${r.agent.padEnd(14)} | ${r.status.padEnd(7)} | ${formatMs(r.elapsedMs).padEnd(8)} | attempts=${r.attempts}`,
    );
  });
  return lines.join("\n");
}

function scoreForSort(result) {
  if (result.status === "solved") return 0;
  if (result.status === "invalid") return 1;
  if (result.status === "timeout") return 2;
  return 3;
}
