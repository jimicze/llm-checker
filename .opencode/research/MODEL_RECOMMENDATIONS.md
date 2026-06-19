# Model Recommendations & Configuration Guide

## Coding Models (Ranked, June 2026)

| Rank | Model | Params | Best Quant | RAM | t/s (M4) | t/s (4090) |
|------|-------|--------|-----------|-----|---------|-----------|
| 1 | Gemma-4-12b-coder-fable5 | 12B | Q4_K_M | 8GB | 40-55 | — |
| 2 | Qwen3.5-9B-OptiQ-4bit | 9B | Q4_K_M | 6GB | 50-65 | 80-110 |
| 3 | Qwen3.5-35B-A3B-OptiQ-4bit | 35B MoE | Q4_K_M | 6GB | 30-50 | 45-65 |
| 4 | DeepSeek-Coder-V2-Lite | 16B MoE | Q4_K_M | 5GB | 35-55 | 60-85 |
| 5 | Qwen3.5-4B-OptiQ-4bit | 4B | Q4_K_M | 3GB | 80-100 | 120-160 |

**Optimal coding config:**
```json
{
  "temperature": 0.15,
  "top_p": 0.1,
  "top_k": 40,
  "repeat_penalty": 1.1,
  "max_tokens": 4096
}
```

## Reasoning Models

| Model | Params | Best Quant | RAM | Notes |
|-------|--------|-----------|-----|-------|
| DeepSeek-R1-Distill-Qwen-32B | 32B | Q4_K_M | 19GB | Best local reasoning |
| DeepSeek-R1-Distill-Qwen-14B | 14B | Q4_K_M | 9GB | Good for 16GB |
| DeepSeek-R1-Distill-Qwen-7B | 7B | Q4_K_M | 4.5GB | Entry-level |
| DeepSeek-R1-Distill-Qwen-1.5B | 1.5B | Q4_K_M | 1.2GB | Tiny reasoning |

**Optimal reasoning config (DeepSeek R1 recommended):**
```json
{
  "temperature": 0.6,
  "top_p": 0.95,
  "min_p": 0.0,
  "repeat_penalty": 1.0,
  "max_tokens": 16384
}
```

## General Purpose Models

| Model | Params | Best Quant | RAM | Use Case |
|-------|--------|-----------|-----|----------|
| Qwen3.6-27B-OptiQ-4bit | 27B | Q4_K_M | 16GB | Best overall 27B |
| Mistral-Small-3.1-24B | 24B | Q4_K_M | 14GB | Best 24B class |
| Gemma-4-27B | 27B | Q4_K_M | 16GB | Google's latest |
| Mistral-3.1-8B | 8B | Q4_K_M | 5GB | Very efficient |
| Phi-4-mini-3.8B | 3.8B | Q4_K_M | 3GB | Best tiny model |

## Hardware Tier → Model Mapping

### 8GB Systems
- **Best coding**: Qwen3.5-4B-OptiQ-4bit (3GB)
- **Best general**: Phi-4-mini-3.8B (3GB)
- **Reasoning**: DeepSeek-R1-Distill-Qwen-7B (4.5GB)
- **Secret weapon**: Qwen3.5-35B-A3B-OptiQ-4bit MoE (6GB)

### 16GB Systems
- **Best coding**: Gemma-4-12b-coder-fable5 Q4_K_M (8GB)
- **Best general**: Qwen3.5-9B-OptiQ-4bit (6GB) or 35B MoE (6GB)
- **Best reasoning**: DeepSeek-R1-Distill-Qwen-14B (9GB)

### 32GB+ Systems
- **Best coding**: Qwen3.6-27B-OptiQ-4bit (16GB) or Gemma-4-12B Q8_0 (12GB)
- **Best general**: Gemma-4-27B Q4_K_M (16GB)
- **Best reasoning**: DeepSeek-R1-Distill-Qwen-32B Q4_K_M (19GB)
- **Max quality**: Llama 4-70B Q4_K_M (42GB) on 64GB systems

## Quantization Guide

| Quant | Bits/Param | Quality Loss | Speed | When to Use |
|-------|-----------|-------------|-------|-------------|
| Q4_K_M | 4.5 | ~0.5-1.5% | Fast | **Default — best tradeoff** |
| Q5_K_M | 5.06 | ~0.1-0.5% | Moderate | When RAM permits |
| Q8_0 | 8.25 | ~0% | Moderate | Small models only |
| Q3_K_M | 3.35 | ~2-5% | Very Fast | Tight RAM only |
| Q2_K | 2.56 | ~5-10% | Fastest | Emergency only |

## Temperature Quick Reference

| Use Case | Temperature | Top-P | Repeat Penalty |
|----------|------------|-------|---------------|
| Code gen | 0.1-0.2 | 0.1 | 1.1 |
| Code review | 0.1-0.15 | 0.85 | 1.0 |
| Debugging | 0.2-0.3 | 0.9 | 1.1 |
| Creative writing | 0.7-0.9 | 0.95 | 1.15 |
| Chat | 0.6-0.8 | 0.9 | 1.1 |
| Reasoning | 0.0-0.2 | 1.0 | 1.0 |
| Translation | 0.1-0.3 | 0.3 | 1.05 |
