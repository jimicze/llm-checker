# Learnings

> Self-learning knowledge base. Updated when resolving bugs, discovering gotchas, or learning project-specific lessons. Most recent entries first.

---

## Project Context

This is a fork of [llm-checker](https://github.com/Pavelevich/llm-checker) (v3.6.0, JavaScript/Node.js) being extended with MLX backend support for Apple Silicon. Currently in research/planning phase — no code yet.

---

## 2026-06-19: llm-checker Architecture Findings

### Category: Architecture

#### llm-checker already has ~60% MLX scaffolding
- `SUPPORTED_RUNTIMES = ['ollama', 'vllm', 'mlx']` in `src/runtime/runtime-support.js`
- MLX install/pull/run command generation already implemented
- MLX-specific MoE runtime profiles in `src/models/moe-assumptions.js`
- MLX-aware speed coefficients in scoring engine
- The `--runtime` parameter already flows through the scoring system
- **What's actually missing:** The execution client (`src/mlx/client.js`), the model catalog, and the CLI dispatch wiring

#### llm-checker has a megafile problem
- `src/index.js` = 2513 lines (central LLMChecker class)
- `bin/enhanced_cli.js` = 5589 lines (all CLI commands in one file)
- `bin/mcp-server.mjs` = 1368 lines
- **Lesson:** Add MLX code as separate modules in `src/mlx/` — do NOT bloat the megafiles

#### OllamaClient pattern is the template for MLXClient
- `src/ollama/client.js` (834 lines) is a well-structured HTTP client
- Pattern: `checkAvailability()` → `_doAvailabilityCheck()` → method calls with error wrapping
- `baseURL` normalization, candidate URL fallbacks, timeout handling, streaming NDJSON parsing
- **Lesson:** MLXClient follows the same pattern but simpler (oMLX uses OpenAI-compat, not custom API)

### Category: MLX & oMLX

#### oMLX is the cleanest integration path
- Exposes OpenAI-compatible API on `:8000/v1/*` — same format as Ollama's OpenAI compat mode
- `POST /v1/chat/completions` accepts standard OpenAI request body
- `GET /v1/models` returns `{ data: [{ id, object, created, owned_by }] }`
- No custom API adaptation needed — just standard OpenAI client

#### Direct MLX mode has stdout/stderr complexity
- `mlx_lm.generate` writes progress logs to stderr, generated text to stdout
- When capturing output, stderr must be ignored or parsed separately
- Performance metrics are not returned by default — must measure wall-clock time + token count
- For accurate benchmarking, the oMLX API mode is preferred (it returns `usage.generation_tokens_per_second`)

#### Apple Silicon memory calculation
- Unified memory means system RAM = GPU memory
- OS reserves ~4GB, leaving `total - 4` for applications
- Models should use max 60% of remaining for inference (leaves headroom for KV cache)
- Formula: `effectiveGB = max(0, totalGB - 4) * 0.6`

### Category: Dependencies

#### mlx-lm requires native ARM Python
- If Python runs under Rosetta on Apple Silicon, `mx.metal.is_available()` returns False
- Must detect: `platform.machine() == "arm64"` before attempting MLX
- Minimum Python version: 3.10

#### oMLX requires macOS 15.0+
- `brew tap jundot/omlx && brew install omlx` only works on macOS 15+
- On older macOS: direct MLX mode only (no oMLX API server)

### Category: Testing

#### llm-checker uses two test systems
- Existing tests: raw Node.js assertion scripts (run with `node tests/...`)
- Jest is available in devDependencies (v30.4.2)
- **Lesson:** Use Jest for NEW MLX tests, keep existing test system as-is
