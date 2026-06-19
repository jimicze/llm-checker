# Hardware Detection Reference

## Apple Silicon Detection

### Architecture Detection
```python
import platform
def is_apple_silicon():
    return platform.system() == "Darwin" and platform.machine() == "arm64"
```

### Chip Model & Cores
```python
import subprocess

chip_name = subprocess.run(["sysctl", "-n", "machdep.cpu.brand_string"], 
                          capture_output=True, text=True).stdout.strip()
# Examples: "Apple M3 Pro", "Apple M1 Max", "Apple M4"

perf_cores = subprocess.run(["sysctl", "-n", "hw.perflevel0.logicalcpu"],
                           capture_output=True, text=True).stdout.strip()
eff_cores = subprocess.run(["sysctl", "-n", "hw.perflevel1.logicalcpu"],
                          capture_output=True, text=True).stdout.strip()
```

### RAM Detection
```python
import psutil
ram_total = psutil.virtual_memory().total / (1024**3)  # GB
ram_available = psutil.virtual_memory().available / (1024**3)  # GB
```

### GPU Cores (Apple Silicon)
```python
# Use system_profiler SPDisplaysDataType -xml
# Then parse plist for sppci_cores key
```

### MLX Availability
```python
try:
    import mlx.core as mx
    metal_available = mx.metal.is_available()
    device = mx.default_device()
except ImportError:
    metal_available = False
```

## NVIDIA GPU Detection

### Using nvidia-smi
```bash
nvidia-smi --query-gpu=index,name,memory.total,memory.free,compute_cap,driver_version \
           --format=csv,noheader,nounits
```

### Using pynvml (Python)
```python
import pynvml
pynvml.nvmlInit()
handle = pynvml.nvmlDeviceGetHandleByIndex(0)
name = pynvml.nvmlDeviceGetName(handle)
mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
vram_gb = mem.total / 1024**3
```

### Using PyTorch
```python
import torch
cuda_available = torch.cuda.is_available()
device_count = torch.cuda.device_count()
props = torch.cuda.get_device_properties(0)
# props.name, props.total_memory, props.major, props.minor
```

## AMD GPU Detection

### Using rocm-smi
```bash
rocm-smi --showproductinfo --showmeminfo vram --json
```

## CPU Feature Detection

### Using /proc/cpuinfo (Linux)
```python
with open("/proc/cpuinfo") as f:
    for line in f:
        if line.startswith("flags"):
            flags = line.split(":")[1].split()
            avx2 = "avx2" in flags
            avx512f = "avx512f" in flags
```

### Using py-cpuinfo
```python
import cpuinfo
info = cpuinfo.get_cpu_info()
# info['flags'], info['arch'], info['brand']
```

## Memory Estimation for Models

| Model | Q4_K_M | Q8_0 | KV Cache (4K) | KV Cache (32K) |
|-------|--------|------|---------------|----------------|
| 1B | 0.7 GB | 1.3 GB | 0.3 GB | 0.5 GB |
| 3B | 1.9 GB | 3.5 GB | 0.5 GB | 1.5 GB |
| 7B | 4.2 GB | 7.8 GB | 2.0 GB | 4.0 GB |
| 12B | 7.2 GB | 13 GB | 3.0 GB | 6.0 GB |
| 27B | 16 GB | 29 GB | 6.0 GB | 12 GB |
| 35B | 21 GB | 38 GB | 8.0 GB | 16 GB |
| 70B | 42 GB | 76 GB | 12 GB | 24 GB |

## Recommended Python Libraries

| Library | Purpose | Install |
|---------|---------|---------|
| `psutil` | CPU/RAM/system | `pip install psutil` |
| `torch` | CUDA/MPS detection | `pip install torch` |
| `mlx` | Apple Silicon ML | `pip install mlx` |
| `nvidia-ml-py3` | NVIDIA pynvml | `pip install nvidia-ml-py3` |
| `py-cpuinfo` | CPU features | `pip install py-cpuinfo` |
| `gputil` | Simple GPU info | `pip install gputil` |
