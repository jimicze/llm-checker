# Sources & References

## Reference Tools
- **llm-checker**: https://github.com/Pavelevich/llm-checker — Reference architecture (JS, Ollama-only)
- **oMLX**: https://github.com/jundot/omlx — MLX inference server (16.8k ⭐)

## Inference Engines
- **MLX**: https://github.com/ml-explore/mlx — Apple ML framework (27k ⭐, MIT)
- **mlx-lm**: https://github.com/ml-explore/mlx-examples — LLM inference for MLX
- **Ollama**: https://github.com/ollama/ollama — Multi-engine wrapper (175k ⭐)
- **llama.cpp**: https://github.com/ggml-org/llama.cpp — C++ inference (117k ⭐)
- **vLLM**: https://github.com/vllm-project/vllm — Production serving (83k ⭐)

## Model Sources
- **MLX Community**: https://huggingface.co/mlx-community — 5,111+ pre-converted MLX models
- **HuggingFace Leaderboard**: https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard
- **MLX Benchmark Leaderboard**: https://huggingface.co/spaces/mlx-community/mlx-benchmark-leaderboard

## Hardware Detection References
- **nvidia-smi**: NVIDIA GPU monitoring CLI
- **rocm-smi**: AMD ROCm GPU monitoring CLI
- **pynvml**: Python NVIDIA Management Library (`pip install nvidia-ml-py3`)
- **psutil**: Python system monitoring (`pip install psutil`)
- **py-cpuinfo**: CPU feature detection (`pip install py-cpuinfo`)
- **systeminformation**: Node.js hardware detection (used by llm-checker)

## Configuration References
- **llama.cpp C API**: `include/llama.h` — All sampler chain params
- **Ollama API**: `api/types.go` — Options struct parameters
- **MLX sampling**: `mlx_lm/sample_utils.py` — make_sampler, make_logits_processors
- **vLLM SamplingParams**: `vllm/sampling_params.py` — Full parameter class

## Model References
- **DeepSeek R1**: https://huggingface.co/deepseek-ai/DeepSeek-R1
- **Qwen3.5**: https://huggingface.co/Qwen — Qwen3.5-9B, Qwen3.5-35B-A3B (MoE)
- **Gemma 4**: https://huggingface.co/google/gemma-4-12b-coder
- **Llama 4**: https://huggingface.co/meta-llama/Llama-4-17B
- **Mistral**: https://huggingface.co/mistralai/Mistral-Small-3.1-24B
