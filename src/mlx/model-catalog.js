/**
 * MLX Model Catalog
 *
 * Provides model discovery and recommendations for MLX-format models.
 * PRIMARY source: mlx-sync-results.json (from HuggingFace mlx-community).
 * FALLBACK: curated seed list when sync file is unavailable.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Curated seed (fallback if no sync file) ──
const MLX_SEED_MODELS = [
    { name: 'Qwen3.5-9B-OptiQ-4bit', hfPath: 'mlx-community/Qwen3.5-9B-OptiQ-4bit', paramsB: 9, quantization: 'OptiQ-4bit', category: 'coding', isMoE: false, context: 131072 },
    { name: 'Qwen3.5-4B-OptiQ-4bit', hfPath: 'mlx-community/Qwen3.5-4B-OptiQ-4bit', paramsB: 4, quantization: 'OptiQ-4bit', category: 'coding', isMoE: false, context: 131072 },
    { name: 'Qwen3.5-35B-A3B-OptiQ-4bit', hfPath: 'mlx-community/Qwen3.5-35B-A3B-OptiQ-4bit', paramsB: 35, quantization: 'OptiQ-4bit', category: 'coding', isMoE: true, activeParamsB: 3, context: 131072 },
    { name: 'Gemma-4-12b-coder-fable5-4bit', hfPath: 'mlx-community/Gemma-4-12b-coder-fable5-composer2.5-4bit', paramsB: 12, quantization: '4bit', category: 'coding', isMoE: false, context: 32768 },
    { name: 'CodeGemma-4-2B-4bit', hfPath: 'mlx-community/CodeGemma-4-2B-4bit', paramsB: 2, quantization: '4bit', category: 'coding', isMoE: false, context: 16384 },
    { name: 'DeepSeek-Coder-V2-Lite-4bit', hfPath: 'mlx-community/DeepSeek-Coder-V2-Lite-Instruct-4bit', paramsB: 16, quantization: '4bit', category: 'coding', isMoE: true, activeParamsB: 2.4, context: 131072 },
    { name: 'DeepSeek-R1-Distill-Qwen-32B-4bit', hfPath: 'mlx-community/DeepSeek-R1-Distill-Qwen-32B-4bit', paramsB: 32, quantization: '4bit', category: 'reasoning', isMoE: false, context: 65536 },
    { name: 'DeepSeek-R1-Distill-Qwen-14B-4bit', hfPath: 'mlx-community/DeepSeek-R1-Distill-Qwen-14B-4bit', paramsB: 14, quantization: '4bit', category: 'reasoning', isMoE: false, context: 65536 },
    { name: 'DeepSeek-R1-Distill-Qwen-7B-4bit', hfPath: 'mlx-community/DeepSeek-R1-Distill-Qwen-7B-4bit', paramsB: 7, quantization: '4bit', category: 'reasoning', isMoE: false, context: 32768 },
    { name: 'DeepSeek-R1-Distill-Qwen-1.5B-4bit', hfPath: 'mlx-community/DeepSeek-R1-Distill-Qwen-1.5B-4bit', paramsB: 1.5, quantization: '4bit', category: 'reasoning', isMoE: false, context: 16384 },
    { name: 'Qwen3.6-27B-OptiQ-4bit', hfPath: 'mlx-community/Qwen3.6-27B-OptiQ-4bit', paramsB: 27, quantization: 'OptiQ-4bit', category: 'general', isMoE: false, context: 131072 },
    { name: 'Gemma-4-27B-4bit', hfPath: 'mlx-community/Gemma-4-27B-4bit', paramsB: 27, quantization: '4bit', category: 'general', isMoE: false, context: 32768 },
    { name: 'Mistral-Small-3.1-24B-4bit', hfPath: 'mlx-community/Mistral-Small-3.1-24B-Instruct-4bit', paramsB: 24, quantization: '4bit', category: 'general', isMoE: false, context: 32768 },
    { name: 'Mistral-3.1-8B-4bit', hfPath: 'mlx-community/Mistral-3.1-8B-Instruct-4bit', paramsB: 8, quantization: '4bit', category: 'general', isMoE: false, context: 32768 },
    { name: 'Phi-4-mini-3.8B-4bit', hfPath: 'mlx-community/Phi-4-mini-instruct-4bit', paramsB: 3.8, quantization: '4bit', category: 'general', isMoE: false, context: 16384 },
    { name: 'Gemma-4-12B-qat-bf16', hfPath: 'mlx-community/Gemma-4-12B-it-qat-bf16', paramsB: 12, quantization: 'BF16', category: 'general', isMoE: false, context: 262144, isQAT: true },
    { name: 'Gemma-4-12B-qat-mxfp8', hfPath: 'mlx-community/Gemma-4-12B-it-qat-mxfp8', paramsB: 12, quantization: 'MXFP8', category: 'general', isMoE: false, context: 262144, isQAT: true },
    { name: 'Gemma-4-12B-qat-4bit', hfPath: 'mlx-community/Gemma-4-12B-it-qat-4bit', paramsB: 12, quantization: '4bit', category: 'general', isMoE: false, context: 262144, isQAT: true },
    { name: 'Gemma-4-12B-qat-OptiQ-4bit', hfPath: 'mlx-community/Gemma-4-12B-it-qat-OptiQ-4bit', paramsB: 12, quantization: 'OptiQ-4bit', category: 'general', isMoE: false, context: 262144, isQAT: true },
];

const QUANT_MAP = {
    '4bit': 'Q4_K_M', '8bit': 'Q8_0', 'fp16': 'FP16',
    'OptiQ-4bit': 'Q4_K_M', 'MXFP4-Q8': 'Q4_K_M',
    'Q4_K_M': 'Q4_K_M', 'Q8_0': 'Q8_0', 'FP16': 'FP16',
    'mxfp8': 'MXFP8', 'mxfp4': 'MXFP4', 'nvfp4': 'NVFP4',
    'bf16': 'BF16', 'qat-bf16': 'BF16', 'qat-mxfp8': 'MXFP8',
    'MXFP8': 'MXFP8', 'MXFP4': 'MXFP4', 'NVFP4': 'NVFP4', 'BF16': 'BF16',
};

/**
 * Parse model name to extract params, quantization, MoE info
 */
function parseModelInfo(name) {
    if (!name) return {};
    const info = {};

    // MoE: "35B-A3B" or "30B-A3B"
    const moe = name.match(/([\d.]+)B[-_][Aa]([\d.]+)b?/i);
    if (moe) {
        info.paramsB = parseFloat(moe[1]);
        info.activeParamsB = parseFloat(moe[2]);
        info.isMoE = true;
    } else {
        // Dense: "27B", "9B", "1.5B"
        const dense = name.match(/([\d.]+)B/);
        if (dense) {
            info.paramsB = parseFloat(dense[1]);
            info.isMoE = false;
        }
    }

    // Quantization
    if (/optiq|OptiQ|Opti-Q/i.test(name)) info.quantization = 'OptiQ-4bit';
    else if (/mxfp8|MXFP8/i.test(name)) info.quantization = 'MXFP8';
    else if (/mxfp4|MXFP4/i.test(name)) info.quantization = 'MXFP4';
    else if (/nvfp4|NVFP4/i.test(name)) info.quantization = 'NVFP4';
    else if (/bf16|bfloat/i.test(name)) info.quantization = 'BF16';
    else if (/fp16|f16/i.test(name)) info.quantization = 'FP16';
    else if (/\b8bit\b|-8bit|[-_]Q8|Q8_0/i.test(name)) info.quantization = '8bit';
    else if (/\b6bit\b|-6bit|[-_]Q6|Q6_K/i.test(name)) info.quantization = '6bit';
    else if (/\b5bit\b|-5bit|[-_]Q5|Q5_K/i.test(name)) info.quantization = '5bit';
    else if (/\b4bit\b|-4bit|[-_]Q4|Q4_K/i.test(name)) info.quantization = '4bit';
    else if (/\b3bit\b|-3bit|[-_]Q3|Q3_K/i.test(name)) info.quantization = 'Q3_K_M';
    else if (/\b2bit\b|-2bit|[-_]Q2|Q2_K/i.test(name)) info.quantization = 'Q2_K';
    else info.quantization = 'Q4_K_M';

    // QAT
    if (/qat/i.test(name)) info.isQAT = true;

    // Category
    if (/coder|code|deepseek-coder|starcoder/i.test(name) && !/reason|r1|qwq|think/i.test(name)) {
        info.category = 'coding';
    } else if (/reason|r1|qwq|think/i.test(name)) {
        info.category = 'reasoning';
    } else {
        info.category = 'general';
    }

    // Context (estimate based on model name or default)
    info.context = 32768;
    if (/128k/i.test(name)) info.context = 131072;
    else if (/256k|262k/i.test(name)) info.context = 262144;
    else if (/64k|65k/i.test(name)) info.context = 65536;

    return info;
}

class MLXModelCatalog {
    constructor(options = {}) {
        this.hfEndpoint = options.hfEndpoint || 'https://huggingface.co/api';
        this.models = [];

        if (options.models) {
            // Use explicit models array
            this.models = options.models;
        } else {
            // Try loading sync file, fall back to seed
            const syncPaths = options.syncPath
                ? [options.syncPath]
                : [
                    path.join(process.cwd(), 'mlx-sync-results.json'),
                    path.join(__dirname, '..', '..', 'mlx-sync-results.json'),
                    path.join(os.homedir(), '.mlx', 'mlx-sync-results.json'),
                  ];
            this._loadModels(syncPaths);
        }
    }

    _loadModels(syncPaths) {
        for (const syncPath of syncPaths) {
            try {
                if (fs.existsSync(syncPath)) {
                    const raw = JSON.parse(fs.readFileSync(syncPath, 'utf-8'));
                    const items = Array.isArray(raw) ? raw : (raw.models || []);
                    if (items.length > 0) {
                        this.models = this._enrichModels(items);
                        this._syncPath = syncPath;
                        this._modelCount = items.length;
                        return;
                    }
                }
            } catch (e) {
                // try next path
            }
        }
        // Fallback: seed catalog
        this.models = [...MLX_SEED_MODELS];
        this._modelCount = this.models.length;
    }

    _enrichModels(rawModels) {
        // Filter only text-generation models
        const textGen = rawModels.filter(m =>
            !m.pipeline || m.pipeline === 'text-generation' || m.pipeline === 'image-text-to-text'
        );

        return textGen.map(m => {
            const parsed = parseModelInfo(m.name);
            return { ...parsed, ...m };
        }).filter(m => m.paramsB > 0); // only models with parseable param count
    }

    get modelsCount() {
        return this._modelCount || this.models.length;
    }

    get isUsingSync() {
        return !!this._syncPath;
    }

    get syncPath() {
        return this._syncPath;
    }

    getAllModels() {
        return this.models;
    }

    getPopularCodingModels() {
        return this.getModelByHardware(256, 'coding').slice(0, 10);
    }

    getPopularReasoningModels() {
        return this.getModelByHardware(256, 'reasoning').slice(0, 10);
    }

    getPopularGeneralModels() {
        return this.getModelByHardware(256, 'general').slice(0, 10);
    }

    getModelByHardware(totalMemoryGB, useCase = 'general') {
        const effectiveMemoryGB = Math.max(0, totalMemoryGB - 4) * 0.6;
        let candidates = this.models;

        // Filter by use case
        if (useCase === 'coding') {
            candidates = candidates.filter(m =>
                m.category === 'coding' || /coder|code|deepseek|starcoder/i.test(m.name || '')
            );
        } else if (useCase === 'reasoning') {
            candidates = candidates.filter(m =>
                m.category === 'reasoning' || /reason|r1|qwq|think/i.test(m.name || '')
            );
        } else {
            candidates = candidates.filter(m => m.category === 'general');
        }

        if (candidates.length === 0) {
            candidates = this.models.filter(m => m.category === useCase || m.category === 'general');
        }

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
            .sort((a, b) => (b.paramsB - a.paramsB) || ((b.downloads || 0) - (a.downloads || 0)))
            .slice(0, 50);
    }

    normalizeQuantization(quant) {
        return QUANT_MAP[quant] || quant || 'Q4_K_M';
    }

    getMemoryEstimate(paramsB, quantization, contextLength = 4096) {
        paramsB = Math.max(0, paramsB);
        const bytesPerParam = {
            'Q4_K_M': 0.58, 'Q8_0': 1.05, 'FP16': 2.0,
            '4bit': 0.5, '8bit': 1.0, 'OptiQ-4bit': 0.5,
            'fp16': 2.0, 'MXFP8': 1.0, 'MXFP4': 0.50,
            'NVFP4': 0.50, 'BF16': 2.0, '5bit': 0.625,
            '6bit': 0.75,
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
        };
    }

    async searchHuggingface(query = 'mlx-community', limit = 100) {
        const fetch = require('../utils/fetch');
        const results = [];
        const perPage = 100;
        let cursor = null;
        let timeout = 30000;
        const maxTime = Date.now() + 120000;

        try {
            while (results.length < limit && Date.now() < maxTime) {
                let url = `${this.hfEndpoint}/models?search=${encodeURIComponent(query)}&sort=downloads&direction=-1&limit=${perPage}`;
                if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);
                const response = await fetch(url, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (!response.ok) break;
                const data = await response.json();
                if (!data || data.length === 0) break;

                const mapped = data.map(m => ({
                    hfPath: m.modelId || m.id,
                    name: (m.modelId || m.id).split('/').pop(),
                    downloads: m.downloads || 0,
                    pipeline: m.pipeline_tag || 'text-generation'
                }));

                results.push(...mapped);

                const link = response.headers.get('Link');
                if (link) {
                    const nextMatch = link.match(/<[^>]*cursor=([^&>]+)[^>]*>;\s*rel="next"/);
                    if (nextMatch) {
                        cursor = decodeURIComponent(nextMatch[1]);
                    } else break;
                } else break;

                if (mapped.length < perPage) break;
                timeout = 10000;
            }

            return results.slice(0, limit);
        } catch (e) {
            return results.length > 0 ? results : [];
        }
    }

    getQualityPenalty(quantization, isQAT = false) {
        const map = { 'BF16': 0, 'MXFP8': 0.5, 'Q8_0': 0.5, 'Q4_K_M': 5, 'OptiQ-4bit': 3, '4bit': 5 };
        const base = quantization in map ? map[quantization] : 5;
        return isQAT ? Math.round(base * 0.6) : base;
    }

    isQATModel(modelName) {
        return /qat/i.test(String(modelName));
    }

    static parseModelName(name) {
        return parseModelInfo(name);
    }
}

module.exports = MLXModelCatalog;
