# Open Questions & Next Steps

## Architecture Questions
1. **Should the tool be CLI-only or also have a programmatic API?**
   - CLI: `mlx-ranker detect`, `mlx-ranker recommend`, `mlx-ranker setup`
   - API: Python library with `HardwareDetector`, `EngineRecommender`, `ModelRecommender`, `ConfigGenerator`
   - Decision needed: Both (CLI wrapping API) — like llm-checker

2. **Should we support model downloading?**
   - llm-checker only recommends + prints pull commands
   - Our tool could optionally download via `huggingface_hub` or `ollama pull`
   - Risk: Large downloads, need progress tracking, resume support

3. **Config generation format?**
   - JSON config files for each engine?
   - YAML? TOML?
   - Shell export scripts (set env vars)?
   - Ollama Modelfiles?
   - MLX Python startup scripts?

## Technical Questions
4. **How to handle MLX on Linux CUDA?** — Very new backend, unknown stability
5. **Should we integrate Model Context Protocol (MCP)?** — llm-checker has MCP server for Claude Code. Valuable for our tool too.
6. **Database for model catalog?** — SQLite (like llm-checker) or YAML/JSON file? HF Hub API live queries?

## Model Questions
7. **How often to update model catalog?** — HuggingFace models change weekly. Need sync mechanism.
8. **Community model ranking** — Should we maintain our own benchmark data or rely on HF leaderboards?
9. **GGUF vs MLX format preference on Mac?** — MLX format is optimized for MLX engine. GGUF is more portable. Need user preference option.

## Engine Questions
10. **Should we support running models directly, or only recommend/setup?**
    - llm-checker has `ai-run` that runs via Ollama
    - Direct MLX inference is possible with `mlx-lm`
    - Direct llama.cpp inference via subprocess or bindings
    - vLLM requires server setup

11. **Multi-engine fallback** — If recommended engine not installed, suggest fallback?

## Implementation Questions
12. **What Python version to target?** — 3.10+ (MLX requires 3.10+)
13. **Dependency management** — Heavy deps (torch, mlx) vs lightweight detection-first?
14. **Packaging** — PyPI package? Homebrew formula? pipx installable?
15. **Should we detect running Ollama server and query it?** — llm-checker does this for installed models
16. **Windows support priority?** — MLX doesn't run on Windows natively. WSL2 workaround.

## Questions About Extending llm-checker

### Strategy Questions
1. **Fork or PR upstream?** — PR if author responsive (1 month timeout). Otherwise fork to `mlx-ranker/llm-checker`.
2. **JavaScript or Python?** — llm-checker is JS. MLX/omlx is Python. MLXClient in JS would call Python subprocess or HTTP API. Is this acceptable, or should we rewrite scoring in Python too?
3. **Should MLX models be a separate catalog or merged into existing SQLite?** — Separate source (HuggingFace) needs different schema fields (HF model ID, pipeline tag, etc.)

### oMLX-Specific Questions
4. **Default oMLX port (8000) vs Ollama (11434)** — How does llm-checker discover which backend is running? Port scan? Environment variable? CLI flag?
5. **Model pulling** — oMLX has no API for model pulling. Should llm-checker implement `huggingface-cli download` integration for MLX models?
6. **oMLX model_settings.json generation** — Should llm-checker generate per-model config snippets and place them in `~/.omlx/model_settings.json`?

### Technical Questions
7. **OpenAI-compat adapter** — oMLX speaks OpenAI API, Ollama also has OpenAI-compat mode (`/v1/chat/completions`). Should we unify both behind a single OpenAI-compatible client?
8. **Direct MLX subprocess** — `mlx_lm.generate` is designed for interactive use, not API serving. How reliable is it for benchmarking/scripted use?
9. **Scoring with MLX models** — MLX-community models have different naming conventions (OptiQ-4bit, MXFP4-Q8). Can we map these to llm-checker's existing quantization tiers?
10. **Apple Silicon memory estimation** — MLX uses unified memory. The "available for models" calculation is different from (total - OS). What's the correct formula?

### Model Questions
11. **Which MLX models to include in catalog seed?** — Top 50 from mlx-community by downloads? Only coding-focused? All with >10k downloads?
12. **oMLX or direct MLX as default?** — oMLX provides richer features (KV cache, multi-model, MCP). Direct MLX is simpler but less featured. Which should `ai-run --runtime mlx` default to?
