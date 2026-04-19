import { parseStrictJson, safeStringify } from "../utils/json.js";

export class BaseAgent {
  constructor(name, options = {}) {
    this.name = name;
    this.options = options;
  }

  buildPrompt(board, mode) {
    if (mode === "full") {
      return [
        "Solve Sudoku. Strict JSON only.",
        "Rules: digits 1-9; each row/col/3x3 has 1-9 exactly once; never change non-zero clues.",
        'Return exactly: {"solution":[[9x9 integers]]}',
        "No markdown, no extra keys/text.",
        "Board:",
        safeStringify(board),
      ].join("\n");
    }

    return [
      "Solve next Sudoku move. Strict JSON only.",
      "Return one valid move for an empty cell, keep clues unchanged.",
      'Return exactly: {"row":number,"col":number,"value":number}',
      "No markdown, no extra keys/text.",
      "Board:",
      safeStringify(board),
    ].join("\n");
  }

  parseResponse(content) {
    const parsed = parseStrictJson(content);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }
    return { ok: true, value: parsed.value };
  }

  async solve(_board, _mode = "full") {
    throw new Error("solve() not implemented");
  }
}
