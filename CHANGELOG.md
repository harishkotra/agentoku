# Changelog

All notable changes to this project will be documented in this file.

## [v2.0.0] - 2026-04-19

### Summary

This release is an incremental upgrade over v1, focused on one-shot inference benchmarking, cost-awareness, and smoother provider usability.

### Added

- New one-shot page at `/one-shot`.
- Single-run one-shot UX:
  - one Sudoku input board
  - provider selector
  - model selection/input
  - one-click full solve
- New API endpoint: `POST /api/solve-once`.
- Runtime API key input support for OpenAI and Featherless in one-shot flow.
- Token/cost estimator panel on one-shot page (toggle hidden by default).
- New documentation files:
  - `docs/TECHNICAL_BLOG.md`
  - `docs/SOCIAL_POSTS.md`

### Changed

- Prompt strategy optimized for lower token overhead in full-solve mode.
- OpenAI and Featherless provider metadata now supports runtime auth model (`requiresApiKey`, `hasApiKey`).
- README rewritten to describe project as v2 increment from v1.

### Validation & Safety

- One-shot responses remain strictly validated for:
  - 9x9 board shape
  - clue preservation
  - Sudoku constraints
  - fully solved board

### UX

- One-shot page simplified from multi-card layout to a single, minimal control surface.
- Added estimator show/hide control to keep the page clean by default.

### Migration Notes (v1 -> v2)

- Existing step-by-step page `/` continues to work.
- New one-shot functionality is additive; no breaking API changes to v1 routes.
- For OpenAI/Featherless runs without env keys, users can now pass key at runtime in one-shot UI.

---

## [v1.0.0] - 2026-04-18

### Summary

Initial release of Agentoku as a multi-provider, step-by-step Sudoku race.

### Added

- Provider support:
  - OpenAI
  - Ollama
  - LM Studio
  - Featherless (OpenAI-compatible)
- Shared agent interface with `solve(board, mode)`.
- Step-by-step orchestration with retries/timeouts.
- Strict JSON parsing and Sudoku board validation.
- Real-time web UI with SSE updates.
- Provider grouping in UI:
  - local models
  - third-party models
- Per-provider model config and timeout controls.

### Reliability

- Invalid move continuation (instead of immediate hard-stop).
- Invalid move and timeout counters surfaced in UI.
