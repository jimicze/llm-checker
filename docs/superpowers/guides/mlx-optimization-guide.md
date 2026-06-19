# MLX Optimization Guide

Advanced optimization techniques for running LLMs with MLX on Apple Silicon.

---

## 1. KV Cache Optimization

### The Problem
KV cache is the hidden memory cost. For a 7B model with 32K context:
- Weights: ~4GB (Q4)
- KV cache: ~4GB (FP16)
- **Total: 8GB** — doubles your memory usage!

### Solution: `--kv-bits 4`

MLX supports quantized KV cache with **zero quality loss**:

```bash
# Without optimization (4GB KV cache for 7B@32K)
mlx_lm.generate --model mlx-community/Qwen3.5-7B-4bit --prompt "Hello"

# With KV cache optimization (1GB KV cache, same quality)
mlx_lm.generate --model mlx-community/Qwen3.5-7B-4bit \
  --kv-bits 4 \
  --max-kv-size 32768 \
  --prompt "Hello"
```

### KV Cache Memory Formula

| Context | FP16 KV Cache | 4-bit KV Cache | Savings |
|---------|--------------|----------------|---------|
| 8K | 1GB | 0.25GB | 4x |
| 32K | 4GB | 1GB | 4x |
| 128K | 16GB | 4GB | 4x |

### Server Mode

```bash
# Optimized oMLX server config
mlx_lm.server --model mlx-community/Qwen3.5-9B-OptiQ-4bit \
  --max-kv-size 65536 \
  --kv-bits 4 \
  --trust-remote-code
```

---

## 2. Quantization Guide

### MXFP8 — The New Standard

MXFP8 delivers **Q8.0 quality at Q4_K_M memory usage**:

| Format | Bits/Param | Quality | Memory (12B model) |
|--------|-----------|---------|-------------------|
| BF16 | 16 | Reference | 24GB |
| MXFP8 | 8 | ~BF16 | 12GB |
| FP16 | 16 | Reference | 24GB |
| Q8_0 | 8 | ~BF16 | 12GB |
| MXFP4 | 4 | Good | 6GB |
| NVFP4 | 4 | Good | 6GB |
| 4-bit | 4 | Good | 6GB |
| OptiQ-4bit | 4 | Better than 4-bit | 6GB |

### QAT (Quantization-Aware Training)

QAT models have **~40% less quality loss** at the same bit-width.
Look for `qat` in the model name.

```bash
# QAT BF16 — reference quality, 12GB for 12B model
mlx_lm.generate --model mlx-community/Gemma-4-12B-it-qat-bf16

# QAT MXFP8 — near-reference quality, 12GB for 12B model
mlx_lm.generate --model mlx-community/Gemma-4-12B-it-qat-mxfp8

# QAT 4-bit — best quality/size tradeoff, 6GB for 12B model
mlx_lm.generate --model mlx-community/Gemma-4-12B-it-qat-4bit
```

### Recommended Configs

| RAM | Coding | Quality | RAM Used |
|-----|--------|---------|----------|
| 8GB | Qwen3.5-35B-A3B-OptiQ-4bit (MoE) | Good | ~6GB |
| 16GB | Gemma-4-12B-qat-mxfp8 | Excellent | ~12GB |
| 16GB | Qwen3.5-9B-OptiQ-4bit | Great | ~6GB |
| 32GB | Qwen3.6-27B-OptiQ-4bit | Best | ~16GB |
| 48GB | Gemma-4-12B-qat-bf16 | Reference | ~12GB |
| 64GB | Gemma-4-27B-4bit | Best | ~27GB |

---

## 3. Hardware Optimization

### Memory Bandwidth Utilization

Apple Silicon memory bandwidth (GB/s) determines maximum tokens/second:

| Chip | Bandwidth | Max tok/s (7B Q4) |
|------|-----------|-------------------|
| M1 | 68 GB/s | ~35 tok/s |
| M1 Pro | 200 GB/s | ~55 tok/s |
| M1 Max | 400 GB/s | ~70 tok/s |
| M2 Pro | 200 GB/s | ~55 tok/s |
| M2 Max | 400 GB/s | ~75 tok/s |
| M3 Pro | 150 GB/s | ~50 tok/s |
| M3 Max | 400 GB/s | ~80 tok/s |
| M4 | 120 GB/s | ~45 tok/s |
| M4 Pro | 273 GB/s | ~65 tok/s |
| M4 Max | 546 GB/s | ~95 tok/s |

### Wired Memory Limit

macOS limits GPU-accessible memory. For large models (>70% of RAM):

```bash
# Check current limit
sysctl iogpu.wired_mem_limit

# Increase limit (example: 48GB RAM → ~42GB limit)
sudo sysctl iogpu.wired_mem_limit=43008

# Formula: (total_RAM_GB - 6GB) * 1024
# 48GB -> 43008
# 32GB -> 26624
# 24GB -> 18432
# 16GB -> 10240
```

### Python API

For custom scripts with KV cache optimization:

```python
import mlx_lm

model, tokenizer = mlx_lm.load(
    "mlx-community/Qwen3.5-9B-OptiQ-4bit",
    tokenizer_config={"kv_bits": 4}
)

response = mlx_lm.generate(
    model, tokenizer,
    prompt="Hello",
    max_tokens=2048,
    temp=0.7
)
```

---

## 4. MoE Models on Low-RAM Systems

Mixture-of-Experts models are ideal for 8GB systems:

| Model | Total | Active | RAM | Notes |
|-------|-------|--------|-----|-------|
| Qwen3.5-35B-A3B-OptiQ-4bit | 35B | 3B | ~6GB | Best for coding |
| DeepSeek-Coder-V2-Lite-4bit | 16B | 2.4B | ~5GB | Coding specialist |

MoE notation: `35B-A3B` means 35B total parameters, 3B active per token.

---

## 5. Recommended Config by Use Case

### Coding
```json
{
  "temperature": 0.15,
  "top_p": 0.1,
  "max_tokens": 4096,
  "repetition_penalty": 1.1,
  "kv_bits": 4
}
```

### Reasoning
```json
{
  "temperature": 0.6,
  "top_p": 0.95,
  "max_tokens": 16384,
  "repetition_penalty": 1.0,
  "kv_bits": 4
}
```

### Chat
```json
{
  "temperature": 0.7,
  "top_p": 0.9,
  "max_tokens": 2048,
  "repetition_penalty": 1.1,
  "kv_bits": 4
}
```

---

## Quick Reference

```bash
# All optimizations enabled for 16GB Mac
mlx_lm.server --model mlx-community/Gemma-4-12B-it-qat-mxfp8 \
  --max-kv-size 65536 \
  --kv-bits 4 \
  --trust-remote-code \
  --temp 0.15

# Before running large models, increase wired limit
sudo sysctl iogpu.wired_mem_limit=10240  # for 16GB Mac

# MoE for 8GB Macs
mlx_lm.generate --model mlx-community/Qwen3.5-35B-A3B-OptiQ-4bit \
  --kv-bits 4 \
  --max-kv-size 8192 \
  --temp 0.15
```
