# Memory

> Persistent context for cross-session memory. Updated when making architectural decisions, discovering patterns, or noting user preferences.

---

## Decisions

### 2026-06-19: Extend llm-checker rather than build from scratch

**Context:** Deciding whether to build a new tool or extend the existing llm-checker.

**Decision:** Extend llm-checker with MLX backend support. Fork → implement → submit public PR upstream.

**Reasoning:**
- llm-checker already has ~60% of MLX scaffolding (runtime registration, command generation, MoE profiles, speed estimation)
- 4D scoring system is runtime-agnostic and well-tested
- 2.7k stars — existing community of Apple Silicon users would benefit
- Author is receptive (already merged MLX-related PRs #12, #28)
- NPDL-1.0 license allows modification

**Alternative considered:** Building from scratch in Python (more natural for MLX ecosystem). Rejected because scoring system and HW detection would need complete rewrite.

### 2026-06-19: Strategy = fork + upstream PR

**Context:** How to manage the relationship with the upstream llm-checker repository.

**Decision:**
1. Fork llm-checker to private repo
2. Implement MLX backend
3. Submit clean PR upstream
4. If PR sits idle >1 month, maintain as standalone fork

### 2026-06-19: oMLX as primary MLX integration path

**Context:** Two options for running MLX models — oMLX API server or direct mlx_lm subprocess.

**Decision:** oMLX API mode is default. Direct mode is fallback.

**Reasoning:**
- oMLX provides OpenAI-compatible API — same request/response as Ollama's OpenAI compat mode
- Returns structured performance metrics (`usage.generation_tokens_per_second`)
- Tiered KV cache, multi-model serving, built-in MCP — richer feature set
- Direct mode needed for users who don't want a running server

### 2026-06-19: Separate MLX model catalog (not SQLite)

**Context:** llm-checker stores model metadata in SQLite synced from Ollama registry.

**Decision:** Create `src/mlx/model-catalog.js` as a separate curated catalog with HuggingFace API integration. Do NOT extend the SQLite schema.

**Reasoning:**
- MLX models use HuggingFace model IDs, not Ollama registry tags
- SQLite schema is tightly coupled to Ollama metadata format
- Separate catalog is simpler and avoids modifying existing schema
- Can still feed MLX models through the same scoring system

### 2026-06-19: JavaScript for MLX client (not Python)

**Context:** MLX ecosystem is Python-first, but llm-checker is JavaScript.

**Decision:** Write MLXClient in JavaScript, calling Python subprocesses or HTTP APIs.

**Reasoning:**
- Keeps the codebase homogeneous (97% JS already)
- oMLX API mode needs only HTTP requests — perfect for JS
- Direct mode: spawn Python as subprocess (same pattern llm-checker uses for other external tools)
- Avoids the complexity of maintaining two language ecosystems

---

## Patterns

### llm-checker Upstream Patterns

- **Lazy loading:** Heavy modules loaded inside methods, not at module level:
  ```javascript
  getLLMChecker() {
      if (!_LLMChecker) {
          _LLMChecker = require('../src/index');
      }
      return _LLMChecker;
  }
  ```
- **Availability pattern:** `checkAvailability()` returns status object, throws only on actual operations
- **Error wrapping:** All errors wrapped with descriptive messages: `throw new Error(\`Failed to X: ${error.message}\`)`
- **Async everywhere:** All I/O operations are async (HTTP calls, subprocess, filesystem)
- **Config via env vars:** User-configurable via environment variables with sensible defaults
- **Graceful fallback:** If a backend is unavailable, show helpful error message rather than crashing

### NEW MLX Code Patterns (to establish)

- MLX modules in `src/mlx/` — sibling to `src/ollama/`
- MLX client follows OllamaClient pattern but simpler (OpenAI API vs custom API)
- ConfigGenerator is a utility class, not a client — no async, no state
- Model catalog has offline seed (no network needed) + optional API live queries

---

## User Preferences

- **Language:** Python preferred for MLX work, but pragmatic about using JS to match llm-checker
- **Execution strategy:** Prefers subagent-driven development (parallel work) over sequential
- **Documentation:** Comprehensive, with real code examples
- **Testing:** TDD approach — write tests first, then implement
- **Code quality:** Clean code, no unnecessary comments, small focused files

---

## Project Notes

### llm-checker v3.6.0 Key Stats
- 198 commits, 15 releases
- Solo maintainer (Pavelevich) — responsive to PRs
- 2.7k stars, 174 forks
- NPDL-1.0 license (free use, no paid distribution)
- Latest release: June 10, 2026

### Important Upstream Files for MLX Extension
| File | Lines | Key Content |
|---|---|---|
| `src/index.js` | 2513 | `LLMChecker` class — main orchestration |
| `bin/enhanced_cli.js` | 5589 | All CLI commands, `ai-run` handler at line 4451 |
| `src/ollama/client.js` | 834 | `OllamaClient` — template for `MLXClient` |
| `src/runtime/runtime-support.js` | 187 | Runtime commands — already has MLX |
| `src/models/moe-assumptions.js` | 311 | MoE profiles — already has MLX |
| `src/hardware/backends/apple-silicon.js` | 322 | Apple Silicon detector — needs MLX methods |
| `src/utils/token-speed-estimator.js` | 236 | TPS estimation — needs MLX multipliers |
| `bin/mcp-server.mjs` | 1368 | MCP server — needs MLX tools |

### Research Documents Index
| File | Purpose |
|---|---|
| `.opencode/research/FINDINGS.md` | Core findings, engine matrix, model tiers, config benchmarks |
| `.opencode/research/EXTENDING_LLM_CHECKER.md` | Detailed extension strategy, 5-phase plan, risk analysis |
| `.opencode/research/ENGINE_COMPARISON.md` | Cross-engine platform matrix and performance benchmarks |
| `.opencode/research/HARDWARE_DETECTION_REFERENCE.md` | Code snippets for all HW detection approaches |
| `.opencode/research/MODEL_RECOMMENDATIONS.md` | Ranked model tables, tier mappings, config presets |
| `.opencode/research/QUESTIONS.md` | Open architecture and implementation questions |
| `.opencode/research/SOURCES.md` | All reference URLs |
