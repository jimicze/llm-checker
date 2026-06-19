# LLM Inference Engine Comparison

## Platform Support Matrix

| Feature | MLX | Ollama | llama.cpp | vLLM |
|---------|-----|--------|-----------|------|
| **Apple Silicon** | ✅ Native Metal | ✅ MLX + llama.cpp | ✅ Metal | ⚠️ Plugin |
| **NVIDIA CUDA** | ✅ Linux only | ✅ Native | ✅ Native | ✅ Native |
| **NVIDIA Windows** | ❌ | ✅ | ✅ | ❌ (WSL) |
| **AMD ROCm** | ❌ | ✅ (HIP) | ✅ (HIP) | ✅ (ROCm 6.3+) |
| **Intel GPU** | ❌ | ❌ | ✅ (SYCL) | ✅ (XPU) |
| **CPU-only** | ✅ Linux | ✅ | ✅ Best | ✅ |
| **Windows** | ❌ | ✅ | ✅ | ❌ (WSL) |
| **Mobile** | ❌ | ❌ | ✅ (Android) | ❌ |

## Performance Characteristics

### Apple Silicon (M4 Max, 4-bit quant)
| Model Size | MLX (tok/s) | llama.cpp Metal (tok/s) | Ollama+MLX (tok/s) |
|-----------|-------------|------------------------|-------------------|
| 3B | 120-150 | 90-110 | 110-140 |
| 7B | 60-80 | 45-60 | 55-70 |
| 12B | 40-55 | 30-40 | 35-45 |
| 27B | 20-30 | 15-22 | 18-26 |
| 35B (MoE) | 30-65 | 25-40 | 28-50 |
| 70B | 8-12 | 5-8 | 7-11 |

### NVIDIA RTX 4090 (4-bit quant)
| Model Size | vLLM (tok/s) | llama.cpp CUDA (tok/s) | Ollama CUDA (tok/s) |
|-----------|-------------|----------------------|-------------------|
| 7B | 100-140 | 80-110 | 75-100 |
| 13B | 60-80 | 45-60 | 40-55 |
| 34B | 25-35 | 18-25 | 16-22 |
| 70B | — (OOM) | — (OOM) | — (OOM) |

## Key Differentiators

### MLX (Apple's Framework)
- **Unified memory**: System RAM = GPU memory. No PCIe transfer overhead.
- Can run models larger than dedicated GPU VRAM limits
- Best perf on Mac for LLM inference (1.5-2x faster than llama.cpp Metal)
- Also supports Linux CUDA now (v0.31+)
- NOT an inference server — it's an array framework with mlx-lm for LLMs

### Ollama (Wrapper)
- **Easiest setup**: One-command install, `ollama pull model`, `ollama run model`
- **Multi-backend**: Uses llama.cpp by default, MLX on Apple Silicon optionally
- **OpenAI-compatible API**: Built-in REST server
- **Model library**: Hundreds of curated models, Modelfile customization
- **Best for**: Quick prototyping, desktop apps, mixed-platform teams

### llama.cpp (C++ Engine)
- **Broadest platform support**: 11+ GPU backends, CPU, mobile, web
- **GGUF format**: Most portable model format, largest ecosystem
- **Extensive quantization**: Q2-Q8, IQ1-IQ4, imatrix for better quality
- **Most configurable**: Sampler chain API, full control
- **Best for**: Cross-platform deployment, edge devices, CPU inference

### vLLM (Production Engine)
- **PagedAttention**: Efficient memory management for serving
- **Continuous batching**: High throughput for concurrent requests
- **Best for**: Production serving, high concurrency, multi-GPU
- **Linux-centric**: Primary target is NVIDIA CUDA Linux

## Decision Flowchart

```
What is your primary platform?
├── Apple Silicon Mac
│   ├── Need best performance? → MLX
│   └── Want simplest setup? → Ollama (MLX backend)
├── NVIDIA GPU (Linux)
│   ├── Production serving? → vLLM
│   └── Single user / CLI? → llama.cpp (CUDA)
├── NVIDIA GPU (Windows) → Ollama or llama.cpp
├── AMD GPU (Linux) → llama.cpp (HIP) or vLLM (ROCm)
├── CPU-only → llama.cpp
└── Mixed team → Ollama (unified API across platforms)
```
