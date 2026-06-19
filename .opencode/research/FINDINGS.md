# MLX Ranker — Research Findings

## Project Vision
Build a comprehensive hardware-aware LLM inference tool that:
1. **Detects hardware** (Apple Silicon, NVIDIA GPU, AMD GPU, CPU-only)
2. **Recommends optimal inference engine** (MLX, Ollama, llama.cpp, vLLM) per platform
3. **Recommends best models** for use cases (coding, reasoning, general, creative)
4. **Generates optimal configuration** (temperature, context window, quantization, GPU layers)
5. **Handles setup** — installation commands, model pulling, config generation

## Key Findings

### 1. LLM Checker (Reference Architecture)
- **Source**: github.com/Pavelevich/llm-checker (2.7k ⭐, v3.6.0)
- **Language**: JavaScript (97%), Node.js runtime, SQLite catalog
- **Scope**: Ollama-only inference engine. Detects hardware via `systeminformation` npm package.
- **Scoring**: 4D deterministic scoring (Quality, Speed, Fit, Context)
- **Limitations**: Ollama-centric, no multi-engine support, no actual model download/setup
- **Key gap for our project**: Does NOT support MLX, llama.cpp, or vLLM directly. Does NOT generate engine config files.

### 2. Hardware Detection Approaches
- **Apple Silicon**: `platform.machine() == "arm64"`, `sysctl` for chip model, RAM, cores
- **NVIDIA GPUs**: `nvidia-smi` query or `pynvml` Python library
- **AMD GPUs**: `rocm-smi` or `amdsmi` Python library
- **CPU features**: `/proc/cpuinfo` flags (AVX, AVX2, AVX512), `psutil` for cores/RAM
- **PyTorch**: `torch.cuda.is_available()`, `torch.backends.mps.is_available()` for quick checks
- **MLX detection**: `import mlx.core as mx; mx.metal.is_available()`

### 3. Engine Platform Matrix
| Engine | Apple Silicon | NVIDIA (Linux) | NVIDIA (Win) | AMD ROCm | CPU-only | Notes |
|--------|--------------|----------------|--------------|----------|----------|-------|
| **MLX** | ✅ Native (Metal) | ✅ New CUDA backend | ❌ | ❌ | ✅ Linux CPU | Best perf on Mac |
| **Ollama** | ✅ (MLX+llama.cpp) | ✅ (CUDA) | ✅ (CUDA) | ✅ (HIP) | ✅ | Easiest setup, wraps engines |
| **llama.cpp** | ✅ Metal | ✅ CUDA | ✅ CUDA | ✅ HIP | ✅ Best | Broadest HW support |
| **vLLM** | ⚠️ Plugin (MLX) | ✅ Native | ❌ WSL | ✅ ROCm | ✅ CPU mode | Production throughput king |

### 4. Best Engine Per Platform
- **Apple Silicon 8-16GB**: MLX (unified memory advantage) or Ollama+MLX backend
- **Apple Silicon 32GB+**: MLX (can run 27B-70B Q4 models)
- **NVIDIA GPU**: vLLM for production, llama.cpp for single-user, Ollama for quick testing
- **AMD GPU**: llama.cpp (HIP/ROCm) for best compatibility
- **CPU-only**: llama.cpp (best CPU optimization, AVX512/AMX support)

### 5. Recommended Models by Use Case
**Coding (current best, June 2026):**
- Tier 1 (>32GB): Gemma-4-12b-coder-fable5 Q4_K_M or Qwen3.6-27B Q4_K_M
- Tier 2 (16GB): Gemma-4-12b-coder-fable5 Q4_K_M or Qwen3.5-9B-OptiQ-4bit
- Tier 3 (8GB): Qwen3.5-4B-OptiQ-4bit or Qwen3.5-35B-A3B-OptiQ-4bit (MoE)
- Best value: Qwen3.5-35B-A3B-OptiQ-4bit (35B MoE, 3B active, fits 8GB)

**Reasoning:**
- DeepSeek-R1-Distill-Qwen-32B Q4_K_M (best local reasoning)
- DeepSeek-R1-Distill-Qwen-14B Q4_K_M (good for 16GB)

### 6. Configuration Benchmarks
- **Code generation**: temp=0.1-0.2, top_p=0.1, repeat_penalty=1.1
- **Reasoning**: temp=0.6-0.7, top_p=0.95 (DeepSeek R1 recommended)
- **Chat**: temp=0.6-0.8, top_p=0.9, repeat_penalty=1.1-1.15
- **Quantization sweet spot**: Q4_K_M (best quality/speed/RAM tradeoff)
- **KV cache formula**: 2 * layers * hidden_dim * context_length * dtype_bytes

### 7. Critical Architecture Decision
The tool should be **Python-based** (unlike llm-checker's JavaScript) because:
- MLX is Python-native (`pip install mlx`)
- Hardware detection libraries (psutil, pynvml, amdsmi) are Python-first
- llama.cpp has mature Python bindings (`llama-cpp-python`)
- vLLM is Python-native
- Cross-platform detection is easier in Python
- Model conversion (MLX format) requires Python

---

## Extended Analysis: Extending llm-checker with MLX Support

### Core Finding
Expanding llm-checker (not forking) is the **recommended approach**. The architecture already has ~60% of MLX scaffolding in place:
- `SUPPORTED_RUNTIMES = ['ollama', 'vllm', 'mlx']` in `src/runtime/runtime-support.js`
- MLX install/pull/run command generation already exists
- MLX-specific MoE runtime profiles in `src/models/moe-assumptions.js`
- MLX-specific speed coefficients in scoring engine
- Issue #10 and PR #12 show the author is receptive to MLX support

### What Already Exists in llm-checker for MLX

| Component | Status | Location |
|-----------|--------|----------|
| Runtime registration | ✅ Done | `src/runtime/runtime-support.js` |
| Install commands | ✅ Done | `getRuntimeInstallCommand('mlx')` |
| Pull (convert) commands | ✅ Done | `getRuntimePullCommand()` → `mlx_lm.convert` |
| Run commands | ✅ Done | `getRuntimeRunCommand()` → `mlx_lm.generate` |
| MoE speed assumptions | ✅ Done | `moe-assumptions.js` — MLX runtime profile |
| Scoring engine runtime pass | ✅ Done | `runtime` parameter flows through scoring |
| **Actual model execution** | ❌ Missing | `OllamaClient` hardcoded in `ai-run` |
| **MLX model catalog** | ❌ Missing | SQLite synced from Ollama registry only |
| **MLX quantization mapping** | ❌ Missing | Only GGUF quants normalized |

### What Needs to Be Added

**Critical path (P0):**
1. `src/mlx/client.js` — New MLX execution client supporting two modes:
   - **oMLX mode**: Talk to oMLX OpenAI-compatible API (`/v1/chat/completions`)
   - **Direct MLX mode**: Subprocess calling `mlx_lm.generate` directly
2. Dispatch logic in `src/index.js` for `ai-run --runtime mlx`
3. `--runtime` CLI flag in `bin/enhanced_cli.js`

**Important (P1):**
4. Apple Silicon hardware detection enhancement — check `mlx` package availability
5. MLX speed coefficients in token-speed-estimator.js
6. MLX quantization normalization in deterministic-selector.js

**Nice to have (P2):**
7. HuggingFace/MLX model catalog sync source
8. MCP tools for MLX in `bin/mcp-server.mjs`

### oMLX as the Integration Path

oMLX (github.com/jundot/omlx, 16.8k ⭐) provides an **OpenAI-compatible API** that makes integration straightforward:

| Ollama endpoint | oMLX (OpenAI) endpoint |
|----------------|----------------------|
| `POST /api/chat` | `POST /v1/chat/completions` |
| `POST /api/generate` | `POST /v1/completions` |
| `GET /api/tags` | `GET /v1/models` |
| Health: `GET /` | `GET /health` |

**Key oMLX advantages as mlx backend:**
- Drop-in OpenAI API — same request/response format as Ollama's OpenAI compat mode
- Richer model management: LRU eviction, tiered KV cache (hot RAM + cold SSD), pinning, TTL
- Auto model discovery from `--model-dir` subdirectories
- Built-in MCP server infrastructure
- Per-model config via `~/.omlx/model_settings.json`
- Built-in benchmark tool (prefill + generation tok/s)
- Thinking/reasoning support (DeepSeek R1 style, thinking budget)

**Key oMLX differences from Ollama:**
- Port 8000 (not 11434)
- Apple Silicon / macOS only (MLX framework dependency)
- MLX safetensors model format (not GGUF)
- No API endpoint for model pulling (admin UI or HF CLI)

### Fork vs Contribute Upstream

| Factor | Contribute Upstream | Fork |
|--------|-------------------|------|
| Author receptiveness | ✅ Merged MLX-related PRs before | ❌ Solo maintainer risk |
| Architecture fit | ✅ Designed for multi-runtime | ⚠️ Ollama-centric branding |
| Community | ✅ 2.7k stars benefit | ❌ Need own user base |
| Timeline | ⚠️ PR review may take time | ✅ Full control |

**Recommendation: Start by contributing upstream** — the runtime scaffolding and scoring changes would likely be accepted. Create a PR adding `src/mlx/client.js` and `--runtime mlx` flag. If the PR sits idle >1 month, fork.

### Estimated Effort
- **Working MLX backend with oMLX**: ~5-10 days
- **Full integration with catalog, tests, MCP**: ~15-20 days

---

## 8. KV Cache Optimization (New Findings, June 2026)

Research from Google AI confirmed these critical MLX optimization parameters:

### KV Cache Quantization (`--kv-bits`)
- Default: FP16 (2 bytes per KV cache element)
- With `--kv-bits 4`: 4-bit quantization of KV cache → 4x memory reduction
- Quality impact: Zero (KV cache quant has negligible effect on output quality)
- Speed impact: Dramatically faster decode for long contexts (less memory bandwidth pressure)
- Impact on 48GB system: Saves 8-15GB RAM depending on context length

### Context Window Limiting (`--max-kv-size`)
- Gemma 4 supports up to 256K context natively
- Unbounded context can consume 15GB+ RAM for long sessions
- Recommended default: 32K (covers 95% of use cases, ~50 pages text)
- Formula: KV Cache RAM = 2 * layers * hidden_dim * context_length * (kv_bits/8) / 1024^3

### OS-Level Optimization (`iogpu.wired_mem_limit`)
- macOS defaults limit GPU-accessible RAM to ~32-36GB on 48GB systems
- Can be raised: `sudo sysctl iogpu.wired_mem_limit=44000` (sets ~42GB limit)
- Critical for running 35B+ models or BF16 versions with large context
- Not persistent across reboots

### Recommended Server Command (48GB M4 Pro)
```
mlx_lm.server --model mlx-community/gemma-4-12B-it-qat-bf16 \
  --max-kv-size 32768 \
  --kv-bits 4 \
  --trust-remote-code
```

### Python API Equivalent
```python
from mlx_lm import load, generate
model, tokenizer = load(
    "mlx-community/gemma-4-12B-it-qat-bf16",
    tokenizer_config={"kv_bits": 4}
)
```

## 9. Modern MLX Quantization Formats (Gemma 4 QAT Family)

Google's Gemma 4 introduced QAT (Quantization-Aware Training) — models quantized during training, not after. This yields better quality at the same bit-width.

### Gemma 4 12B QAT Format Matrix

| Format | Size | Quality | Speed on M4 Pro | Notes |
|--------|------|---------|-----------------|-------|
| bf16 | 22.3 GB | 100% (baseline) | Good | Full precision |
| mxfp8 | 11.7 GB | ~99.5% | Extreme | M4 native HW acceleration |
| 8bit/oQ8-fp16 | 11.8 GB | ~99.5% | Very Fast | Software 8-bit fallback |
| 6bit | 11.0 GB | ~98% | Very Fast | Middle ground |
| 5bit | 10.6 GB | ~97% | Very Fast | Better than uniform 4-bit |
| nvfp4 | 10.4 GB | ~96% | Fast | NVIDIA-oriented format |
| 4bit | 10.2 GB | ~95% | Fast | Standard 4-bit uniform |
| mxfp4 | 10.2 GB | ~95% | Fast | M4 HW accelerated 4-bit |
| OptiQ-4bit | ~7.8 GB | ~97% | Extreme | Mixed precision (8-bit sensitive layers + 4-bit robust) |

### Key Insight: OptiQ-4bit vs Uniform 4-bit
- OptiQ-4bit uses sensitivity analysis to keep critical layers in 8-bit
- Effective average: ~5.25 bits/param (not true 4-bit)
- Quality much closer to bf16 than uniform 4-bit
- Ideal for 16GB-24GB systems; on 48GB, bf16 or mxfp8 still preferred

### MXFP8 (M4 Native)
- OCP Microscaling format with HW support on M4/M4 Pro/M4 Max
- No quality loss penalty vs 8-bit
- ~2x faster than equivalent software 8-bit due to native processing units
- Recommended default for M4-series when compression desired

## 10. MoE Architecture Notation

Models use shorthand in names:
- `Qwen3.6-35B-A3B`: 35B total params, 3B active per token
- `Gemma-4-26B-a4b`: 26B total, 4B active per token

| Notation | Meaning | Example |
|----------|---------|---------|
| A3B (Active) | 3B params computed per token | Qwen3.6-35B-A3B |
| E (Effective/Total) | Total params across all experts | Not always explicit |
| No suffix | Dense model — all params active | Gemma-4-12B |

Our model catalog already uses `isMoE` + `activeParamsB`. We could add auto-parsing from model names.

## 11. Hardware Quantization Standards

Low-level formats relevant for M4-series:

| Standard | Meaning | Relevance |
|----------|---------|-----------|
| W4A16 | Weights 4-bit, Activations 16-bit | Common MLX quant |
| W8A16 | Weights 8-bit, Activations 16-bit | Higher quality |
| wNa8o8 | Mobile-optimized Google format | Low relevance for desktop |
| MXFP8/4 | OCP Microscaling formats | M4 native HW acceleration |
