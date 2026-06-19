# Extending llm-checker with MLX Support — Strategy Document

## Overview
This document outlines the strategy for extending the existing [llm-checker](https://github.com/Pavelevich/llm-checker) tool (v3.6.0, 2.7k ⭐) with MLX backend support, Apple Silicon hardware detection improvements, MLX model discovery, and configuration generation for both direct MLX and oMLX.

## Why Extend llm-checker Instead of Building from Scratch

### Pros
- **~60% of MLX scaffolding already exists** in llm-checker (runtime support, MoE profiles, speed estimation)
- **Mature codebase** — 198 commits, 15 releases, active maintainer
- **4D scoring system** is runtime-agnostic and well-tested
- **Existing user base** — 2.7k stars, Apple Silicon users benefit immediately
- **NPDL-1.0 license** allows modification (only restricts paid hosting)
- **Author receptive** — already merged MLX-related PRs (#12, #28)

### Cons
- **JavaScript codebase** — MLX ecosystem is Python-first
- **Solo maintainer risk** — PRs may sit idle
- **Ollama-centric catalog** — HuggingFace/MLX model sync is fundamentally different
- **109KB index.js** — hard to modify without deep understanding

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     llm-checker (existing)                   │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐   │
│  │ HW Detection │→│Model Scoring │→│  Recommendation    │   │
│  │ (5 backends) │  │(4D: Q,S,F,C)│  │  + Pull/Run Cmds  │   │
│  └─────────────┘  └──────────────┘  └───────────────────┘   │
│                        │                                      │
│                        ▼                                      │
│  ┌──────────────────────────────────────────────────────┐    │
│  │              Execution Layer (NEW)                    │    │
│  │  ┌──────────────┐  ┌──────────────────┐              │    │
│  │  │ OllamaClient │  │   MLXClient       │             │    │
│  │  │ (existing)   │  │   (NEW)           │             │    │
│  │  │ :11434/api/* │  ├──────────────────┤             │    │
│  │  └──────────────┘  │ Mode A: oMLX API  │             │    │
│  │                     │ :8000/v1/chat/    │             │    │
│  │                     │   completions     │             │    │
│  │                     ├──────────────────┤             │    │
│  │                     │ Mode B: Direct    │             │    │
│  │                     │ mlx_lm.generate   │             │    │
│  │                     │ (subprocess)      │             │    │
│  │                     └──────────────────┘             │    │
│  └──────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Foundation (Days 1-3)
**Goal**: Basic `--runtime mlx` flag that can generate commands and test oMLX connectivity

| Step | File(s) | Description |
|------|---------|-------------|
| 1.1 | `src/mlx/client.js` (NEW) | MLXClient class with `chat()`, `generate()`, `listModels()` methods |
| 1.2 | `src/mlx/client.js` | Mode A: oMLX OpenAI-compatible API client (HTTP) |
| 1.3 | `src/mlx/client.js` | Mode B: Direct subprocess via `mlx_lm.generate` |
| 1.4 | `src/index.js` | Add `--runtime mlx` dispatch in `ai-run` command |
| 1.5 | `bin/enhanced_cli.js` | Add `--runtime` CLI flag to relevant commands |
| 1.6 | Test | Test `ai-run --runtime mlx --mode omlx` with local oMLX server |

#### MLXClient Class Design

```javascript
class MLXClient {
  constructor(options = {}) {
    this.mode = options.mode || 'omlx'; // 'omlx' | 'direct'
    this.baseURL = options.baseURL || 'http://localhost:8000/v1';
    this.modelDir = options.modelDir || '~/.mlx/models';
  }

  // Mode A: oMLX API
  async chat(model, messages, options = {}) {
    // POST /v1/chat/completions
    // Parse streaming response for token metrics
    const response = await this._request('/chat/completions', {
      model, messages,
      temperature: options.temperature,
      max_tokens: options.max_tokens,
      stream: true,
      ...options
    });
    return this._parseChatResponse(response);
  }

  async generate(model, prompt, options = {}) {
    // POST /v1/completions (or /v1/chat/completions for instruct models)
  }

  // Mode B: Direct subprocess
  async generateDirect(model, prompt, options = {}) {
    const args = this._buildMlxArgs(model, prompt, options);
    const proc = spawn('python', ['-m', 'mlx_lm.generate', ...args]);
    // Stream stdout, calculate tokens/sec
  }

  // Model listing
  async listModels() {
    if (this.mode === 'omlx') {
      // GET /v1/models → parse data[{id}]
    } else {
      // List ~/.mlx/models/ directories
    }
  }

  // Speed benchmark
  async benchmark(model, prompt) {
    // Time the generation, return tokens/sec
    return { tokensPerSecond, timeToFirstToken, totalTime };
  }
}
```

### Phase 2: Apple Silicon Detection Enhancement (Days 3-5)
**Goal**: Better Apple Silicon detection for MLX-specific recommendations

| Step | File | Description |
|------|------|-------------|
| 2.1 | `src/hardware/backends/apple-silicon.js` | Add `mlxAvailable()` check (try `require.resolve('mlx-lm')`) |
| 2.2 | Same | Add unified memory bandwidth detection |
| 2.3 | Same | Add `mx.metal.is_available()` detection |
| 2.4 | `src/utils/token-speed-estimator.js` | Add MLX-specific speed coefficients for Apple Silicon |
| 2.5 | `src/models/scoring-config.js` | Add MLX runtime scoring weights |

#### Apple Silicon Detection Additions

```javascript
function mlxAvailable() {
  try {
    // Check if mlx-lm is installed
    require.resolve('mlx-lm');
    return true;
  } catch {
    return false;
  }
}

function getUnifiedMemoryBandwidth() {
  // Apple Silicon memory bandwidth by chip
  const bandwidthMap = {
    'M1': 70,     // GB/s
    'M1 Pro': 200,
    'M1 Max': 400,
    'M1 Ultra': 800,
    'M2': 100,
    'M2 Pro': 200,
    'M2 Max': 400,
    'M2 Ultra': 800,
    'M3': 100,
    'M3 Pro': 150,
    'M3 Max': 300,
    'M4': 120,
    'M4 Pro': 200,
    'M4 Max': 400,
  };
  return bandwidthMap[chipName] || 100; // fallback
}
```

### Phase 3: MLX Model Discovery & Catalog (Days 5-8)
**Goal**: LLM Checker can discover and recommend MLX-format models

| Step | File | Description |
|------|------|-------------|
| 3.1 | `src/mlx/model-catalog.js` (NEW) | HuggingFace MLX Community model fetcher |
| 3.2 | `src/data/sync-manager.js` | Add `mlx-sync` command for HuggingFace catalog |
| 3.3 | `src/models/deterministic-selector.js` | MLX quantization normalization (`4bit`, `8bit` → canonical) |
| 3.4 | Same | Add `mlx-community/` model families to quality priors |
| 3.5 | Test | Verify `recommend --runtime mlx` returns valid MLX models |

#### MLX Quantization Mapping

```javascript
const MLX_QUANT_MAP = {
  'fp32': { bits: 32, bytesPerParam: 4, qualityPenalty: -30 },
  'fp16': { bits: 16, bytesPerParam: 2, qualityPenalty: 0 },
  'fp8':  { bits: 8,  bytesPerParam: 1, qualityPenalty: -1 },
  '8bit': { bits: 8,  bytesPerParam: 1, qualityPenalty: 0 },
  '6bit': { bits: 6,  bytesPerParam: 0.75, qualityPenalty: -2 },
  '5bit': { bits: 5,  bytesPerParam: 0.625, qualityPenalty: -3 },
  '4bit': { bits: 4,  bytesPerParam: 0.5, qualityPenalty: -5 },
  'OptiQ-4bit': { bits: 4, bytesPerParam: 0.5, qualityPenalty: -3 }, // Better than raw 4bit
};
```

### Phase 4: Configuration Generation (Days 8-10)
**Goal**: Generate ready-to-use config files for MLX and oMLX

| Step | File | Description |
|------|------|-------------|
| 4.1 | `src/config/generator.js` (NEW) | Config file generator for MLX and oMLX |
| 4.2 | Same | Generate `mlx_lm.generate` command with optimal params |
| 4.3 | Same | Generate oMLX `model_settings.json` snippet |
| 4.4 | Same | Generate Ollama Modelfile (for comparison) |
| 4.5 | `src/index.js` | Add `config` command or integrate into `recommend` |

#### Config Generator Design

```javascript
class ConfigGenerator {
  generateMLXRunCommand(model, hardware, useCase) {
    const config = this.getOptimalConfig(useCase);
    return `mlx_lm.generate --model ${model.hfPath} \\
      --temp ${config.temperature} \\
      --top-p ${config.topP} \\
      --max-tokens ${config.maxTokens} \\
      --repetition-penalty ${config.repeatPenalty}`;
  }

  generateOMLXSettings(model, useCase) {
    const config = this.getOptimalConfig(useCase);
    return {
      [model.name]: {
        temperature: config.temperature,
        top_p: config.topP,
        max_tokens: config.maxTokens,
        repetition_penalty: config.repeatPenalty,
      }
    };
  }

  getOptimalConfig(useCase) {
    const presets = {
      'coding': { temperature: 0.15, topP: 0.1, maxTokens: 4096, repeatPenalty: 1.1 },
      'reasoning': { temperature: 0.6, topP: 0.95, maxTokens: 16384, repeatPenalty: 1.0 },
      'chat': { temperature: 0.7, topP: 0.9, maxTokens: 2048, repeatPenalty: 1.1 },
      'creative': { temperature: 0.85, topP: 0.95, maxTokens: 4096, repeatPenalty: 1.15 },
    };
    return presets[useCase] || presets['chat'];
  }
}
```

### Phase 5: MCP & Polish (Days 10-15)
**Goal**: MCP server integration, testing, documentation

| Step | File | Description |
|------|------|-------------|
| 5.1 | `bin/mcp-server.mjs` | Add `mlx_list_models`, `mlx_run`, `mlx_optimize` tools |
| 5.2 | Tests | MLX-specific test fixtures and E2E tests |
| 5.3 | README | Document `--runtime mlx` and oMLX integration |
| 5.4 | Package | Add `mlx-lm` as optional dependency? |

#### MCP Tools to Add

```javascript
server.tool(
  'mlx_list_models',
  { mode: z.string().optional() },
  async ({ mode }) => {
    const client = new MLXClient({ mode: mode || 'omlx' });
    const models = await client.listModels();
    return { content: [{ type: 'text', text: JSON.stringify(models) }] };
  }
);

server.tool(
  'mlx_optimize',
  { model: z.string(), use_case: z.string() },
  async ({ model, use_case }) => {
    const gen = new ConfigGenerator();
    const config = gen.getOptimalConfig(use_case);
    return { content: [{ type: 'text', text: JSON.stringify(config) }] };
  }
);
```

## oMLX-Specific Integration Details

### Connection Flow
1. Check if oMLX is running (`GET /health` → 200)
2. If not running, offer to start it (`omlx start` or `brew services start omlx`)
3. List available models (`GET /v1/models`)
4. Run inference (`POST /v1/chat/completions`)
5. Parse response for token metrics

### Default oMLX Configuration for Each Use Case

```json
{
  "coding": {
    "temperature": 0.15,
    "top_p": 0.1,
    "max_tokens": 4096,
    "repetition_penalty": 1.1,
    "stop": ["</s>", "```"]
  },
  "reasoning": {
    "temperature": 0.6,
    "top_p": 0.95,
    "max_tokens": 16384,
    "repetition_penalty": 1.0,
    "thinking_budget": 4096
  }
}
```

### Direct MLX Mode (Without oMLX)

For users who don't want to run a server:

```bash
# Single inference
mlx_lm.generate --model mlx-community/Qwen3.5-9B-OptiQ-4bit \
  --temp 0.15 --top-p 0.1 --max-tokens 4096 \
  --prompt "Write a Python function to..."

# With custom KV cache
mlx_lm.generate --model ... --max-kv-size 4096

# With quantization
mlx_lm.generate --model ... --kv-bits 4 --kv-group-size 64
```

## Migration Path

### Current State
```
llm-checker v3.6.0
  ├── HW Detection (Apple Silicon, NVIDIA, AMD, Intel, CPU)
  ├── Model Scoring (4D: Q/S/F/C)
  ├── Recommendation (model name + ollama pull command)
  └── Execution (ai-run → Ollama only)
```

### After Adding MLX Support
```
llm-checker v4.0 (extended)
  ├── HW Detection (enhanced Apple Silicon + mlx availability)
  ├── Model Scoring (4D with MLX-specific weights)
  ├── Recommendation
  │   ├── Ollama path → ollama pull <model>
  │   └── MLX path → mlx_lm.convert/download <hf-model>
  ├── Execution
  │   ├── ai-run --runtime ollama (existing)
  │   ├── ai-run --runtime mlx --mode omlx (NEW: oMLX API)
  │   └── ai-run --runtime mlx --mode direct (NEW: subprocess)
  └── Config Generation (NEW)
      ├── mlx_lm.generate command
      ├── oMLX model_settings.json
      └── Ollama Modelfile
```

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Upstream PR not merged | Medium | High | Design as standalone module; fork if needed |
| oMLX API changes | Low | Medium | Pin oMLX version; use OpenAI-compat stable endpoints |
| MLX Linux CUDA instability | Medium | Low | Flag as "experimental" on Linux |
| Apple Silicon model catalog size | High | Medium | Lazy sync; paginate HF API calls |
| Python deps for JS project | High | Low | Keep MLX client as optional; graceful fallback |
