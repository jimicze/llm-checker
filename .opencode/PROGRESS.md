# Progress

> Persistent task tracker across sessions. Updated when starting, completing, or pausing work.

---

## Current Sprint: MLX Backend Implementation

**Goal:** Extend llm-checker with MLX backend support for Apple Silicon.

### In Progress

- No active tasks.

### Completed

| Date | Task | Details |
|------|------|---------|
| 2026-06-19 | **All 10 tasks complete** | MLX backend fully implemented and committed |
| 2026-06-19 | Task 0: Fork & repo setup | Cloned llm-checker v3.6.0, npm install, git init |
| 2026-06-19 | Task 1: src/mlx/client.js | MLXClient class (365 lines, 7 tests) — oMLX API + direct subprocess |
| 2026-06-19 | Task 2: Apple Silicon MLX | Added mlxAvailable(), mlxInfo(), effectiveMemory, MLX speed multiplier |
| 2026-06-19 | Task 3: CLI --runtime flag | ai-run dispatchuje na MLX backend, --runtime mlx flag |
| 2026-06-19 | Task 4: src/config/generator.js | ConfigGenerator (124 lines, 6 tests) — presets pro 8 use cases, 4 enginy |
| 2026-06-19 | Task 5: src/mlx/model-catalog.js | MLXModelCatalog (130 lines, 6 tests) — 15 seed modelů + HF API |
| 2026-06-19 | Task 6: Wire into LLMChecker | MLXClient + ConfigGenerator integrovány do LLMChecker třídy |
| 2026-06-19 | Task 7: MCP tools | 3 tooly: mlx_list_models, mlx_generate, mlx_optimize |
| 2026-06-19 | Task 8: Integration tests | 8 integration testů (21 total MLX testů) |
| 2026-06-19 | Task 9: Documentation | mlx-guide.md, PR_TEMPLATE.md, README update |
| 2026-06-19 | Task 10: Final verification | 33/33 testů prochází, commit f5fb5ec |

---

## Next Sprint: Phase 2 Features

### Planned (not started)
- [ ] Add `--runtime mlx` to `check`, `installed` commands
- [ ] MLX model sync command (`llm-checker mlx-sync`) — sync seed catalog from HuggingFace
- [ ] Linux CUDA MLX support (MLX now supports CUDA backend on Linux)
- [ ] Vylepšený `recommend --runtime mlx` výstup
- [ ] Push PR upstream to Pavelevich/llm-checker (připraven template v `docs/superpowers/PR_TEMPLATE.md`)

## Known Issues

- `mlx_lm.generate` writes progress logs to stderr — the direct mode ignores stderr but this means errors are also swallowed
- `systeminformation` npm package can be slow (1-3s) on first call — this is upstream behavior
- Pool `Worker` cleanup warning in Jest tests — harmless, from upstream's test infra
