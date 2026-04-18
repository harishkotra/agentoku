import { OpenAICompatibleAgent } from "./OpenAICompatibleAgent.js";

export class LMStudioAgent extends OpenAICompatibleAgent {
  constructor({
    baseUrl = "http://127.0.0.1:1234/v1",
    model = "local-model",
    apiKey = "lm-studio",
    timeoutMs = 30000,
  }) {
    super("LM Studio", { apiKey, baseUrl, model, timeoutMs });
  }
}
