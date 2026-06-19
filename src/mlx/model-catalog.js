/**
 * MLX Model Catalog
 *
 * Provides model discovery and recommendations for MLX-format models
 * from HuggingFace mlx-community and other sources.
 *
 * Includes a curated seed list of popular MLX models for offline use,
 * and optional live queries to HuggingFace API.
 */

const MLX_SEED_MODELS = [
    // Coding models
    { name: 'Qwen3.5-9B-OptiQ-4bit', hfPath: 'mlx-community/Qwen3.5-9B-OptiQ-4bit', paramsB: 9, quantization: 'OptiQ-4bit', category: 'coding', isMoE: false, context: 131072 },
    { name: 'Qwen3.5-4B-OptiQ-4bit', hfPath: 'mlx-community/Qwen3.5-4B-OptiQ-4bit', paramsB: 4, quantization: 'OptiQ-4bit', category: 'coding', isMoE: false, context: 131072 },
    { name: 'Qwen3.5-35B-A3B-OptiQ-4bit', hfPath: 'mlx-community/Qwen3.5-35B-A3B-OptiQ-4bit', paramsB: 35, quantization: 'OptiQ-4bit', category: 'coding', isMoE: true, activeParamsB: 3, context: 131072 },
    { name: 'Gemma-4-12b-coder-fable5-4bit', hfPath: 'mlx-community/Gemma-4-12b-coder-fable5-composer2.5-4bit', paramsB: 12, quantization: '4bit', category: 'coding', isMoE: false, context: 32768 },
    { name: 'CodeGemma-4-2B-4bit', hfPath: 'mlx-community/CodeGemma-4-2B-4bit', paramsB: 2, quantization: '4bit', category: 'coding', isMoE: false, context: 16384 },
    { name: 'DeepSeek-Coder-V2-Lite-4bit', hfPath: 'mlx-community/DeepSeek-Coder-V2-Lite-Instruct-4bit', paramsB: 16, quantization: '4bit', category: 'coding', isMoE: true, activeParamsB: 2.4, context: 131072 },
    // Reasoning models
    { name: 'DeepSeek-R1-Distill-Qwen-32B-4bit', hfPath: 'mlx-community/DeepSeek-R1-Distill-Qwen-32B-4bit', paramsB: 32, quantization: '4bit', category: 'reasoning', isMoE: false, context: 65536 },
    { name: 'DeepSeek-R1-Distill-Qwen-14B-4bit', hfPath: 'mlx-community/DeepSeek-R1-Distill-Qwen-14B-4bit', paramsB: 14, quantization: '4bit', category: 'reasoning', isMoE: false, context: 65536 },
    { name: 'DeepSeek-R1-Distill-Qwen-7B-4bit', hfPath: 'mlx-community/DeepSeek-R1-Distill-Qwen-7B-4bit', paramsB: 7, quantization: '4bit', category: 'reasoning', isMoE: false, context: 32768 },
    // General models
    { name: 'Qwen3.6-27B-OptiQ-4bit', hfPath: 'mlx-community/Qwen3.6-27B-OptiQ-4bit', paramsB: 27, quantization: 'OptiQ-4bit', category: 'general', isMoE: false, context: 131072 },
    { name: 'Gemma-4-27B-4bit', hfPath: 'mlx-community/Gemma-4-27B-4bit', paramsB: 27, quantization: '4bit', category: 'general', isMoE: false, context: 32768 },
    { name: 'Mistral-Small-3.1-24B-4bit', hfPath: 'mlx-community/Mistral-Small-3.1-24B-Instruct-4bit', paramsB: 24, quantization: '4bit', category: 'general', isMoE: false, context: 32768 },
    { name: 'Mistral-3.1-8B-4bit', hfPath: 'mlx-community/Mistral-3.1-8B-Instruct-4bit', paramsB: 8, quantization: '4bit', category: 'general', isMoE: false, context: 32768 },
    { name: 'Phi-4-mini-3.8B-4bit', hfPath: 'mlx-community/Phi-4-mini-instruct-4bit', paramsB: 3.8, quantization: '4bit', category: 'general', isMoE: false, context: 16384 },
];

const QUANT_MAP = {
    '4bit': 'Q4_K_M',
    '8bit': 'Q8_0',
    'fp16': 'FP16',
    'OptiQ-4bit': 'Q4_K_M',
    'MXFP4-Q8': 'Q4_K_M',
    'Q4_K_M': 'Q4_K_M',
    'Q8_0': 'Q8_0',
    'FP16': 'FP16'
};

class MLXModelCatalog {
    constructor(options = {}) {
        this.hfEndpoint = options.hfEndpoint || 'https://huggingface.co/api';
        this.models = options.models || [...MLX_SEED_MODELS];
    }

    getPopularCodingModels() {
        return this.models.filter(m => m.category === 'coding');
    }

    getPopularReasoningModels() {
        return this.models.filter(m => m.category === 'reasoning');
    }

    getPopularGeneralModels() {
        return this.models.filter(m => m.category === 'general');
    }

    getAllModels() {
        return this.models;
    }

    getModelByHardware(totalMemoryGB, useCase = 'general') {
        const effectiveMemoryGB = Math.max(0, totalMemoryGB - 4) * 0.6;
        const candidates = useCase === 'coding' ? this.getPopularCodingModels()
            : useCase === 'reasoning' ? this.getPopularReasoningModels()
            : this.getPopularGeneralModels();

        return candidates
            .map(m => {
                const mem = this.getMemoryEstimate(m.paramsB, m.quantization, 4096);
                if (m.isMoE) {
                    const activeMem = this.getMemoryEstimate(m.activeParamsB || m.paramsB * 0.1, m.quantization, 4096);
                    return { ...m, ...mem, totalGB: activeMem.totalGB, totalForMoE: mem.totalGB, activeTotalGB: activeMem.totalGB };
                }
                return { ...m, ...mem };
            })
            .filter(m => m.totalGB <= effectiveMemoryGB)
            .sort((a, b) => a.totalGB - b.totalGB);
    }

    normalizeQuantization(quant) {
        return QUANT_MAP[quant] || quant || 'Q4_K_M';
    }

    getMemoryEstimate(paramsB, quantization, contextLength = 4096) {
        const bytesPerParam = {
            'Q4_K_M': 0.58, 'Q8_0': 1.05, 'FP16': 2.0,
            '4bit': 0.5, '8bit': 1.0, 'OptiQ-4bit': 0.5,
            'fp16': 2.0
        };
        const bpp = bytesPerParam[quantization] || 0.58;
        const weightGB = (paramsB * 1e9 * bpp) / (1024 ** 3);
        const kvCacheGB = contextLength / 2048 * Math.min(3, paramsB * 0.1);
        const overheadGB = weightGB * 0.15;
        const totalGB = weightGB + kvCacheGB + overheadGB;

        return {
            weightGB: Math.round(weightGB * 100) / 100,
            kvCacheGB: Math.round(kvCacheGB * 100) / 100,
            overheadGB: Math.round(overheadGB * 100) / 100,
            totalGB: Math.round(totalGB * 100) / 100,
            paramsB,
            quantization
        };
    }

    async searchHuggingface(query = 'mlx-community', limit = 20) {
        try {
            const url = `${this.hfEndpoint}/models?search=${encodeURIComponent(query)}&sort=downloads&direction=-1&limit=${limit}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!response.ok) return [];
            const data = await response.json();
            return data.map(m => ({
                hfPath: m.modelId || m.id,
                name: (m.modelId || m.id).split('/').pop(),
                downloads: m.downloads || 0,
                pipeline: m.pipeline_tag || 'text-generation'
            }));
        } catch (e) {
            return [];
        }
    }
}

module.exports = MLXModelCatalog;
