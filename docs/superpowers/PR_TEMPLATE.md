## Summary

Adds MLX backend support to llm-checker — hardware detection, model discovery,
configuration generation, and inference execution via oMLX API or direct mlx-lm
subprocess.

## Changes

### New Files
- `src/mlx/client.js` — MLX execution client (oMLX API + direct modes)
- `src/mlx/index.js` — Barrel export
- `src/mlx/model-catalog.js` — HuggingFace MLX model discovery with curated seed
- `src/config/generator.js` — Multi-engine config generator (MLX, oMLX, Ollama, llama.cpp)
- `docs/guides/mlx-guide.md` — Complete MLX backend documentation
- `docs/superpowers/PR_TEMPLATE.md` — This PR template

### Modified Files
- `src/hardware/backends/apple-silicon.js` — Added MLX availability detection,
  MLX-aware speed estimation, effective memory calculation
- `src/index.js` — Integrated MLXClient and ConfigGenerator into LLMChecker class
- `bin/enhanced_cli.js` — Added `--runtime` flag to ai-run, recommend commands
- `bin/mcp-server.mjs` — Added MLX tools (mlx_list_models, mlx_generate, mlx_optimize)

### Test Files
- `tests/mlx-client.test.js` — 7 tests for MLXClient
- `tests/apple-silicon-mlx.test.js` — 6 tests for MLX hardware detection
- `tests/config-generator.test.js` — 6 tests for ConfigGenerator
- `tests/mlx-model-catalog.test.js` — 6 tests for MLXModelCatalog
- `tests/mlx-integration.test.js` — 8 integration tests

## Architecture

MLX support follows the same pattern as the existing Ollama backend:

```
CLI (--runtime mlx flag)
  → MLXClient
    → Mode A: oMLX HTTP API (:8000/v1/*)
    → Mode B: mlx_lm.generate (subprocess)
  → MLXModelCatalog (seed + HuggingFace API)
  → ConfigGenerator (mlx, omlx, ollama, llamacpp)
```

## Usage

```bash
# Check MLX availability
llm-checker ai-run --runtime mlx --reference-only

# Run with oMLX
llm-checker ai-run --runtime mlx --prompt "Hello"

# Run with direct MLX
MLX_MODE=direct llm-checker ai-run --runtime mlx --prompt "Hello"

# Get recommendations
llm-checker recommend --category coding --runtime mlx
```

## Testing

All existing tests pass. New MLX tests (use Jest):

```bash
npx jest tests/mlx-client.test.js
npx jest tests/apple-silicon-mlx.test.js
npx jest tests/config-generator.test.js
npx jest tests/mlx-model-catalog.test.js
npx jest tests/mlx-integration.test.js
```

## Checklist

- [x] MLX execution client (oMLX API + direct subprocess)
- [x] Apple Silicon detection with MLX availability check
- [x] `--runtime` CLI flag for ai-run, recommend
- [x] MLX model catalog with curated seed models
- [x] Multi-engine config generator
- [x] MCP tools for MLX
- [x] Complete test coverage (33 tests)
- [x] Documentation
