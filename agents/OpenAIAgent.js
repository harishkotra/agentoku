import OpenAI from "openai";
import { BaseAgent } from "./BaseAgent.js";

export class OpenAIAgent extends BaseAgent {
  constructor({ apiKey, model = "gpt-4o-mini", timeoutMs = 30000 }) {
    super("OpenAI", { apiKey, model, timeoutMs });
    this.client = new OpenAI({ apiKey, timeout: timeoutMs });
  }

  async solve(board, mode = "full") {
    const prompt = this.buildPrompt(board, mode);
    const response = await this.client.chat.completions.create({
      model: this.options.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You solve Sudoku. Return strict JSON only." },
        { role: "user", content: prompt },
      ],
    });

    const content = response?.choices?.[0]?.message?.content;
    const parsed = this.parseResponse(content);
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }
    return parsed.value;
  }
}
