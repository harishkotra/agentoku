import { BaseAgent } from "./BaseAgent.js";

export class OllamaAgent extends BaseAgent {
  constructor({ baseUrl = "http://127.0.0.1:11434", model = "gemma4:latest" }) {
    super("Ollama", { baseUrl, model });
  }

  async solve(board, mode = "full") {
    const prompt = this.buildPrompt(board, mode);
    const url = `${this.options.baseUrl.replace(/\/$/, "")}/api/chat`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.options.model,
        format: "json",
        stream: false,
        options: { temperature: 0 },
        messages: [
          { role: "system", content: "Return strict JSON only." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Ollama API error ${response.status}: ${body}`);
    }

    const data = await response.json();
    const content = data?.message?.content;
    const parsed = this.parseResponse(content);
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }

    return parsed.value;
  }
}
