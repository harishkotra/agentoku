import {
  applyMove,
  cloneBoard,
  isBoardShapeValid,
  isBoardValid,
  isSolved,
  preserveClues,
} from "./sudoku.js";
import { elapsedMs, nowMs, withTimeout } from "../utils/timer.js";

function makeBaseResult(agentName) {
  return {
    agent: agentName,
    status: "failed",
    attempts: 0,
    invalidMoveCount: 0,
    timeoutCount: 0,
    elapsedMs: 0,
    reason: null,
    board: null,
  };
}

function validateFullResponse(payload, basePuzzle) {
  const candidate = payload?.solution;
  if (!isBoardShapeValid(candidate)) {
    return { ok: false, reason: "Malformed solution shape" };
  }
  if (!preserveClues(basePuzzle, candidate)) {
    return { ok: false, reason: "Modified given clues" };
  }
  if (!isBoardValid(candidate)) {
    return { ok: false, reason: "Board violates Sudoku constraints" };
  }
  if (!isSolved(candidate)) {
    return { ok: false, reason: "Board is not fully solved" };
  }
  return { ok: true, board: candidate };
}

function validateStepResponse(payload, board, basePuzzle) {
  const row = payload?.row;
  const col = payload?.col;
  const value = payload?.value;

  if (![row, col, value].every(Number.isInteger)) {
    return { ok: false, reason: "Step response missing integer row/col/value" };
  }

  const working = cloneBoard(board);
  const applied = applyMove(working, row, col, value);
  if (!applied) {
    return { ok: false, reason: "Invalid move" };
  }

  if (!preserveClues(basePuzzle, working)) {
    return { ok: false, reason: "Modified given clues" };
  }

  return { ok: true, board: working, move: { row, col, value } };
}

function wait(ms) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function solveInFullMode(agent, puzzle, options, onProgress) {
  const result = makeBaseResult(agent.name);
  const started = nowMs();

  for (let attempt = 1; attempt <= options.retries; attempt += 1) {
    result.attempts = attempt;
    onProgress?.(`${agent.name}: full attempt ${attempt}/${options.retries}`);

    try {
      const payload = await withTimeout(() => agent.solve(cloneBoard(puzzle), "full"), options.timeoutMs);
      const validity = validateFullResponse(payload, puzzle);

      if (validity.ok) {
        result.status = "solved";
        result.board = validity.board;
        result.elapsedMs = elapsedMs(started);
        return result;
      }

      result.reason = validity.reason;
    } catch (error) {
      if (error.message === "TIMEOUT") {
        result.status = "timeout";
        result.reason = "Timed out";
        result.elapsedMs = elapsedMs(started);
        return result;
      }
      result.reason = error.message;
    }
  }

  result.status = "invalid";
  result.elapsedMs = elapsedMs(started);
  return result;
}

async function solveInStepMode(agent, puzzle, options, onProgress) {
  const result = makeBaseResult(agent.name);
  const started = nowMs();
  let board = cloneBoard(puzzle);

  for (let step = 1; step <= options.maxSteps; step += 1) {
    let stepApplied = false;

    for (let attempt = 1; attempt <= options.retries; attempt += 1) {
      result.attempts += 1;
      onProgress?.(`${agent.name}: step ${step}, attempt ${attempt}/${options.retries}`);

      try {
        const payload = await withTimeout(() => agent.solve(cloneBoard(board), "step"), options.timeoutMs);
        const validity = validateStepResponse(payload, board, puzzle);

        if (!validity.ok) {
          result.reason = validity.reason;
          continue;
        }

        board = validity.board;
        stepApplied = true;

        if (!isBoardValid(board)) {
          result.status = "invalid";
          result.reason = "Board became invalid";
          result.elapsedMs = elapsedMs(started);
          return result;
        }

        if (isSolved(board)) {
          result.status = "solved";
          result.board = board;
          result.elapsedMs = elapsedMs(started);
          return result;
        }

        break;
      } catch (error) {
        if (error.message === "TIMEOUT") {
          result.status = "timeout";
          result.reason = "Timed out";
          result.elapsedMs = elapsedMs(started);
          return result;
        }
        result.reason = error.message;
      }
    }

    if (!stepApplied) {
      result.status = "invalid";
      result.reason = result.reason ?? "No valid move produced";
      result.elapsedMs = elapsedMs(started);
      return result;
    }
  }

  result.status = "invalid";
  result.reason = result.reason ?? "Max steps reached without solving";
  result.elapsedMs = elapsedMs(started);
  return result;
}

export async function runAgentStepwise({
  agent,
  puzzle,
  timeoutMs,
  retries,
  maxSteps,
  stepDelayMs = 0,
  maxInvalidMoves = Infinity,
  maxTimeouts = 4,
  onEvent,
}) {
  const result = makeBaseResult(agent.name);
  const started = nowMs();
  let board = cloneBoard(puzzle);

  onEvent?.({
    type: "started",
    board: cloneBoard(board),
    elapsedMs: 0,
    attempts: 0,
    invalidMoveCount: result.invalidMoveCount,
    timeoutCount: result.timeoutCount,
  });

  for (let step = 1; step <= maxSteps; step += 1) {
    let stepApplied = false;

    for (let attempt = 1; attempt <= retries; attempt += 1) {
      result.attempts += 1;
      onEvent?.({
        type: "attempt",
        step,
        attempt,
        retries,
        attempts: result.attempts,
        elapsedMs: elapsedMs(started),
        invalidMoveCount: result.invalidMoveCount,
        timeoutCount: result.timeoutCount,
      });

      try {
        const payload = await withTimeout(() => agent.solve(cloneBoard(board), "step"), timeoutMs);
        const validity = validateStepResponse(payload, board, puzzle);

        if (!validity.ok) {
          result.invalidMoveCount += 1;
          result.reason = validity.reason;
          onEvent?.({
            type: "invalid_output",
            step,
            attempt,
            reason: result.reason,
            attempts: result.attempts,
            elapsedMs: elapsedMs(started),
            invalidMoveCount: result.invalidMoveCount,
            timeoutCount: result.timeoutCount,
          });

          if (result.invalidMoveCount >= maxInvalidMoves) {
            result.status = "invalid";
            result.reason = `Too many invalid moves (${result.invalidMoveCount})`;
            result.elapsedMs = elapsedMs(started);
            onEvent?.({ type: "finished", ...result });
            return result;
          }
          continue;
        }

        board = validity.board;
        stepApplied = true;

        onEvent?.({
          type: "move",
          step,
          move: validity.move,
          board: cloneBoard(board),
          attempts: result.attempts,
          elapsedMs: elapsedMs(started),
          invalidMoveCount: result.invalidMoveCount,
          timeoutCount: result.timeoutCount,
        });

        if (!isBoardValid(board)) {
          result.status = "invalid";
          result.reason = "Board became invalid";
          result.elapsedMs = elapsedMs(started);
          onEvent?.({ type: "finished", ...result });
          return result;
        }

        if (isSolved(board)) {
          result.status = "solved";
          result.board = board;
          result.elapsedMs = elapsedMs(started);
          onEvent?.({ type: "finished", ...result });
          return result;
        }

        await wait(stepDelayMs);
        break;
      } catch (error) {
        if (error.message === "TIMEOUT") {
          result.timeoutCount += 1;
          result.reason = "Timed out";
          onEvent?.({
            type: "timeout",
            step,
            attempt,
            reason: result.reason,
            attempts: result.attempts,
            elapsedMs: elapsedMs(started),
            invalidMoveCount: result.invalidMoveCount,
            timeoutCount: result.timeoutCount,
          });

          if (result.timeoutCount >= maxTimeouts) {
            result.status = "timeout";
            result.reason = `Timed out too many times (${result.timeoutCount})`;
            result.elapsedMs = elapsedMs(started);
            onEvent?.({ type: "finished", ...result });
            return result;
          }
          continue;
        }

        result.reason = error.message;
        onEvent?.({
          type: "error",
          step,
          attempt,
          reason: result.reason,
          attempts: result.attempts,
          elapsedMs: elapsedMs(started),
          invalidMoveCount: result.invalidMoveCount,
          timeoutCount: result.timeoutCount,
        });
      }
    }

    if (!stepApplied) {
      onEvent?.({
        type: "step_skipped",
        step,
        reason: result.reason ?? "No valid move produced",
        attempts: result.attempts,
        elapsedMs: elapsedMs(started),
        invalidMoveCount: result.invalidMoveCount,
        timeoutCount: result.timeoutCount,
      });
      await wait(stepDelayMs);
      continue;
    }
  }

  result.status = "invalid";
  result.reason =
    result.reason ??
    `Max steps reached without solving (invalidMoves=${result.invalidMoveCount}, timeouts=${result.timeoutCount})`;
  result.elapsedMs = elapsedMs(started);
  onEvent?.({ type: "finished", ...result });
  return result;
}

export async function runCompetition({ agents, puzzle, mode, timeoutMs, retries, maxSteps, onProgress }) {
  const sharedOptions = { timeoutMs, retries, maxSteps };

  const jobs = agents.map(async (agent) => {
    if (mode === "step") {
      return solveInStepMode(agent, puzzle, sharedOptions, onProgress);
    }
    return solveInFullMode(agent, puzzle, sharedOptions, onProgress);
  });

  const results = await Promise.all(jobs);
  const winner = pickWinner(results);
  return { results, winner };
}

function pickWinner(results) {
  const solved = results.filter((r) => r.status === "solved");
  if (solved.length === 0) return null;
  solved.sort((a, b) => a.elapsedMs - b.elapsedMs);
  return solved[0];
}
