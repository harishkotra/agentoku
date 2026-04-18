import { parseStrictJson, safeStringify } from "../utils/json.js";

export class BaseAgent {
  constructor(name, options = {}) {
    this.name = name;
    this.options = options;
  }

  buildPrompt(board, mode) {
    const outputShape =
      mode === "full"
        ? `{
  "solution": [[...9x9 grid...]]
}`
        : `{
  "row": number,
  "col": number,
  "value": number
}`;

    return [
      "You are a Sudoku solving agent.",
      "Rules:",
      "1) Fill digits 1-9.",
      "2) Each row must contain 1-9 exactly once.",
      "3) Each column must contain 1-9 exactly once.",
      "4) Each 3x3 subgrid must contain 1-9 exactly once.",
      "5) Never modify non-zero clues in the input board.",
      "6) Output must be strict JSON only, with no markdown and no extra text.",
      `Mode: ${mode === "full" ? "Return the full solved board." : "Return one valid next move."}`,
      "Input board JSON:",
      safeStringify(board),
      "Output JSON format:",
      outputShape,
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
