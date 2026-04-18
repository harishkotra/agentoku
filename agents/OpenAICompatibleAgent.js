import { BaseAgent } from "./BaseAgent.js";

export class OpenAICompatibleAgent extends BaseAgent {
  constructor(name, { apiKey, baseUrl, model, timeoutMs = 30000 }) {
    super(name, { apiKey, baseUrl, model, timeoutMs });
  }

  async solve(board, mode = "full") {
    const prompt = this.buildPrompt(board, mode);
    const url = `${this.options.baseUrl.replace(/\/$/, "")}/chat/completions`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify({
        model: this.options.model,
        temperature: 0,
        messages: [
          { role: "system", content: "Return strict JSON only." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${this.name} API error ${response.status}: ${body}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    const parsed = this.parseResponse(content);
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }

    return parsed.value;
  }
}
