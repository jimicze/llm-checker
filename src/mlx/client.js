const fetch = require('../utils/fetch');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

const MLX_MODES = { OMLX: 'omlx', DIRECT: 'direct' };

class MLXClient {
    constructor(options = {}) {
        this.mode = options.mode || MLX_MODES.OMLX;
        this.baseURL = this.normalizeBaseURL(
            options.baseURL ||
            process.env.MLX_HOST ||
            process.env.OMLX_HOST ||
            'http://localhost:8000'
        );
        this.modelDir = options.modelDir ||
            process.env.MLX_MODEL_DIR ||
            path.join(os.homedir(), '.mlx', 'models');
        this.isAvailable = null;
        this.lastCheck = 0;
        this.cacheTimeout = 30000;
        this._pendingCheck = null;
    }

    normalizeBaseURL(baseURL) {
        let normalized = String(baseURL || '').trim();
        if (!normalized) {
            return 'http://localhost/v1';
        }
        if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
            normalized = 'http://' + normalized;
        }
        try {
            const parsed = new URL(normalized);
            if (!parsed.hostname) throw new Error('empty host');
            if (!parsed.pathname || parsed.pathname === '/') {
                parsed.pathname = '/v1';
            }
            return parsed.toString().replace(/\/+$/, '');
        } catch (e) {
            if (!normalized.endsWith('/v1')) {
                normalized = normalized.replace(/\/+$/, '') + '/v1';
            }
            return normalized;
        }
    }

    isRetryableError(error) {
        const message = String(error?.message || '').toLowerCase();
        return (
            message.includes('econnrefused') ||
            message.includes('fetch failed') ||
            message.includes('network') ||
            message.includes('socket') ||
            message.includes('connect') ||
            message.includes('timeout') ||
            error?.name === 'AbortError'
        );
    }

    calculateTokensPerSecond(usage = {}) {
        usage = usage || {};
        const promptTPS = Number(usage.prompt_tokens_per_second) || 0;
        const generationTPS = Number(usage.generation_tokens_per_second) || 0;
        const evalCount = Number(usage.eval_count) || 0;
        const evalDurationNs = Number(usage.eval_duration) || 0;
        const evalTPS = evalDurationNs > 0 ? (evalCount / (evalDurationNs / 1_000_000_000)) : 0;

        return {
            tokensPerSecond: generationTPS || evalTPS || 0,
            promptTokensPerSecond: promptTPS,
            evalTokensPerSecond: Math.round(evalTPS * 10) / 10
        };
    }

    async checkAvailability() {
        // Use cache regardless of mode
        if (this.isAvailable !== null && Date.now() - this.lastCheck < this.cacheTimeout) {
            return this.isAvailable;
        }
        if (this.mode === MLX_MODES.DIRECT) {
            return this._checkDirectAvailability();
        }
        return this._checkApiAvailability();
    }

    async _checkApiAvailability() {
        if (this.isAvailable !== null && Date.now() - this.lastCheck < this.cacheTimeout) {
            return this.isAvailable;
        }
        if (this._pendingCheck) {
            return this._pendingCheck;
        }
        this._pendingCheck = this._doApiAvailabilityCheck();
        try {
            return await this._pendingCheck;
        } finally {
            this._pendingCheck = null;
        }
    }

    async _doApiAvailabilityCheck() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            const response = await fetch(`${this.baseURL.replace('/v1', '')}/health`, {
                signal: controller.signal,
                headers: { 'Content-Type': 'application/json' }
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                this.isAvailable = { available: false, error: 'MLX server not healthy', attemptedURL: this.baseURL };
                this.lastCheck = Date.now();
                return this.isAvailable;
            }
            this.isAvailable = { available: true, version: 'omlx', attemptedURL: this.baseURL };
            this.lastCheck = Date.now();
            return this.isAvailable;
        } catch (error) {
            this.isAvailable = {
                available: false,
                error: error.message,
                hint: 'Make sure oMLX is running. Try: omlx serve --model-dir ~/models',
                attemptedURL: this.baseURL
            };
            this.lastCheck = Date.now();
            return this.isAvailable;
        }
    }

    _checkDirectAvailability() {
        try {
            const { execSync } = require('child_process');
            const version = execSync('python3 -c "import mlx_lm; print(mlx_lm.__version__)"', {
                timeout: 5000,
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'ignore']
            }).trim();
            if (!version) throw new Error('empty version');
            this.isAvailable = { available: true, version: 'mlx-lm@' + version };
            return this.isAvailable;
        } catch (e) {
            this.isAvailable = {
                available: false,
                error: 'mlx-lm not installed',
                hint: 'Install with: pip install -U mlx-lm'
            };
            return this.isAvailable;
        }
    }

    async listModels() {
        if (this.mode === MLX_MODES.DIRECT) {
            return this._listLocalModels();
        }
        return this._listApiModels();
    }

    async _listApiModels() {
        const availability = await this.checkAvailability();
        if (!availability.available) {
            return [];
        }
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            const response = await fetch(`${this.baseURL}/models`, {
                signal: controller.signal,
                headers: { 'Content-Type': 'application/json' }
            });
            clearTimeout(timeoutId);
            if (!response.ok) return [];
            const data = await response.json();
            return (data.data || []).map(m => ({
                name: m.id,
                displayName: m.id,
                source: 'omlx_api',
                details: { max_model_len: m.max_model_len }
            }));
        } catch (e) {
            return [];
        }
    }

    _listLocalModels() {
        const fs = require('fs');
        try {
            if (!fs.existsSync(this.modelDir)) return [];
            const entries = fs.readdirSync(this.modelDir, { withFileTypes: true });
            const models = [];
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const configPath = path.join(this.modelDir, entry.name, 'config.json');
                    if (fs.existsSync(configPath)) {
                        models.push({
                            name: entry.name,
                            displayName: entry.name,
                            source: 'mlx_local',
                            path: path.join(this.modelDir, entry.name)
                        });
                    }
                }
            }
            return models;
        } catch (e) {
            return [];
        }
    }

    async generate(modelName, prompt, options = {}) {
        if (this.mode === MLX_MODES.DIRECT) {
            return this._generateDirect(modelName, prompt, options);
        }
        return this._generateApi(modelName, prompt, options);
    }

    async _generateApi(modelName, prompt, options = {}) {
        const availability = await this.checkAvailability();
        if (!availability.available) {
            throw new Error(`MLX not available: ${availability.error}`);
        }
        const { timeoutMs = 60000, generationOptions = {} } = options;
        const payload = {
            model: modelName,
            prompt,
            max_tokens: generationOptions.max_tokens || 2048,
            temperature: generationOptions.temperature ?? 0.7,
            top_p: generationOptions.top_p ?? 0.9,
            stream: false
        };
        if (generationOptions.top_k) payload.top_k = generationOptions.top_k;
        if (generationOptions.repetition_penalty) payload.repetition_penalty = generationOptions.repetition_penalty;
        if (generationOptions.seed) payload.seed = generationOptions.seed;

        const startTime = Date.now();
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            const response = await fetch(`${this.baseURL}/completions`, {
                method: 'POST',
                signal: controller.signal,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
            }
            const data = await response.json();
            const responseTime = Date.now() - startTime;
            const speed = this.calculateTokensPerSecond(data.usage || data);
            return {
                response: data.choices?.[0]?.text || data.response || '',
                responseTime,
                tokensPerSecond: speed.tokensPerSecond,
                evalTokensPerSecond: speed.evalTokensPerSecond
            };
        } catch (error) {
            throw new Error(`MLX generate failed: ${error.message}`);
        }
    }

    async _generateDirect(modelName, prompt, options = {}) {
        const availability = await this.checkAvailability();
        if (!availability.available) {
            throw new Error(`MLX not available: ${availability.error}`);
        }
        const { generationOptions = {} } = options;
        const args = ['-m', 'mlx_lm', 'generate', '--model', modelName, '--prompt', prompt];

        if (generationOptions.max_tokens) args.push('--max-tokens', String(generationOptions.max_tokens));
        if (generationOptions.temperature !== undefined) args.push('--temp', String(generationOptions.temperature));
        if (generationOptions.top_p !== undefined) args.push('--top-p', String(generationOptions.top_p));

        const startTime = Date.now();
        return new Promise((resolve, reject) => {
            const proc = spawn('python3', args, { timeout: 120000 });
            let stdout = '';
            proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
            proc.stderr.on('data', (chunk) => { /* pass — mlx_lm logs to stderr */ });
            proc.on('close', (code) => {
                const responseTime = Date.now() - startTime;
                const tokens = stdout.split(/\s+/).filter(Boolean).length;
                resolve({
                    response: stdout.trim(),
                    responseTime,
                    tokensPerSecond: responseTime > 0 ? Math.round((tokens / (responseTime / 1000)) * 10) / 10 : 0,
                    evalTokensPerSecond: 0
                });
            });
            proc.on('error', (err) => reject(new Error(`mlx_lm failed: ${err.message}`)));
        });
    }

    async chat(modelName, messages, options = {}) {
        if (this.mode === MLX_MODES.DIRECT) {
            const lastMsg = messages[messages.length - 1];
            return this._generateDirect(modelName, lastMsg?.content || '', options);
        }
        return this._chatApi(modelName, messages, options);
    }

    async _chatApi(modelName, messages, options = {}) {
        const availability = await this.checkAvailability();
        if (!availability.available) {
            throw new Error(`MLX not available: ${availability.error}`);
        }
        const { timeoutMs = 120000, generationOptions = {} } = options;
        const payload = {
            model: modelName,
            messages: Array.isArray(messages) ? messages : [],
            max_tokens: generationOptions.max_tokens || 4096,
            temperature: generationOptions.temperature ?? 0.7,
            top_p: generationOptions.top_p ?? 0.9,
            stream: false
        };

        const startTime = Date.now();
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            const response = await fetch(`${this.baseURL}/chat/completions`, {
                method: 'POST',
                signal: controller.signal,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
            }
            const data = await response.json();
            const responseTime = Date.now() - startTime;
            const speed = this.calculateTokensPerSecond(data.usage || {});

            return {
                ...data,
                responseTime,
                tokensPerSecond: speed.tokensPerSecond,
                evalTokensPerSecond: speed.evalTokensPerSecond
            };
        } catch (error) {
            throw new Error(`MLX chat failed: ${error.message}`);
        }
    }

    async testModelPerformance(modelName, testPrompt = 'Write one sentence about MLX.') {
        const startTime = Date.now();
        try {
            const data = await this.generate(modelName, testPrompt, {
                timeoutMs: 30000,
                generationOptions: { max_tokens: 50 }
            });
            return {
                success: true,
                responseTime: data.responseTime,
                tokensPerSecond: data.tokensPerSecond,
                evalTokensPerSecond: data.evalTokensPerSecond,
                tokensGenerated: Math.round(data.tokensPerSecond * (data.responseTime / 1000)),
                response: data.response
            };
        } catch (error) {
            return { success: false, error: error.message, responseTime: Date.now() - startTime };
        }
    }
}

module.exports = MLXClient;
module.exports.MLX_MODES = MLX_MODES;
