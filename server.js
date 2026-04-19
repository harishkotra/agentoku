import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

import { loadConfig } from "./core/config.js";
import { runAgentStepwise } from "./core/orchestrator.js";
import { getPuzzle } from "./core/puzzles.js";
import { isBoardShapeValid, isBoardValid, isSolved, preserveClues } from "./core/sudoku.js";
import { withTimeout, nowMs, elapsedMs } from "./utils/timer.js";
import { OpenAIAgent } from "./agents/OpenAIAgent.js";
import { OllamaAgent } from "./agents/OllamaAgent.js";
import { LMStudioAgent } from "./agents/LMStudioAgent.js";
import { FeatherlessAgent } from "./agents/FeatherlessAgent.js";

const config = loadConfig();
const runs = new Map();
const activeRunByProvider = new Map();

function json(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendSse(res, eventPayload) {
  res.write(`data: ${JSON.stringify(eventPayload)}\n\n`);
}

function broadcast(run, eventPayload) {
  run.events.push(eventPayload);
  for (const client of run.clients) {
    sendSse(client, eventPayload);
  }
}

function providerCatalog() {
  return [
    {
      id: "openai",
      name: "OpenAI",
      modelInput: "manual",
      enabled: true,
      requiresApiKey: true,
      hasApiKey: Boolean(config.openai.apiKey),
      disabledReason: null,
      baseUrl: "https://api.openai.com/v1",
      defaultModel: config.openai.model,
      createAgent: ({ model, timeoutMs, apiKey }) =>
        new OpenAIAgent({
          apiKey: apiKey || config.openai.apiKey,
          model,
          timeoutMs,
        }),
    },
    {
      id: "ollama",
      name: "Ollama",
      modelInput: "select",
      enabled: Boolean(config.ollama.enabled),
      requiresApiKey: false,
      hasApiKey: false,
      disabledReason: config.ollama.enabled ? null : "ENABLE_OLLAMA=false",
      baseUrl: config.ollama.baseUrl,
      defaultModel: config.ollama.model,
      createAgent: ({ model }) =>
        new OllamaAgent({
          baseUrl: config.ollama.baseUrl,
          model,
        }),
    },
    {
      id: "lmstudio",
      name: "LM Studio",
      modelInput: "select",
      enabled: Boolean(config.lmStudio.enabled),
      requiresApiKey: false,
      hasApiKey: Boolean(config.lmStudio.apiKey),
      disabledReason: config.lmStudio.enabled ? null : "ENABLE_LMSTUDIO=false",
      baseUrl: config.lmStudio.baseUrl,
      defaultModel: config.lmStudio.model,
      createAgent: ({ model, timeoutMs }) =>
        new LMStudioAgent({
          apiKey: config.lmStudio.apiKey,
          baseUrl: config.lmStudio.baseUrl,
          model,
          timeoutMs,
        }),
    },
    {
      id: "featherless",
      name: "Featherless",
      modelInput: "manual",
      enabled: true,
      requiresApiKey: true,
      hasApiKey: Boolean(config.featherless.apiKey),
      disabledReason: null,
      baseUrl: config.featherless.baseUrl,
      defaultModel: config.featherless.model,
      createAgent: ({ model, timeoutMs, apiKey }) =>
        new FeatherlessAgent({
          apiKey: apiKey || config.featherless.apiKey,
          baseUrl: config.featherless.baseUrl,
          model,
          timeoutMs,
        }),
    },
  ];
}

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

async function serveStaticFile(res, filePath, contentType) {
  try {
    const content = await readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  } catch {
    json(res, 404, { error: "Not found" });
  }
}

async function detectOllamaModels(baseUrl) {
  const url = `${baseUrl.replace(/\/$/, "")}/api/tags`;
  const response = await fetch(url, { signal: AbortSignal.timeout(7000) });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama model list failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  const models = Array.isArray(data?.models)
    ? data.models.map((m) => m?.name).filter((name) => typeof name === "string" && name.trim() !== "")
    : [];

  return [...new Set(models)];
}

async function detectLmStudioModels(baseUrl, apiKey) {
  const url = `${baseUrl.replace(/\/$/, "")}/models`;
  const headers = {};
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(7000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LM Studio model list failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  const models = Array.isArray(data?.data)
    ? data.data.map((m) => m?.id).filter((id) => typeof id === "string" && id.trim() !== "")
    : [];

  return [...new Set(models)];
}

async function detectModelsForProvider(provider) {
  if (!provider.enabled || provider.modelInput !== "select") {
    return { models: [] };
  }

  if (provider.id === "ollama") {
    return { models: await detectOllamaModels(provider.baseUrl) };
  }

  if (provider.id === "lmstudio") {
    return { models: await detectLmStudioModels(provider.baseUrl, config.lmStudio.apiKey) };
  }

  return { models: [] };
}

async function buildProviderView() {
  const providers = providerCatalog();

  const resolved = await Promise.all(
    providers.map(async (provider) => {
      let models = [];
      let detectionError = null;

      try {
        const detected = await detectModelsForProvider(provider);
        models = detected.models;
      } catch (error) {
        detectionError = error.message;
      }

      return {
        id: provider.id,
        name: provider.name,
        modelInput: provider.modelInput,
        enabled: provider.enabled,
        requiresApiKey: provider.requiresApiKey,
        hasApiKey: provider.hasApiKey,
        disabledReason: provider.disabledReason,
        baseUrl: provider.baseUrl,
        defaultModel: provider.defaultModel,
        models,
        detectionError,
      };
    }),
  );

  return resolved;
}

function providerById(id) {
  return providerCatalog().find((p) => p.id === id) ?? null;
}

function defaultTimeoutForProvider(providerId) {
  if (providerId === "ollama" || providerId === "lmstudio") {
    return Math.max(config.general.timeoutMs, 180000);
  }
  return config.general.timeoutMs;
}

function resolveApiKey(provider, apiKeyOverride) {
  if (!provider.requiresApiKey) return null;

  const key = typeof apiKeyOverride === "string" ? apiKeyOverride.trim() : "";
  if (key) return key;

  if (provider.id === "openai") return config.openai.apiKey;
  if (provider.id === "featherless") return config.featherless.apiKey;
  return null;
}

async function startProviderRun({ providerId, model, puzzleLevel, timeoutMs, apiKey }) {
  const provider = providerById(providerId);
  if (!provider) {
    return { ok: false, statusCode: 404, payload: { error: `Unknown provider: ${providerId}` } };
  }

  if (!provider.enabled) {
    return {
      ok: false,
      statusCode: 400,
      payload: { error: `${provider.name} is disabled: ${provider.disabledReason ?? "not configured"}` },
    };
  }

  if (typeof model !== "string" || model.trim() === "") {
    return { ok: false, statusCode: 400, payload: { error: `Model is required for ${provider.name}` } };
  }

  const resolvedApiKey = resolveApiKey(provider, apiKey);
  if (provider.requiresApiKey && !resolvedApiKey) {
    return {
      ok: false,
      statusCode: 400,
      payload: { error: `${provider.name} API key is required (set in env or pass from UI).` },
    };
  }

  if (activeRunByProvider.has(provider.id)) {
    const activeRunId = activeRunByProvider.get(provider.id);
    return {
      ok: false,
      statusCode: 409,
      payload: { error: `${provider.name} is already running`, runId: activeRunId },
    };
  }

  const resolvedPuzzle = getPuzzle(puzzleLevel ?? config.general.puzzleLevel);
  const resolvedTimeoutMs = parsePositiveInt(timeoutMs, defaultTimeoutForProvider(provider.id));
  const runId = randomUUID();
  const run = {
    id: runId,
    providerId: provider.id,
    providerName: provider.name,
    model,
    createdAt: Date.now(),
    events: [],
    clients: new Set(),
    completed: false,
  };

  runs.set(runId, run);
  activeRunByProvider.set(provider.id, runId);

  let agent;
  try {
    agent = provider.createAgent({ model, timeoutMs: resolvedTimeoutMs, apiKey: resolvedApiKey });
  } catch (error) {
    activeRunByProvider.delete(provider.id);
    return { ok: false, statusCode: 500, payload: { error: `Agent init failed: ${error.message}` } };
  }

  broadcast(run, {
    type: "queued",
    runId,
    providerId: provider.id,
    providerName: provider.name,
    model,
    board: resolvedPuzzle,
    timeoutMs: resolvedTimeoutMs,
    timestamp: Date.now(),
  });

  void runAgentStepwise({
    agent,
    puzzle: resolvedPuzzle,
    timeoutMs: resolvedTimeoutMs,
    retries: config.general.retries,
    maxSteps: config.general.maxSteps,
    stepDelayMs: config.general.stepDelayMs,
    maxTimeouts: provider.id === "ollama" || provider.id === "lmstudio" ? 6 : 4,
    onEvent: (event) => {
      broadcast(run, {
        ...event,
        runId,
        providerId: provider.id,
        providerName: provider.name,
        model,
        timeoutMs: resolvedTimeoutMs,
        timestamp: Date.now(),
      });

      if (event.type === "finished") {
        run.completed = true;
        activeRunByProvider.delete(provider.id);
        for (const client of run.clients) {
          client.end();
        }
        run.clients.clear();
      }
    },
  }).catch((error) => {
    broadcast(run, {
      type: "finished",
      runId,
      providerId: provider.id,
      providerName: provider.name,
      model,
      status: "failed",
      reason: error.message,
      elapsedMs: 0,
      attempts: 0,
      timeoutMs: resolvedTimeoutMs,
      timestamp: Date.now(),
    });
    run.completed = true;
    activeRunByProvider.delete(provider.id);
    for (const client of run.clients) {
      client.end();
    }
    run.clients.clear();
  });

  return { ok: true, payload: { runId } };
}

function validateFullSolutionPayload(payload, puzzle) {
  const solution = payload?.solution;

  if (!isBoardShapeValid(solution)) {
    return { ok: false, reason: "Malformed solution shape (expected 9x9 integers 0-9)." };
  }
  if (!preserveClues(puzzle, solution)) {
    return { ok: false, reason: "Model modified fixed clues from the original puzzle." };
  }
  if (!isBoardValid(solution)) {
    return { ok: false, reason: "Returned board violates Sudoku constraints." };
  }
  if (!isSolved(solution)) {
    return { ok: false, reason: "Returned board is not fully solved." };
  }

  return { ok: true, solution };
}

async function solveProviderOnce({ providerId, model, puzzleLevel, timeoutMs, apiKey }) {
  const provider = providerById(providerId);
  if (!provider) {
    return { ok: false, statusCode: 404, payload: { error: `Unknown provider: ${providerId}` } };
  }

  if (!provider.enabled) {
    return {
      ok: false,
      statusCode: 400,
      payload: { error: `${provider.name} is disabled: ${provider.disabledReason ?? "not configured"}` },
    };
  }

  if (typeof model !== "string" || model.trim() === "") {
    return { ok: false, statusCode: 400, payload: { error: `Model is required for ${provider.name}` } };
  }

  const resolvedApiKey = resolveApiKey(provider, apiKey);
  if (provider.requiresApiKey && !resolvedApiKey) {
    return {
      ok: false,
      statusCode: 400,
      payload: { error: `${provider.name} API key is required (set in env or pass from UI).` },
    };
  }

  const puzzle = getPuzzle(puzzleLevel ?? config.general.puzzleLevel);
  const resolvedTimeoutMs = parsePositiveInt(timeoutMs, defaultTimeoutForProvider(provider.id));

  let agent;
  try {
    agent = provider.createAgent({ model, timeoutMs: resolvedTimeoutMs, apiKey: resolvedApiKey });
  } catch (error) {
    return { ok: false, statusCode: 500, payload: { error: `Agent init failed: ${error.message}` } };
  }

  const started = nowMs();
  try {
    const response = await withTimeout(() => agent.solve(puzzle, "full"), resolvedTimeoutMs);
    const validated = validateFullSolutionPayload(response, puzzle);

    if (!validated.ok) {
      return {
        ok: true,
        payload: {
          providerId: provider.id,
          providerName: provider.name,
          model,
          timeoutMs: resolvedTimeoutMs,
          elapsedMs: elapsedMs(started),
          status: "invalid",
          reason: validated.reason,
          initialPuzzle: puzzle,
          submitted: response ?? null,
          solution: null,
        },
      };
    }

    return {
      ok: true,
      payload: {
        providerId: provider.id,
        providerName: provider.name,
        model,
        timeoutMs: resolvedTimeoutMs,
        elapsedMs: elapsedMs(started),
        status: "solved",
        reason: null,
        initialPuzzle: puzzle,
        submitted: response ?? null,
        solution: validated.solution,
      },
    };
  } catch (error) {
    const isTimeout = error.message === "TIMEOUT";
    return {
      ok: true,
      payload: {
        providerId: provider.id,
        providerName: provider.name,
        model,
        timeoutMs: resolvedTimeoutMs,
        elapsedMs: elapsedMs(started),
        status: isTimeout ? "timeout" : "failed",
        reason: isTimeout ? "Timed out waiting for one-shot full solution." : error.message,
        initialPuzzle: puzzle,
        submitted: null,
        solution: null,
      },
    };
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/") {
    return serveStaticFile(res, path.resolve("web/index.html"), "text/html; charset=utf-8");
  }

  if (req.method === "GET" && url.pathname === "/one-shot") {
    return serveStaticFile(res, path.resolve("web/one-shot.html"), "text/html; charset=utf-8");
  }

  if (req.method === "GET" && url.pathname === "/web/styles.css") {
    return serveStaticFile(res, path.resolve("web/styles.css"), "text/css; charset=utf-8");
  }

  if (req.method === "GET" && url.pathname === "/web/app.js") {
    return serveStaticFile(res, path.resolve("web/app.js"), "application/javascript; charset=utf-8");
  }

  if (req.method === "GET" && url.pathname === "/web/one-shot.js") {
    return serveStaticFile(res, path.resolve("web/one-shot.js"), "application/javascript; charset=utf-8");
  }

  if (req.method === "GET" && url.pathname === "/api/providers") {
    const providers = await buildProviderView();
    return json(res, 200, {
      providers,
      puzzleLevel: config.general.puzzleLevel,
      stepDelayMs: config.general.stepDelayMs,
      timeoutMs: config.general.timeoutMs,
      retries: config.general.retries,
      maxSteps: config.general.maxSteps,
      initialPuzzle: getPuzzle(config.general.puzzleLevel),
    });
  }

  if (req.method === "GET" && url.pathname === "/api/provider-models") {
    const providerId = url.searchParams.get("providerId") ?? "";
    const provider = providerById(providerId);
    if (!provider) {
      return json(res, 404, { error: `Unknown provider: ${providerId}` });
    }

    try {
      const detected = await detectModelsForProvider(provider);
      return json(res, 200, { providerId, models: detected.models });
    } catch (error) {
      return json(res, 500, { error: error.message, providerId, models: [] });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/start-agent") {
    try {
      const body = await readRequestBody(req);
      const providerId = typeof body.providerId === "string" ? body.providerId : "";
      const model = typeof body.model === "string" ? body.model.trim() : "";
      const puzzleLevel = body.puzzleLevel ?? config.general.puzzleLevel;
      const timeoutMs = body.timeoutMs;
      const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";

      if (!providerId) {
        return json(res, 400, { error: "providerId is required" });
      }

      const startResult = await startProviderRun({ providerId, model, puzzleLevel, timeoutMs, apiKey });
      if (!startResult.ok) {
        return json(res, startResult.statusCode, startResult.payload);
      }

      return json(res, 200, startResult.payload);
    } catch (error) {
      return json(res, 400, { error: `Invalid request body: ${error.message}` });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/solve-once") {
    try {
      const body = await readRequestBody(req);
      const providerId = typeof body.providerId === "string" ? body.providerId : "";
      const model = typeof body.model === "string" ? body.model.trim() : "";
      const puzzleLevel = body.puzzleLevel ?? config.general.puzzleLevel;
      const timeoutMs = body.timeoutMs;
      const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";

      if (!providerId) {
        return json(res, 400, { error: "providerId is required" });
      }

      const solveResult = await solveProviderOnce({ providerId, model, puzzleLevel, timeoutMs, apiKey });
      if (!solveResult.ok) {
        return json(res, solveResult.statusCode, solveResult.payload);
      }

      return json(res, 200, solveResult.payload);
    } catch (error) {
      return json(res, 400, { error: `Invalid request body: ${error.message}` });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/events") {
    const runId = url.searchParams.get("runId");
    if (!runId || !runs.has(runId)) {
      return json(res, 404, { error: "Run not found" });
    }

    const run = runs.get(runId);
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    for (const eventPayload of run.events) {
      sendSse(res, eventPayload);
    }

    if (run.completed) {
      return res.end();
    }

    run.clients.add(res);
    req.on("close", () => {
      run.clients.delete(res);
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    const providers = providerCatalog();
    return json(res, 200, { ok: true, providers: providers.length });
  }

  return json(res, 404, { error: "Not found" });
});

server.listen(config.web.port, () => {
  console.log(`Sudoku UI server running at http://localhost:${config.web.port}`);
  console.log(`Defaults: timeout=${config.general.timeoutMs}ms, retries=${config.general.retries}`);
});
