import { OpenAICompatibleAgent } from "./OpenAICompatibleAgent.js";

export class FeatherlessAgent extends OpenAICompatibleAgent {
  constructor({
    apiKey,
    baseUrl = "https://api.featherless.ai/v1",
    model = "featherless-chat",
    timeoutMs = 30000,
  }) {
    super("Featherless", { apiKey, baseUrl, model, timeoutMs });
  }
}
