import { OpenAIAgent } from "./OpenAIAgent.js";
import { OllamaAgent } from "./OllamaAgent.js";
import { LMStudioAgent } from "./LMStudioAgent.js";
import { FeatherlessAgent } from "./FeatherlessAgent.js";

export function buildAgents(config) {
  const agents = [];

  if (config.openai.apiKey) {
    agents.push(
      new OpenAIAgent({
        apiKey: config.openai.apiKey,
        model: config.openai.model,
        timeoutMs: config.general.timeoutMs,
      }),
    );
  }

  if (config.ollama.enabled) {
    agents.push(
      new OllamaAgent({
        baseUrl: config.ollama.baseUrl,
        model: config.ollama.model,
      }),
    );
  }

  if (config.lmStudio.enabled) {
    agents.push(
      new LMStudioAgent({
        apiKey: config.lmStudio.apiKey,
        baseUrl: config.lmStudio.baseUrl,
        model: config.lmStudio.model,
        timeoutMs: config.general.timeoutMs,
      }),
    );
  }

  if (config.featherless.apiKey) {
    agents.push(
      new FeatherlessAgent({
        apiKey: config.featherless.apiKey,
        baseUrl: config.featherless.baseUrl,
        model: config.featherless.model,
        timeoutMs: config.general.timeoutMs,
      }),
    );
  }

  return agents;
}
