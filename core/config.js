import { bootstrapEnv } from "./env.js";

function envBool(name, defaultValue = false) {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function envNum(name, defaultValue) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : defaultValue;
}

export function loadConfig() {
  bootstrapEnv();

  return {
    general: {
      mode: process.env.SOLVE_MODE === "step" ? "step" : "full",
      timeoutMs: envNum("AGENT_TIMEOUT_MS", 30000),
      retries: envNum("AGENT_RETRIES", 2),
      maxSteps: envNum("MAX_STEP_COUNT", 150),
      puzzleLevel: process.env.PUZZLE_LEVEL ?? "easy",
      verbose: envBool("VERBOSE_LOGS", true),
      stepDelayMs: envNum("STEP_DELAY_MS", 350),
    },
    web: {
      port: envNum("WEB_PORT", 3000),
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    },
    ollama: {
      enabled: envBool("ENABLE_OLLAMA", true),
      baseUrl: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
      model: process.env.OLLAMA_MODEL ?? "llama3.1",
    },
    lmStudio: {
      enabled: envBool("ENABLE_LMSTUDIO", true),
      baseUrl: process.env.LMSTUDIO_BASE_URL ?? "http://127.0.0.1:1234/v1",
      apiKey: process.env.LMSTUDIO_API_KEY ?? "lm-studio",
      model: process.env.LMSTUDIO_MODEL ?? "local-model",
    },
    featherless: {
      apiKey: process.env.FEATHERLESS_API_KEY,
      baseUrl: process.env.FEATHERLESS_BASE_URL ?? "https://api.featherless.ai/v1",
      model: process.env.FEATHERLESS_MODEL ?? "featherless-chat",
    },
  };
}
