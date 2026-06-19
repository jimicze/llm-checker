# MLX Backend Guide

## Overview

llm-checker now supports MLX (Apple's machine learning framework) as a first-class
inference backend alongside Ollama. This guide covers setup, usage, and configuration.

## Prerequisites

- Apple Silicon Mac (M1, M2, M3, or M4)
- macOS 14.0+ (Sonoma) or newer
- Python 3.10+ (native ARM, not Rosetta)

## Installation

### Option A: oMLX (Recommended — Full Server)

```bash
# Install oMLX via Homebrew
brew tap jundot/omlx && brew install omlx

# Start the server
omlx serve --model-dir ~/models
```

oMLX provides an OpenAI-compatible API on `http://localhost:8000/v1` with:
- Continuous batching, tiered KV cache, multi-model serving
- Web admin dashboard at `http://localhost:8000/admin`
- Built-in MCP server support
- Per-model configuration via `~/.omlx/model_settings.json`

### Option B: Direct MLX (Lightweight, No Server)

```bash
pip install -U mlx-lm

# Run a model
mlx_lm.generate --model mlx-community/Qwen3.5-4B-OptiQ-4bit --prompt "Hello"
```

## Usage with llm-checker

### Detect MLX hardware

```bash
llm-checker hw-detect --runtime mlx
```

### Get MLX model recommendations

```bash
llm-checker recommend --category coding --runtime mlx
```

### Run a model via MLX

```bash
# Using oMLX API (default)
llm-checker ai-run --runtime mlx --models mlx-community/Qwen3.5-4B-OptiQ-4bit

# Using direct mlx-lm subprocess
MLX_MODE=direct llm-checker ai-run --runtime mlx --models mlx-community/Qwen3.5-4B-OptiQ-4bit

# With a prompt
llm-checker ai-run --runtime mlx --models mlx-community/Qwen3.5-9B-OptiQ-4bit --prompt "Write a Python function"

# Reference mode (show recommendations without running)
llm-checker ai-run --runtime mlx --reference-only
```

### Use case categories

```bash
# Coding-optimized (temp=0.15, top_p=0.1, max_tokens=4096)
llm-checker ai-run --runtime mlx --category coding --prompt "Sort a list"

# Reasoning (temp=0.6, top_p=0.95, max_tokens=16384)
llm-checker ai-run --runtime mlx --category reasoning --prompt "Solve this math problem"

# Chat (temp=0.7, top_p=0.9, max_tokens=2048)
llm-checker ai-run --runtime mlx --category chat --prompt "Hello, how are you?"
```

## Model Recommendations

### Best for each hardware tier

| RAM | Coding | Reasoning | General |
|-----|--------|-----------|---------|
| 8GB | Qwen3.5-4B-OptiQ-4bit (3GB) | DeepSeek-R1-Distill-Qwen-7B | Phi-4-mini-3.8B |
| 16GB | Gemma-4-12b-coder (8GB) | DeepSeek-R1-Distill-Qwen-14B | Qwen3.5-9B-OptiQ-4bit |
| 32GB | Qwen3.6-27B-OptiQ-4bit (16GB) | DeepSeek-R1-Distill-Qwen-32B | Gemma-4-27B |
| 64GB | Any 70B@4bit | DeepSeek-R1-70B | Llama 4-70B |

## MCP Integration

When using llm-checker MCP server with MLX:

```bash
claude mcp add llm-checker -- npx llm-checker-mcp

# Available MLX tools in Claude Code:
# - mlx_list_models — List available MLX models
# - mlx_generate — Run inference with MLX
# - mlx_optimize — Get optimal config for use case
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MLX_HOST` | `http://localhost:8000` | oMLX server URL |
| `MLX_MODE` | `omlx` | Client mode: `omlx` or `direct` |
| `MLX_MODEL_DIR` | `~/.mlx/models` | Local model directory |
| `OMLX_HOST` | `http://localhost:8000` | oMLX host (alias) |
