const state = {
  config: null,
  cards: new Map(),
};

const localGridEl = document.getElementById("local-grid");
const thirdPartyGridEl = document.getElementById("thirdparty-grid");
const metaEl = document.getElementById("meta");
const startAllBtn = document.getElementById("start-all");
const resetBtn = document.getElementById("reset-boards");
const cardTemplate = document.getElementById("agent-card-template");

function formatMs(ms) {
  return `${(ms / 1000).toFixed(2)}s`;
}

function boardCopy(board) {
  return board.map((row) => [...row]);
}

function renderBoard(boardEl, board, basePuzzle, changedMove = null) {
  boardEl.innerHTML = "";
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      const cell = document.createElement("div");
      cell.className = "cell";
      const value = board[row][col];
      cell.textContent = value === 0 ? "" : String(value);

      if (basePuzzle[row][col] !== 0) cell.classList.add("given");
      if (changedMove && changedMove.row === row && changedMove.col === col) {
        cell.classList.add("changed");
      }
      if (col === 2 || col === 5) cell.classList.add("box-right");
      if (row === 2 || row === 5) cell.classList.add("box-bottom");

      boardEl.appendChild(cell);
    }
  }
}

function pushLog(logEl, line) {
  const ts = new Date().toLocaleTimeString();
  logEl.textContent += `[${ts}] ${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(cardState, statusText, elapsedMs, attempts, invalidMoveCount = 0, timeoutCount = 0) {
  cardState.statusEl.textContent = statusText;
  cardState.statusEl.className = `status ${statusText}`;
  cardState.timeEl.textContent = formatMs(elapsedMs || 0);
  cardState.attemptsEl.textContent = `attempts: ${attempts || 0}`;
  cardState.invalidCountEl.textContent = `invalid moves: ${invalidMoveCount || 0}`;
  cardState.timeoutCountEl.textContent = `timeouts: ${timeoutCount || 0}`;
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload.error || "Request failed");
  }
  return payload;
}

function selectedModel(cardState) {
  if (cardState.provider.modelInput === "select") {
    return cardState.modelSelectEl.value.trim();
  }
  return cardState.modelInputEl.value.trim();
}

function getTimeoutMs(cardState) {
  const value = Number(cardState.timeoutEl.value);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

function refillModelSelect(cardState, models, preferred) {
  cardState.modelSelectEl.innerHTML = "";

  if (models.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No local models detected";
    cardState.modelSelectEl.appendChild(option);
    return;
  }

  for (const model of models) {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    cardState.modelSelectEl.appendChild(option);
  }

  if (preferred && models.includes(preferred)) {
    cardState.modelSelectEl.value = preferred;
  }
}

async function refreshDetectedModels(cardState) {
  if (cardState.provider.modelInput !== "select") return;

  try {
    cardState.refreshBtn.disabled = true;
    const payload = await fetchJson(
      `/api/provider-models?providerId=${encodeURIComponent(cardState.provider.id)}`,
    );

    const preferred = selectedModel(cardState) || cardState.provider.defaultModel;
    refillModelSelect(cardState, payload.models || [], preferred);
    pushLog(cardState.logEl, `Detected ${payload.models.length} model(s).`);
  } catch (error) {
    pushLog(cardState.logEl, `Model detect failed: ${error.message}`);
  } finally {
    cardState.refreshBtn.disabled = false;
  }
}

function createProviderCard(provider, initialPuzzle, defaultTimeoutMs, targetEl) {
  const node = cardTemplate.content.firstElementChild.cloneNode(true);
  const nameEl = node.querySelector(".agent-name");
  const baseUrlEl = node.querySelector(".base-url");
  const startBtn = node.querySelector(".start-btn");
  const refreshBtn = node.querySelector(".refresh-models");
  const modelSelectRow = node.querySelector(".model-select-row");
  const modelInputRow = node.querySelector(".model-input-row");
  const modelSelectEl = node.querySelector(".model-select");
  const modelInputEl = node.querySelector(".model-input");
  const timeoutEl = node.querySelector(".timeout-input");
  const statusEl = node.querySelector(".status");
  const timeEl = node.querySelector(".time");
  const attemptsEl = node.querySelector(".attempts");
  const invalidCountEl = node.querySelector(".invalid-count");
  const timeoutCountEl = node.querySelector(".timeout-count");
  const boardEl = node.querySelector(".board");
  const logEl = node.querySelector(".log");

  nameEl.textContent = provider.name;
  baseUrlEl.textContent = provider.baseUrl ? `Endpoint: ${provider.baseUrl}` : "";
  timeoutEl.value = String(defaultTimeoutMs);
  renderBoard(boardEl, initialPuzzle, initialPuzzle);

  const cardState = {
    provider,
    node,
    startBtn,
    refreshBtn,
    modelSelectEl,
    modelInputEl,
    timeoutEl,
    statusEl,
    timeEl,
    attemptsEl,
    invalidCountEl,
    timeoutCountEl,
    boardEl,
    logEl,
    currentBoard: boardCopy(initialPuzzle),
    basePuzzle: boardCopy(initialPuzzle),
    stream: null,
    running: false,
  };

  if (provider.modelInput === "select") {
    modelSelectRow.classList.remove("hidden");
    refillModelSelect(cardState, provider.models || [], provider.defaultModel);
    refreshBtn.addEventListener("click", () => refreshDetectedModels(cardState));
    if (provider.detectionError) {
      pushLog(logEl, `Model detect error: ${provider.detectionError}`);
    }
  } else {
    modelInputRow.classList.remove("hidden");
    modelInputEl.value = provider.defaultModel || "";
    pushLog(logEl, "Enter model name before starting.");
  }

  if (!provider.enabled) {
    startBtn.disabled = true;
    refreshBtn.disabled = true;
    setStatus(cardState, "disabled", 0, 0, 0, 0);
    pushLog(logEl, `Disabled: ${provider.disabledReason || "not configured"}`);
  }

  startBtn.addEventListener("click", () => startProvider(provider.id));

  state.cards.set(provider.id, cardState);
  targetEl.appendChild(node);
}

function closeStream(cardState) {
  if (cardState.stream) {
    cardState.stream.close();
    cardState.stream = null;
  }
}

function resetCard(cardState) {
  closeStream(cardState);
  cardState.running = false;
  cardState.logEl.textContent = "";
  cardState.currentBoard = boardCopy(cardState.basePuzzle);
  renderBoard(cardState.boardEl, cardState.currentBoard, cardState.basePuzzle);

  if (cardState.provider.enabled) {
    cardState.startBtn.disabled = false;
    setStatus(cardState, "idle", 0, 0, 0, 0);
    if (cardState.provider.modelInput === "manual") {
      pushLog(cardState.logEl, "Enter model name before starting.");
    }
  } else {
    cardState.startBtn.disabled = true;
    setStatus(cardState, "disabled", 0, 0, 0, 0);
    pushLog(cardState.logEl, `Disabled: ${cardState.provider.disabledReason || "not configured"}`);
  }
}

async function startProvider(providerId) {
  const cardState = state.cards.get(providerId);
  if (!cardState || cardState.running || !cardState.provider.enabled) return;

  const model = selectedModel(cardState);
  if (!model) {
    pushLog(cardState.logEl, "Model is required.");
    setStatus(cardState, "invalid", 0, 0, 0, 0);
    return;
  }

  const timeoutMs = getTimeoutMs(cardState);
  if (!timeoutMs) {
    pushLog(cardState.logEl, "Timeout must be a positive number.");
    setStatus(cardState, "invalid", 0, 0, 0, 0);
    return;
  }

  resetCard(cardState);
  cardState.running = true;
  cardState.startBtn.disabled = true;
  pushLog(cardState.logEl, `Starting provider with model=${model}, timeout=${timeoutMs}ms...`);

  try {
    const { runId } = await fetchJson("/api/start-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId, model, timeoutMs }),
    });

    const stream = new EventSource(`/api/events?runId=${encodeURIComponent(runId)}`);
    cardState.stream = stream;

    stream.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleEvent(cardState, message);
    };

    stream.onerror = () => {
      if (cardState.running) {
        pushLog(cardState.logEl, "Event stream disconnected.");
      }
      closeStream(cardState);
    };
  } catch (error) {
    cardState.running = false;
    cardState.startBtn.disabled = false;
    setStatus(cardState, "failed", 0, 0, 0, 0);
    pushLog(cardState.logEl, `Start failed: ${error.message}`);
  }
}

function handleEvent(cardState, event) {
  const elapsed = event.elapsedMs || 0;
  const attempts = event.attempts || 0;
  const invalidMoveCount = event.invalidMoveCount || 0;
  const timeoutCount = event.timeoutCount || 0;

  if (event.type === "queued") {
    setStatus(cardState, "queued", elapsed, attempts, invalidMoveCount, timeoutCount);
    pushLog(cardState.logEl, `Queued run ${event.runId}`);
    return;
  }

  if (event.type === "started") {
    setStatus(cardState, "running", elapsed, attempts, invalidMoveCount, timeoutCount);
    cardState.currentBoard = boardCopy(event.board);
    renderBoard(cardState.boardEl, cardState.currentBoard, cardState.basePuzzle);
    pushLog(cardState.logEl, "Run started.");
    return;
  }

  if (event.type === "attempt") {
    setStatus(cardState, "running", elapsed, attempts, invalidMoveCount, timeoutCount);
    pushLog(cardState.logEl, `Step ${event.step}, attempt ${event.attempt}/${event.retries}`);
    return;
  }

  if (event.type === "move") {
    setStatus(cardState, "running", elapsed, attempts, invalidMoveCount, timeoutCount);
    cardState.currentBoard = boardCopy(event.board);
    renderBoard(cardState.boardEl, cardState.currentBoard, cardState.basePuzzle, event.move);
    pushLog(
      cardState.logEl,
      `Move: row=${event.move.row}, col=${event.move.col}, value=${event.move.value} (step ${event.step})`,
    );
    return;
  }

  if (event.type === "invalid_output") {
    setStatus(cardState, "running", elapsed, attempts, invalidMoveCount, timeoutCount);
    pushLog(cardState.logEl, `Invalid output: ${event.reason} (count=${invalidMoveCount})`);
    return;
  }

  if (event.type === "error") {
    setStatus(cardState, "running", elapsed, attempts, invalidMoveCount, timeoutCount);
    pushLog(cardState.logEl, `Error: ${event.reason}`);
    return;
  }

  if (event.type === "timeout") {
    setStatus(cardState, "running", elapsed, attempts, invalidMoveCount, timeoutCount);
    pushLog(cardState.logEl, `Timed out (count=${timeoutCount}).`);
    return;
  }

  if (event.type === "step_skipped") {
    setStatus(cardState, "running", elapsed, attempts, invalidMoveCount, timeoutCount);
    pushLog(cardState.logEl, `Step ${event.step} skipped: ${event.reason}`);
    return;
  }

  if (event.type === "finished") {
    cardState.running = false;
    if (cardState.provider.enabled) {
      cardState.startBtn.disabled = false;
    }
    const status = event.status || "finished";
    setStatus(cardState, status, elapsed, attempts, invalidMoveCount, timeoutCount);

    if (status === "solved" && event.board) {
      cardState.currentBoard = boardCopy(event.board);
      renderBoard(cardState.boardEl, cardState.currentBoard, cardState.basePuzzle);
      pushLog(cardState.logEl, "Solved successfully.");
    } else {
      pushLog(cardState.logEl, `Finished with status=${status}${event.reason ? `, reason=${event.reason}` : ""}`);
    }

    closeStream(cardState);
  }
}

async function init() {
  try {
    const data = await fetchJson("/api/providers");
    state.config = data;

    metaEl.textContent = `Puzzle: ${data.puzzleLevel} | retries=${data.retries} | maxSteps=${data.maxSteps} | stepDelay=${data.stepDelayMs}ms`;

    const localIds = new Set(["ollama", "lmstudio"]);
    const localProviders = data.providers.filter((p) => localIds.has(p.id));
    const thirdPartyProviders = data.providers.filter((p) => !localIds.has(p.id));
    const orderedProviders = [...localProviders, ...thirdPartyProviders];

    for (const provider of orderedProviders) {
      const timeoutDefault =
        provider.id === "ollama" || provider.id === "lmstudio"
          ? Math.max(data.timeoutMs, 180000)
          : data.timeoutMs;
      const targetEl = localIds.has(provider.id) ? localGridEl : thirdPartyGridEl;
      createProviderCard(provider, data.initialPuzzle, timeoutDefault, targetEl);
    }

    if (data.providers.length === 0) {
      metaEl.textContent = "No providers available.";
      startAllBtn.disabled = true;
    }
  } catch (error) {
    metaEl.textContent = `Failed to load config: ${error.message}`;
    startAllBtn.disabled = true;
  }
}

startAllBtn.addEventListener("click", async () => {
  for (const [providerId, card] of state.cards.entries()) {
    if (!card.running && card.provider.enabled) {
      await startProvider(providerId);
    }
  }
});

resetBtn.addEventListener("click", () => {
  for (const cardState of state.cards.values()) {
    resetCard(cardState);
  }
});

init();
