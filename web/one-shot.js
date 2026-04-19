const DEFAULT_PRICING_PER_1M = {
  openai: { input: 0.15, output: 0.6 },
  featherless: { input: 0.2, output: 0.8 },
  ollama: { input: 0, output: 0 },
  lmstudio: { input: 0, output: 0 },
};

const state = {
  providers: [],
  providerMap: new Map(),
  selectedProviderId: null,
  basePuzzle: null,
  emptyBoard: null,
  running: false,
  lastSubmittedPayload: null,
};

const metaEl = document.getElementById("meta");
const providerSelectEl = document.getElementById("provider-select");
const providerBaseUrlEl = document.getElementById("provider-base-url");
const modelSelectRowEl = document.getElementById("model-select-row");
const modelInputRowEl = document.getElementById("model-input-row");
const modelSelectEl = document.getElementById("model-select");
const modelInputEl = document.getElementById("model-input");
const apiKeyRowEl = document.getElementById("api-key-row");
const apiKeyInputEl = document.getElementById("api-key-input");
const refreshModelsBtn = document.getElementById("refresh-models");
const timeoutInputEl = document.getElementById("timeout-input");
const startBtn = document.getElementById("start-one-shot");
const toggleEstimatorBtn = document.getElementById("toggle-estimator");
const estimatorPanelEl = document.getElementById("estimator-panel");

const runStatusEl = document.getElementById("run-status");
const runTimeEl = document.getElementById("run-time");
const inputBoardEl = document.getElementById("input-board");
const outputBoardEl = document.getElementById("output-board");
const resultPanelEl = document.getElementById("result-panel");
const logEl = document.getElementById("run-log");

const rateInputEl = document.getElementById("rate-input");
const rateOutputEl = document.getElementById("rate-output");
const stepFactorEl = document.getElementById("step-factor");
const estimateOutputEl = document.getElementById("estimate-output");

function setEstimatorVisible(visible) {
  estimatorPanelEl.classList.toggle("hidden", !visible);
  toggleEstimatorBtn.textContent = visible ? "Hide Estimator" : "Show Estimator";
}

function formatMs(ms) {
  return `${(ms / 1000).toFixed(2)}s`;
}

function boardCopy(board) {
  return board.map((row) => [...row]);
}

function pushLog(line) {
  const ts = new Date().toLocaleTimeString();
  logEl.textContent += `[${ts}] ${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(statusText, elapsedMs = 0) {
  runStatusEl.textContent = statusText;
  runStatusEl.className = `status ${statusText}`;
  runTimeEl.textContent = formatMs(elapsedMs || 0);
}

function renderBoard(boardEl, board, basePuzzle = null) {
  boardEl.innerHTML = "";
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      const cell = document.createElement("div");
      cell.className = "cell";
      const value = board[row][col];
      cell.textContent = value === 0 ? "" : String(value);

      if (basePuzzle && basePuzzle[row][col] !== 0) {
        cell.classList.add("given");
      }
      if (col === 2 || col === 5) cell.classList.add("box-right");
      if (row === 2 || row === 5) cell.classList.add("box-bottom");

      boardEl.appendChild(cell);
    }
  }
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload.error || "Request failed");
  }
  return payload;
}

function defaultTimeoutForProvider(providerId, baseTimeout) {
  if (providerId === "ollama" || providerId === "lmstudio") {
    return Math.max(baseTimeout, 180000);
  }
  return Math.max(baseTimeout, 30000);
}

function selectedProvider() {
  return state.providerMap.get(state.selectedProviderId) ?? null;
}

function selectedModel() {
  const provider = selectedProvider();
  if (!provider) return "";
  if (provider.modelInput === "select") {
    return modelSelectEl.value.trim();
  }
  return modelInputEl.value.trim();
}

function selectedTimeoutMs() {
  const value = Number(timeoutInputEl.value);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

function selectedApiKey() {
  return apiKeyInputEl.value.trim();
}

function refillModelSelect(models, preferred) {
  modelSelectEl.innerHTML = "";

  if (!models || models.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No local models detected";
    modelSelectEl.appendChild(option);
    return;
  }

  for (const model of models) {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    modelSelectEl.appendChild(option);
  }

  if (preferred && models.includes(preferred)) {
    modelSelectEl.value = preferred;
  }
}

async function refreshDetectedModels() {
  const provider = selectedProvider();
  if (!provider || provider.modelInput !== "select") return;

  try {
    refreshModelsBtn.disabled = true;
    const payload = await fetchJson(`/api/provider-models?providerId=${encodeURIComponent(provider.id)}`);
    refillModelSelect(payload.models || [], selectedModel() || provider.defaultModel);
    pushLog(`Detected ${payload.models.length} model(s) for ${provider.name}.`);
  } catch (error) {
    pushLog(`Model detect failed: ${error.message}`);
  } finally {
    refreshModelsBtn.disabled = false;
  }
}

function setProviderUI(provider, baseTimeout) {
  providerBaseUrlEl.textContent = provider.baseUrl ? `Endpoint: ${provider.baseUrl}` : "";
  timeoutInputEl.value = String(defaultTimeoutForProvider(provider.id, baseTimeout));

  modelSelectRowEl.classList.add("hidden");
  modelInputRowEl.classList.add("hidden");
  apiKeyRowEl.classList.add("hidden");

  if (provider.modelInput === "select") {
    modelSelectRowEl.classList.remove("hidden");
    refillModelSelect(provider.models || [], provider.defaultModel);
    if (provider.detectionError) {
      pushLog(`Model detect error (${provider.name}): ${provider.detectionError}`);
    }
  } else {
    modelInputRowEl.classList.remove("hidden");
    modelInputEl.value = provider.defaultModel || "";
  }

  if (provider.requiresApiKey) {
    apiKeyRowEl.classList.remove("hidden");
    apiKeyInputEl.placeholder = provider.hasApiKey
      ? "Optional override (env key already available)"
      : "Required: paste API key";
  }

  const pricing = DEFAULT_PRICING_PER_1M[provider.id] ?? { input: 0, output: 0 };
  rateInputEl.value = String(pricing.input);
  rateOutputEl.value = String(pricing.output);
  stepFactorEl.value = "1.2";

  startBtn.disabled = !provider.enabled;
  if (!provider.enabled) {
    setStatus("disabled", 0);
    pushLog(`Disabled provider selected: ${provider.disabledReason || "not configured"}`);
  } else {
    setStatus("idle", 0);
    if (provider.requiresApiKey && !provider.hasApiKey) {
      pushLog(`${provider.name} requires an API key. Provide it in the field below.`);
    }
  }

  updateEstimatePanel(state.lastSubmittedPayload);
}

function approxTokensFromText(text) {
  const raw = typeof text === "string" ? text : JSON.stringify(text ?? "");
  return Math.max(1, Math.ceil(raw.length / 4));
}

function countEmptyCells(board) {
  let count = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell === 0) count += 1;
    }
  }
  return count;
}

function buildPromptEstimate(board, mode) {
  const outputShape =
    mode === "full"
      ? '{"solution":[[...9x9 grid...]]}'
      : '{"row":number,"col":number,"value":number}';

  return [
    "You are a strict Sudoku solver.",
    "Hard requirements: digits 1-9, row/col/subgrid uniqueness, preserve clues.",
    `Task mode: ${mode === "full" ? "FULL SOLUTION" : "SINGLE STEP"}`,
    "Input board JSON:",
    JSON.stringify(board),
    "Output JSON schema:",
    outputShape,
  ].join("\n");
}

function estimateCostUsd(inputTokens, outputTokens, inputRatePer1M, outputRatePer1M) {
  return (inputTokens / 1_000_000) * inputRatePer1M + (outputTokens / 1_000_000) * outputRatePer1M;
}

function formatUsd(value) {
  return `$${value.toFixed(6)}`;
}

function updateEstimatePanel(submittedPayload = null) {
  if (!state.basePuzzle) return;

  const puzzle = state.basePuzzle;
  const emptyCells = countEmptyCells(puzzle);

  const oneShotInputTokens = approxTokensFromText(buildPromptEstimate(puzzle, "full"));
  const oneShotOutputTokens = submittedPayload
    ? approxTokensFromText(JSON.stringify(submittedPayload))
    : approxTokensFromText('{"solution":[[...9x9...]]}');

  const stepPromptTokens = approxTokensFromText(buildPromptEstimate(puzzle, "step"));
  const stepMoveOutputTokens = approxTokensFromText('{"row":0,"col":0,"value":1}');
  const stepFactor = Number(stepFactorEl.value);
  const safeFactor = Number.isFinite(stepFactor) && stepFactor >= 1 ? stepFactor : 1;
  const estimatedCalls = Math.ceil(emptyCells * safeFactor);

  const stepTotalInputTokens = stepPromptTokens * estimatedCalls;
  const stepTotalOutputTokens = stepMoveOutputTokens * estimatedCalls;

  const inRate = Number(rateInputEl.value);
  const outRate = Number(rateOutputEl.value);
  const safeInRate = Number.isFinite(inRate) && inRate >= 0 ? inRate : 0;
  const safeOutRate = Number.isFinite(outRate) && outRate >= 0 ? outRate : 0;

  const oneShotCost = estimateCostUsd(oneShotInputTokens, oneShotOutputTokens, safeInRate, safeOutRate);
  const stepCost = estimateCostUsd(stepTotalInputTokens, stepTotalOutputTokens, safeInRate, safeOutRate);

  const savings = stepCost > 0 ? ((stepCost - oneShotCost) / stepCost) * 100 : 0;
  const savingsText = stepCost > 0 ? `${savings.toFixed(2)}%` : "n/a";

  estimateOutputEl.textContent = [
    `one-shot tokens  : in=${oneShotInputTokens}, out=${oneShotOutputTokens}`,
    `step tokens      : in=${stepTotalInputTokens}, out=${stepTotalOutputTokens} (calls=${estimatedCalls})`,
    `one-shot cost    : ${formatUsd(oneShotCost)}`,
    `step cost        : ${formatUsd(stepCost)}`,
    `estimated savings: ${savingsText}`,
    "note: approximation only; tune rates/factor for your workload.",
  ].join("\n");
}

function resetRunPanels() {
  resultPanelEl.textContent = "";
  renderBoard(outputBoardEl, state.emptyBoard, state.basePuzzle);
  state.lastSubmittedPayload = null;
  updateEstimatePanel(null);
}

async function runOneShot() {
  const provider = selectedProvider();
  if (!provider || state.running || !provider.enabled) return;

  const model = selectedModel();
  if (!model) {
    setStatus("invalid", 0);
    pushLog("Model is required.");
    return;
  }

  const timeoutMs = selectedTimeoutMs();
  if (!timeoutMs) {
    setStatus("invalid", 0);
    pushLog("Timeout must be a positive number.");
    return;
  }

  const apiKey = selectedApiKey();
  if (provider.requiresApiKey && !provider.hasApiKey && !apiKey) {
    setStatus("invalid", 0);
    pushLog(`${provider.name} API key is required.`);
    return;
  }

  state.running = true;
  startBtn.disabled = true;
  resetRunPanels();
  setStatus("running", 0);
  pushLog(`Starting one-shot solve with provider=${provider.name}, model=${model}, timeout=${timeoutMs}ms...`);

  try {
    const result = await fetchJson("/api/solve-once", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId: provider.id, model, timeoutMs, apiKey }),
    });

    setStatus(result.status, result.elapsedMs || 0);

    if (result.solution) {
      renderBoard(outputBoardEl, result.solution, state.basePuzzle);
    } else {
      renderBoard(outputBoardEl, state.emptyBoard, state.basePuzzle);
    }

    const reasonText = result.reason ? ` | reason: ${result.reason}` : "";
    resultPanelEl.textContent = `status: ${result.status} | latency: ${formatMs(result.elapsedMs || 0)}${reasonText}`;

    state.lastSubmittedPayload = result.submitted ?? null;
    updateEstimatePanel(state.lastSubmittedPayload);

    pushLog(`Finished one-shot solve with status=${result.status}.`);
    if (result.reason) {
      pushLog(`Reason: ${result.reason}`);
    }
  } catch (error) {
    setStatus("failed", 0);
    resultPanelEl.textContent = `status: failed | reason: ${error.message}`;
    pushLog(`One-shot request failed: ${error.message}`);
    state.lastSubmittedPayload = null;
    updateEstimatePanel(null);
  } finally {
    state.running = false;
    startBtn.disabled = !provider.enabled;
  }
}

function providerLabel(provider) {
  if (provider.enabled) return provider.name;
  return `${provider.name} (disabled)`;
}

async function init() {
  try {
    const data = await fetchJson("/api/providers");
    state.providers = data.providers;
    state.providerMap = new Map(data.providers.map((p) => [p.id, p]));

    state.basePuzzle = boardCopy(data.initialPuzzle);
    state.emptyBoard = data.initialPuzzle.map(() => Array(9).fill(0));

    renderBoard(inputBoardEl, state.basePuzzle, state.basePuzzle);
    renderBoard(outputBoardEl, state.emptyBoard, state.basePuzzle);

    metaEl.textContent = `Puzzle: ${data.puzzleLevel} | One request per solve (full-board mode)`;

    providerSelectEl.innerHTML = "";
    for (const provider of data.providers) {
      const option = document.createElement("option");
      option.value = provider.id;
      option.textContent = providerLabel(provider);
      providerSelectEl.appendChild(option);
    }

    const firstEnabled = data.providers.find((p) => p.enabled) || data.providers[0] || null;
    if (!firstEnabled) {
      metaEl.textContent = "No providers available.";
      startBtn.disabled = true;
      return;
    }

    state.selectedProviderId = firstEnabled.id;
    providerSelectEl.value = firstEnabled.id;
    setProviderUI(firstEnabled, data.timeoutMs);

    providerSelectEl.addEventListener("change", () => {
      state.selectedProviderId = providerSelectEl.value;
      const provider = selectedProvider();
      if (!provider) return;
      resetRunPanels();
      setProviderUI(provider, data.timeoutMs);
    });

    refreshModelsBtn.addEventListener("click", refreshDetectedModels);
    startBtn.addEventListener("click", runOneShot);
    toggleEstimatorBtn.addEventListener("click", () => {
      const currentlyVisible = !estimatorPanelEl.classList.contains("hidden");
      setEstimatorVisible(!currentlyVisible);
    });

    rateInputEl.addEventListener("input", () => updateEstimatePanel(state.lastSubmittedPayload));
    rateOutputEl.addEventListener("input", () => updateEstimatePanel(state.lastSubmittedPayload));
    stepFactorEl.addEventListener("input", () => updateEstimatePanel(state.lastSubmittedPayload));

    setEstimatorVisible(false);
    updateEstimatePanel(null);
  } catch (error) {
    metaEl.textContent = `Failed to load providers: ${error.message}`;
    startBtn.disabled = true;
  }
}

init();
