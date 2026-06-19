/**
 * Config Generator — Multi-engine LLM configuration
 *
 * Generates run commands, oMLX settings, Ollama modelfiles, and llama.cpp
 * commands for optimal inference per use case.
 */

const CATEGORY_PRESETS = {
    coding: { temperature: 0.15, topP: 0.1, topK: 40, maxTokens: 4096, repeatPenalty: 1.1, stop: ['</s>', '```'] },
    'code-review': { temperature: 0.1, topP: 0.1, topK: 20, maxTokens: 2048, repeatPenalty: 1.0 },
    reasoning: { temperature: 0.6, topP: 0.95, topK: 50, maxTokens: 16384, repeatPenalty: 1.0, minP: 0.05 },
    chat: { temperature: 0.7, topP: 0.9, topK: 50, maxTokens: 2048, repeatPenalty: 1.1, minP: 0.05 },
    creative: { temperature: 0.85, topP: 0.95, topK: 80, maxTokens: 4096, repeatPenalty: 1.15, minP: 0.05 },
    summarization: { temperature: 0.3, topP: 0.5, topK: 40, maxTokens: 1024, repeatPenalty: 1.1 },
    translation: { temperature: 0.2, topP: 0.3, topK: 20, maxTokens: 2048, repeatPenalty: 1.05 },
    general: { temperature: 0.7, topP: 0.9, topK: 50, maxTokens: 2048, repeatPenalty: 1.1 }
};

class ConfigGenerator {
    /**
     * Get optimal inference parameters for a use case
     * @param {string} useCase - One of: coding, code-review, reasoning, chat, creative, summarization, translation, general
     * @returns {object} Inference parameters
     */
    getOptimalConfig(useCase = 'general') {
        return CATEGORY_PRESETS[useCase] || CATEGORY_PRESETS.general;
    }

    /**
     * Generate an mlx_lm.generate command
     * @param {string} modelRef - Model path or HuggingFace repo
     * @param {string} useCase - Inference category
     * @param {object} options - Override options (temperature, topP, maxTokens, seed, kvBits, topK, repeatPenalty, maxKvSize)
     * @returns {string} Shell command
     */
    generateMLXRunCommand(modelRef, useCase = 'general', options = {}) {
        const preset = this.getOptimalConfig(useCase);
        const temp = options.temperature ?? preset.temperature;
        const topP = options.topP ?? preset.topP;
        const maxTokens = options.maxTokens ?? preset.maxTokens;
        const repeatPenalty = options.repeatPenalty ?? preset.repeatPenalty;

        let cmd = `mlx_lm.generate --model ${modelRef}`;
        cmd += ` --temp ${temp}`;
        cmd += ` --top-p ${topP}`;
        cmd += ` --max-tokens ${maxTokens}`;
        if (repeatPenalty !== 1.0) cmd += ` --repetition-penalty ${repeatPenalty}`;
        if (options.topK) cmd += ` --top-k ${options.topK}`;
        if (options.seed !== undefined) cmd += ` --seed ${options.seed}`;
        if (options.kvBits !== undefined) cmd += ` --kv-bits ${options.kvBits}`;
        if (options.maxKvSize !== undefined) cmd += ` --max-kv-size ${options.maxKvSize}`;

        return cmd;
    }

    /**
     * Generate an optimized mlx_lm.server command with KV cache tuning
     * @param {string} modelRef - Model path or HuggingFace repo
     * @param {string} useCase - Inference category
     * @param {number} totalRAMGB - Total system RAM in GB
     * @param {object} options - Override options (kvBits, maxKvSize, temperature, topP, seed)
     * @returns {string} Shell command
     */
    generateMLXServerCommand(modelRef, useCase = 'general', totalRAMGB = 48, options = {}) {
        const preset = this.getOptimalConfig(useCase);
        const temp = options.temperature ?? preset.temperature;
        const promptCacheBytes = Math.round(totalRAMGB * 0.15 * (1024 ** 3));

        let cmd = `mlx_lm.server --model ${modelRef}`;
        cmd += ` --prompt-cache-size ${promptCacheBytes}`;
        cmd += ` --trust-remote-code`;
        cmd += ` --temp ${temp}`;
        if (preset.topP) cmd += ` --top-p ${preset.topP}`;
        if (preset.maxTokens) cmd += ` --max-tokens ${preset.maxTokens}`;
        if (options.seed !== undefined) cmd += ` --seed ${options.seed}`;

        return cmd;
    }

    /**
     * Generate oMLX configuration matching real oMLX model_settings.json format
     * oMLX (brew install omlx) — OpenAI-compatible API server on :8000/v1
     *
     * Full parameter reference from oMLX UI:
     *   Basic: ctx_window, max_tokens, reasoning_parser
     *   Sampling: temperature, top_p, top_k, min_p, repeat_penalty, presence_penalty
     *   Thinking: enabled, budget
     *   Experimental: turboquant_kv_cache (2-8bit), dflash, native_mtp, vlm_mtp
     */
    generateOMLXSetupCommand(modelRef, useCase = 'general', options = {}) {
        const preset = this.getOptimalConfig(useCase);
        const temp = options.temperature ?? preset.temperature;
        const modelKey = (modelRef.split('/').pop() || modelRef).replace(/[^a-zA-Z0-9_-]/g, '_');
        const totalRAM = options.totalRAM || 48;
        const isReasoning = useCase === 'reasoning';
        const isCoding = useCase === 'coding';

        // oMLX per-model config (~/.omlx/model_settings.json)
        // Matches real oMLX settings format
        const modelConfig = {
            [modelKey]: {
                // Basic
                model_alias: modelKey,
                model_type: 'LLM',
                reasoning_parser: isReasoning ? 'deepseek_r1' : null,
                ctx_window: isReasoning ? 131072 : isCoding ? 65536 : 32768,
                max_tokens: preset.maxTokens,

                // Sampling
                temperature: temp,
                top_p: preset.topP,
                top_k: preset.topK || 50,
                min_p: preset.minP ?? 0.05,
                repetition_penalty: preset.repeatPenalty ?? 1.0,
                presence_penalty: 0.0,

                // Thinking (DeepSeek R1 style)
                thinking_enabled: isReasoning,
                thinking_budget: isReasoning ? 8192 : 0,

                // Model loading
                trust_remote_code: true,
                force_sampling: true,
                ttl_seconds: null,  // No TTL

                // KV cache optimization (48GB RAM → 6-8bit, >32GB → 8bit, else 4bit)
                turboquant_kv_cache: totalRAM >= 32 ? 8 : totalRAM >= 16 ? 6 : 4,

                // Performance features
                spec_prefill: true,
                dflash_enabled: modelRef.toLowerCase().includes('qwen') || modelRef.toLowerCase().includes('gemma'),
                native_mtp: modelRef.toLowerCase().includes('qwen3.5') || modelRef.toLowerCase().includes('deepseek-v4'),
            }
        };

        return {
            install: 'brew install omlx',
            serve: `omlx serve --model-dir ~/models`,
            apiEndpoint: 'http://localhost:8000/v1/chat/completions',
            curlExample: `curl http://localhost:8000/v1/chat/completions \\
  -d '{"model": "${modelKey}", "messages": [{"role": "user", "content": "Hello"}], "temperature": ${temp}, "top_p": ${preset.topP}, "max_tokens": ${preset.maxTokens}}'`,
            configFile: '~/.omlx/model_settings.json',
            modelConfig: JSON.stringify(modelConfig, null, 2),
            tip: 'oMLX automatically detects models in ~/models directory',
            // Quick reference
            keyParams: {
                temperature: temp,
                top_p: preset.topP,
                top_k: preset.topK || 50,
                ctx_window: isReasoning ? 131072 : isCoding ? 65536 : 32768,
                max_tokens: preset.maxTokens,
                thinking: isReasoning ? `enabled (budget: 8192)` : 'disabled',
                kv_cache_bits: totalRAM >= 32 ? 8 : totalRAM >= 16 ? 6 : 4,
                dflash: modelRef.toLowerCase().includes('qwen') || modelRef.toLowerCase().includes('gemma'),
                mtp: modelRef.toLowerCase().includes('qwen3.5') || modelRef.toLowerCase().includes('deepseek-v4'),
            }
        };
    }

    /**
     * Generate a hint for increasing the macOS GPU wired memory limit
     * @param {number} totalRAMGB - Total system RAM in GB
     * @returns {object} Hint object with title, description, command, and examples
     */
    generateWiredMemoryHint(totalRAMGB) {
        const limit = Math.floor((totalRAMGB - 6) * 1024);
        return {
            title: 'Increase GPU wired memory limit',
            description: 'Apple Silicon macOS limits GPU-accessible memory. For large models (>70% of RAM), increase this limit.',
            command: `sudo sysctl iogpu.wired_mem_limit=${limit}`,
            formula: '(total_RAM - 6GB) * 1024',
            examples: {
                '48GB': Math.floor((48 - 6) * 1024),
                '32GB': Math.floor((32 - 6) * 1024),
                '24GB': Math.floor((24 - 6) * 1024),
                '16GB': Math.floor((16 - 6) * 1024),
            }
        };
    }

    /**
     * Generate oMLX settings JSON snippet
     * @param {object|string} model - Model object with name property, or string
     * @param {string} useCase - Inference category
     * @returns {object} oMLX settings object
     */
    generateOMLXSettings(model, useCase = 'general') {
        if (!model) return {};
        const preset = this.getOptimalConfig(useCase);
        const modelName = model.name || (typeof model === 'string' ? model : 'unknown');
        const modelKey = String(modelName).replace(/\W/g, '_') || 'unknown_model';
        return {
            [modelKey]: {
                temperature: preset.temperature,
                top_p: preset.topP,
                top_k: preset.topK || 0,
                max_tokens: preset.maxTokens,
                repetition_penalty: preset.repeatPenalty,
                max_context_window: preset.maxTokens * 2
            }
        };
    }

    /**
     * Generate an Ollama Modelfile
     * @param {string} modelRef - Model reference (e.g., qwen3.5:9b)
     * @param {string} useCase - Inference category
     * @returns {string} Modelfile content
     */
    generateOllamaModelfile(modelRef, useCase = 'general') {
        const preset = this.getOptimalConfig(useCase);
        const lines = [
            `FROM ${modelRef}`,
            '',
            'PARAMETER temperature ' + preset.temperature,
            'PARAMETER top_p ' + preset.topP,
            'PARAMETER num_ctx ' + (preset.maxTokens * 2),
            'PARAMETER num_predict ' + preset.maxTokens
        ];
        if (preset.topK) lines.push('PARAMETER top_k ' + preset.topK);
        if (preset.repeatPenalty !== 1.0) lines.push('PARAMETER repeat_penalty ' + preset.repeatPenalty);
        if (preset.stop) lines.push('PARAMETER stop "' + preset.stop.join('","') + '"');
        lines.push('');
        return lines.join('\n');
    }

    /**
     * Generate a llama.cpp CLI command
     * @param {string} modelRef - Path to model file
     * @param {string} useCase - Inference category
     * @param {number} gpuLayers - GPU layers (-1 for all)
     * @returns {string} Shell command
     */
    generateLLamaCppCommand(modelRef, useCase = 'general', gpuLayers = -1) {
        const preset = this.getOptimalConfig(useCase);
        let cmd = `llama-cli -m ${modelRef}`;
        cmd += ` -c ${preset.maxTokens * 2}`;
        cmd += ` --temp ${preset.temperature}`;
        cmd += ` --top-p ${preset.topP}`;
        cmd += ` -n ${preset.maxTokens}`;
        if (gpuLayers < 0) cmd += ' -ngl 999';
        else cmd += ` -ngl ${gpuLayers}`;
        if (preset.repeatPenalty !== 1.0) cmd += ` --repeat-penalty ${preset.repeatPenalty}`;
        return cmd;
    }
}

module.exports = ConfigGenerator;
