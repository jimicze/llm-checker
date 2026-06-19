# MLX Backend for llm-checker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Task Progress

- [x] Task 0: Fork & repo setup
- [x] Task 1: Create src/mlx/client.js — MLX execution client
- [x] Task 2: Enhance Apple Silicon detection with MLX check
- [x] Task 3: Add --runtime CLI flag and MLX dispatch
- [x] Task 4: Create src/config/generator.js — config generator
- [x] Task 5: Create src/mlx/model-catalog.js — MLX model catalog
- [x] Task 6: Wire everything into LLMChecker class
- [x] Task 7: Add MLX MCP tools
- [x] Task 8: Integration tests
- [x] Task 9: Documentation & PR preparation
- [x] Task 10: Final verification & push

**Goal:** Extend llm-checker with MLX backend support — hardware detection, model discovery, configuration generation, and execution via oMLX API and direct mlx-lm subprocess.

**Architecture:** Add `src/mlx/client.js` (MLX execution client with oMLX API + direct modes), `src/mlx/model-catalog.js` (HuggingFace MLX Community model discovery), `src/config/generator.js` (per-engine config generation). Enhance Apple Silicon detector with MLX availability check. Add `--runtime` CLI flag dispatching between Ollama and MLX backends. All new code is optional — graceful fallback if MLX not installed.

**Tech Stack:** Node.js (JavaScript, same as llm-checker), oMLX OpenAI-compatible API, mlx-lm subprocess, HuggingFace Hub API, existing llm-checker infra (OllamaClient pattern, commander CLI, scoring system).

**Strategy:** Fork llm-checker → private repo → implement MLX backend → submit public PR upstream.

---

### Task 0: Fork & Repo Setup

**Files:**
- Modify: `package.json`
- Create: `.gitignore` additions
- Run: git operations

- [ ] **Step 1: Fork llm-checker to private repo**

```bash
# Create private fork on GitHub first (via web UI), then:
git clone git@github.com:YOUR_ORG/llm-checker.git
cd /Users/lasakondrej/Projects/mlx-ranker
git init
git remote add upstream https://github.com/Pavelevich/llm-checker.git
git remote add origin git@github.com:YOUR_ORG/llm-checker.git
git pull upstream main
git push -u origin main
```

- [ ] **Step 2: Verify build works**

```bash
npm install
node bin/enhanced_cli.js hw-detect
Expected: hardware detection output (no errors)
```

- [ ] **Step 3: Add .gitkeep to plans dir and commit**

```bash
touch docs/superpowers/plans/.gitkeep
git add docs/superpowers/plans/
git commit -m "chore: add implementation plan for MLX backend"
```

---

### Task 1: Create `src/mlx/client.js` — MLX Execution Client

**Files:**
- Create: `src/mlx/client.js`
- Create: `src/mlx/index.js` (barrel export)
- Create: `tests/mlx-client.test.js`

This is the core MLX execution client. It follows the same pattern as `src/ollama/client.js` but supports two modes:
- **Mode A (oMLX API):** HTTP client to oMLX OpenAI-compatible endpoints (`/v1/chat/completions`, `/v1/models`, `/health`)
- **Mode B (Direct):** Spawns `mlx_lm.generate` as subprocess, parses stdout for streaming output

- [ ] **Step 1: Write failing tests for MLXClient**

`tests/mlx-client.test.js`:
```javascript
const MLXClient = require('../src/mlx/client');

describe('MLXClient', () => {
    const client = new MLXClient();

    test('defaults to omlx mode', () => {
        expect(client.mode).toBe('omlx');
        expect(client.baseURL).toBe('http://localhost:8000/v1');
    });

    test('accepts custom mode and baseURL', () => {
        const custom = new MLXClient({ mode: 'direct', baseURL: 'http://localhost:8080' });
        expect(custom.mode).toBe('direct');
        expect(custom.baseURL).toBe('http://localhost:8080');
    });

    test('normalizeBaseURL adds http:// and /v1', () => {
        const result = client.normalizeBaseURL('localhost:8000');
        expect(result).toBe('http://localhost:8000/v1');
    });

    test('normalizeBaseURL preserves existing scheme', () => {
        const result = client.normalizeBaseURL('https://omlx.local:8443');
        expect(result).toBe('https://omlx.local:8443/v1');
    });

    test('isRetryableError catches connection issues', () => {
        expect(client.isRetryableError({ message: 'ECONNREFUSED connect' })).toBe(true);
        expect(client.isRetryableError({ message: 'fetch failed' })).toBe(true);
        expect(client.isRetryableError({ message: 'timeout' })).toBe(true);
        expect(client.isRetryableError({ message: 'HTTP 400 Bad Request' })).toBe(false);
    });

    test('calculateTokensPerSecond from omlx usage data', () => {
        const usage = {
            prompt_tokens_per_second: 45.2,
            generation_tokens_per_second: 32.5
        };
        const result = client.calculateTokensPerSecond(usage);
        expect(result.tokensPerSecond).toBe(32.5);
        expect(result.promptTokensPerSecond).toBe(45.2);
    });

    test('calculateTokensPerSecond from direct output fallback', () => {
        const result = client.calculateTokensPerSecond({});
        expect(result.tokensPerSecond).toBe(0);
    });
});
```

Run: `node_modules/.bin/jest tests/mlx-client.test.js`
Expected: FAIL (client not created yet)

- [ ] **Step 2: Create `src/mlx/client.js`**

```javascript
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
        if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
            normalized = 'http://' + normalized;
        }
        try {
            const parsed = new URL(normalized);
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
            require.resolve('mlx-lm');
            this.isAvailable = { available: true, version: 'direct-mlx' };
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
        const args = ['-m', 'mlx_lm.generate', '--model', modelName, '--prompt', prompt];

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
```

- [ ] **Step 3: Create `src/mlx/index.js` (barrel export)**

```javascript
const MLXClient = require('./client');
module.exports = { MLXClient };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node_modules/.bin/jest tests/mlx-client.test.js --verbose`
Expected: All 6 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/mlx/ tests/mlx-client.test.js
git commit -m "feat(mlx): add MLXClient with oMLX API and direct subprocess modes"
```

---

### Task 2: Enhance Apple Silicon Hardware Detection with MLX Check

**Files:**
- Modify: `src/hardware/backends/apple-silicon.js`
- Create: `tests/apple-silicon-mlx.test.js`

- [ ] **Step 1: Write failing tests for MLX detection in AppleSiliconDetector**

```javascript
const AppleSiliconDetector = require('../src/hardware/backends/apple-silicon');

describe('AppleSiliconDetector MLX', () => {
    const detector = new AppleSiliconDetector();

    test('detect() returns null on non-Apple Silicon', () => {
        // Simulate Intel Mac
        const originalArch = process.arch;
        const originalPlatform = process.platform;
        Object.defineProperty(process, 'arch', { value: 'x64' });
        Object.defineProperty(process, 'platform', { value: 'darwin' });
        expect(detector.detect()).toBeNull();
        Object.defineProperty(process, 'arch', { value: originalArch });
        Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    test('getChipInfo returns speedCoefficient for M4 Max', () => {
        const detector = new AppleSiliconDetector();
        const info = detector.getChipInfo();
        // validate structure
        expect(info).toHaveProperty('chip');
        expect(info).toHaveProperty('generation');
        expect(info).toHaveProperty('variant');
        expect(info).toHaveProperty('cores');
        expect(info).toHaveProperty('gpu');
        expect(info).toHaveProperty('memory');
        expect(info).toHaveProperty('mlx');
    });

    test('mlxAvailable returns false when mlx-lm not installed', () => {
        const result = detector.mlxAvailable();
        expect(result).toBe(false);
    });

    test('mlxInfo returns not-available when mlx not installed', () => {
        const result = detector.mlxInfo();
        expect(result.available).toBe(false);
    });

    test('getEffectiveMemoryForMLX returns 60% of total on Apple Silicon', () => {
        // Only test on actual Apple Silicon
        if (process.arch !== 'arm64' || process.platform !== 'darwin') return;
        const info = detector.getChipInfo();
        const effective = detector.getEffectiveMemoryForMLX();
        expect(effective).toBeLessThanOrEqual(info.memory.unified);
        expect(effective).toBeGreaterThanOrEqual(info.memory.unified * 0.5);
    });
});
```

Run: `node_modules/.bin/jest tests/apple-silicon-mlx.test.js`
Expected: FAIL (mlxAvailable, mlxInfo, getEffectiveMemoryForMLX not defined)

- [ ] **Step 2: Add MLX detection methods to `src/hardware/backends/apple-silicon.js`**

Add these methods after `checkMetalSupport()` (~line 277):

```javascript
    /**
     * Check if MLX framework is available (mlx-lm package installed)
     */
    mlxAvailable() {
        try {
            require.resolve('mlx-lm');
            return true;
        } catch (e) {
            // Also check for mlx core
            try {
                require.resolve('mlx');
                return true;
            } catch (e2) {
                return false;
            }
        }
    }

    /**
     * Get MLX-specific hardware info
     */
    mlxInfo() {
        const info = this.detect();
        if (!info) {
            return { available: false, reason: 'Not Apple Silicon' };
        }
        const mlxInstalled = this.mlxAvailable();
        return {
            available: mlxInstalled,
            chip: info.chip,
            generation: info.generation,
            variant: info.variant,
            memoryGB: info.memory.unified,
            gpuCores: info.gpu.cores,
            memoryBandwidthGBs: info.memory.bandwidth,
            speedCoefficient: info.speedCoefficient
        };
    }

    /**
     * Calculate effective memory available for MLX model loading
     * Apple Silicon unified memory: ~60% of total RAM usable for models
     * (OS reserves ~4GB, rest is shared between CPU and GPU)
     */
    getEffectiveMemoryForMLX() {
        const info = this.detect();
        if (!info) return 0;
        // Reserve 4GB for OS, use 60% of remaining
        const usable = Math.max(0, info.memory.unified - 4);
        return Math.round(usable * 0.6);
    }
```

Also add `mlx` field to the result object in `getChipInfo()`, after `speedCoefficient` (~line 143):

```javascript
        // MLX availability
        result.mlx = {
            available: false, // Will be set by mlxAvailable()
            effectiveMemoryGB: 0
        };
```

- [ ] **Step 3: Update `estimateTokensPerSecond` with MLX-aware multiplier**

Replace the method (~line 296) with:

```javascript
    estimateTokensPerSecond(paramsB, quantization = 'Q4_K_M', runtime = 'ollama') {
        const info = this.detect();
        if (!info) return 0;

        const quantMult = {
            'FP16': 1.0, 'Q8_0': 1.5, 'Q6_K': 1.8, 'Q5_K_M': 2.0,
            'Q5_0': 2.0, 'Q4_K_M': 2.5, 'Q4_0': 2.8, 'Q3_K_M': 3.0,
            'Q2_K': 3.5, 'IQ4_XS': 2.6, 'IQ3_XXS': 3.2,
            '4bit': 2.5, '8bit': 1.5, 'fp16': 1.0
        };

        const mult = quantMult[quantization] || 2.0;
        let baseSpeed = info.speedCoefficient / paramsB * mult;

        // MLX is typically 1.2x-1.5x faster than llama.cpp Metal on Apple Silicon
        if (runtime === 'mlx') {
            baseSpeed *= 1.35;
        }

        return Math.round(baseSpeed);
    }
```

- [ ] **Step 4: Run tests**

Run: `node_modules/.bin/jest tests/apple-silicon-mlx.test.js --verbose`
Expected: All 5 tests pass (mlxAvailable returns false unless mlx-lm is actually installed)

- [ ] **Step 5: Run existing hardware tests**

Run: `node tests/hardware-detector-regression.js`
Expected: PASS (existing tests still pass)

- [ ] **Step 6: Commit**

```bash
git add src/hardware/backends/apple-silicon.js tests/apple-silicon-mlx.test.js
git commit -m "feat(hardware): add MLX availability detection and MLX-aware speed estimation"
```

---

### Task 3: Add `--runtime` CLI Flag and MLX Dispatch

**Files:**
- Modify: `bin/enhanced_cli.js` (add `--runtime` flag, dispatch logic)
- Modify: `src/index.js` (expose MLXClient via LLMChecker)

- [ ] **Step 1: Add `--runtime` flag to `ai-run` command in `bin/enhanced_cli.js`**

After `.option('--reference-only', ...)` (~line 4462) add:

```javascript
    .option('--runtime <runtime>', 'Runtime engine: ollama (default), mlx', 'ollama')
```

- [ ] **Step 2: Add runtime dispatch logic in `ai-run` action handler**

Replace the `checkOllamaAndExit()` call (~line 4466) and subsequent Ollama-specific code with runtime-aware dispatch. Find this section:

```javascript
    .action(async (options) => {
        showAsciiArt('ai-run');
        // Check if Ollama is installed first
        await checkOllamaAndExit();
```

Replace with:

```javascript
    .action(async (options) => {
        showAsciiArt('ai-run');

        const runtime = normalizeRuntime(options.runtime || 'ollama');
        if (runtime === 'mlx') {
            await handleMlxAiRun(options);
            return;
        }

        // Original Ollama logic follows unchanged...
        await checkOllamaAndExit();
```

- [ ] **Step 3: Add `handleMlxAiRun` function before the `ai-run` command definition**

Add this function near the other helper functions (~line 180 area):

```javascript
async function handleMlxAiRun(options) {
    const MLXClient = require('../src/mlx/client');
    const mlxClient = new MLXClient({
        mode: process.env.MLX_MODE || 'omlx'
    });

    const availability = await mlxClient.checkAvailability();
    if (!availability.available) {
        console.log(chalk.red('\nMLX not available:'));
        console.log(chalk.yellow(`  ${availability.error}`));
        if (availability.hint) {
            console.log(chalk.cyan(`  ${availability.hint}`));
        }
        console.log(chalk.gray('\n  Or switch to Ollama: llm-checker ai-run --runtime ollama'));
        return;
    }

    if (options.referenceOnly) {
        console.log(chalk.green('\nMLX Backend Available:'));
        console.log(`  Mode: ${mlxClient.mode}`);
        console.log(`  Server: ${mlxClient.baseURL}`);

        const checker = new (getLLMChecker())();
        const systemInfo = await checker.getSystemInfo();
        const isAppleSilicon = systemInfo.cpu?.architecture === 'arm64' && process.platform === 'darwin';
        if (isAppleSilicon) {
            const AppleSiliconDetector = require('./src/hardware/backends/apple-silicon');
            const detector = new AppleSiliconDetector();
            const mlxInfo = detector.mlxInfo();
            console.log(chalk.cyan('\nMLX-Optimized Hardware:'));
            console.log(`  Chip: ${mlxInfo.chip}`);
            console.log(`  Memory: ${mlxInfo.memoryGB}GB unified`);
            console.log(`  Effective for models: ~${detector.getEffectiveMemoryForMLX()}GB`);
            console.log(`  Memory Bandwidth: ${mlxInfo.memoryBandwidthGBs} GB/s`);
        }

        console.log(chalk.gray('\n  Run with --prompt or interactively to execute.'));
        return;
    }

    // Check for local MLX models
    const models = await mlxClient.listModels();
    const candidateModels = options.models || models.map(m => m.name);

    if (candidateModels.length === 0) {
        console.log(chalk.yellow('\nNo MLX models found.'));
        console.log(chalk.gray('  Download models from HuggingFace mlx-community:'));
        console.log(chalk.cyan('  https://huggingface.co/mlx-community'));
        console.log(chalk.gray('  Or use oMLX admin panel to download models.'));
        return;
    }

    if (options.prompt) {
        console.log(chalk.cyan(`\n>>> ${options.prompt}`));
        // Use first model if not specified
        const modelName = options.models?.[0] || candidateModels[0];
        try {
            const result = await mlxClient.generate(modelName, options.prompt, {
                generationOptions: getMlxGenerationOptions(options)
            });
            console.log(chalk.white('\n' + result.response));
            console.log(chalk.gray(`\n[${result.tokensPerSecond} tok/s, ${result.responseTime}ms]`));
        } catch (error) {
            console.error(chalk.red('\nMLX execution failed:'), error.message);
        }
        return;
    }

    console.log(chalk.magenta.bold(`\nStarting MLX interactive session with ${candidateModels[0]}...`));
    console.log(chalk.gray(`Tip: Type ${chalk.cyan('/bye')} to exit\n`));

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: chalk.green('mlx> ')
    });
    rl.prompt();

    rl.on('line', async (line) => {
        const trimmed = line.trim();
        if (trimmed.toLowerCase() === '/bye' || trimmed.toLowerCase() === '/exit') {
            rl.close();
            return;
        }
        if (!trimmed) { rl.prompt(); return; }

        try {
            const result = await mlxClient.generate(
                options.models?.[0] || candidateModels[0],
                trimmed,
                { generationOptions: getMlxGenerationOptions(options) }
            );
            console.log(chalk.white(result.response));
            console.log(chalk.gray(`[${result.tokensPerSecond} tok/s]`));
        } catch (error) {
            console.error(chalk.red('Error:'), error.message);
        }
        rl.prompt();
    });

    rl.on('close', () => {
        console.log(chalk.gray('\nMLX session ended.'));
        process.exit(0);
    });
}

function getMlxGenerationOptions(options) {
    const opts = {};
    if (options.category === 'coding') {
        opts.temperature = 0.15;
        opts.top_p = 0.1;
        opts.max_tokens = 4096;
    } else if (options.category === 'reasoning') {
        opts.temperature = 0.6;
        opts.top_p = 0.95;
        opts.max_tokens = 16384;
    } else {
        opts.temperature = 0.7;
        opts.top_p = 0.9;
        opts.max_tokens = 2048;
    }
    return opts;
}
```

- [ ] **Step 4: Also add `--runtime` flag to `recommend`, `check`, and `installed` commands**

Each command gets `.option('--runtime <runtime>', 'Runtime engine: ollama (default), mlx, vllm', 'ollama')`.

- [ ] **Step 5: Test the MLX ai-run command**

```bash
# Test reference-only mode (no MLX needed)
node bin/enhanced_cli.js ai-run --runtime mlx --reference-only
Expected: Shows MLX not available or server info

# Test with prompt (requires oMLX running)
# node bin/enhanced_cli.js ai-run --runtime mlx --prompt "Hello" --models mlx-community/Qwen3.5-4B-OptiQ-4bit
```

- [ ] **Step 6: Commit**

```bash
git add bin/enhanced_cli.js src/index.js
git commit -m "feat(cli): add --runtime flag dispatching ai-run to MLX backend"
```

---

### Task 4: Create `src/config/generator.js` — MLX Configuration Generator

**Files:**
- Create: `src/config/generator.js`
- Create: `tests/config-generator.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
const ConfigGenerator = require('../src/config/generator');

describe('ConfigGenerator', () => {
    const gen = new ConfigGenerator();

    test('getOptimalConfig returns coding defaults', () => {
        const config = gen.getOptimalConfig('coding');
        expect(config.temperature).toBe(0.15);
        expect(config.topP).toBe(0.1);
        expect(config.maxTokens).toBe(4096);
        expect(config.repeatPenalty).toBe(1.1);
    });

    test('getOptimalConfig returns reasoning defaults', () => {
        const config = gen.getOptimalConfig('reasoning');
        expect(config.temperature).toBe(0.6);
        expect(config.topP).toBe(0.95);
        expect(config.maxTokens).toBe(16384);
    });

    test('getOptimalConfig falls back to chat for unknown categories', () => {
        const config = gen.getOptimalConfig('unknown');
        expect(config.temperature).toBe(0.7);
    });

    test('generateMLXRunCommand produces valid mlx_lm command', () => {
        const cmd = gen.generateMLXRunCommand('mlx-community/Qwen3.5-9B-OptiQ-4bit', 'coding');
        expect(cmd).toContain('mlx_lm.generate');
        expect(cmd).toContain('--model');
        expect(cmd).toContain('Qwen3.5-9B-OptiQ-4bit');
        expect(cmd).toContain('--temp 0.15');
    });

    test('generateOMLXSettings produces valid JSON snippet', () => {
        const settings = gen.generateOMLXSettings({ name: 'qwen3.5-9b' }, 'coding');
        expect(settings.qwen3_5_9b.temperature).toBe(0.15);
        expect(settings.qwen3_5_9b.top_p).toBe(0.1);
    });

    test('generateModelfile produces valid Modelfile syntax', () => {
        const modelfile = gen.generateModelfile('qwen3.5:9b', 'coding');
        expect(modelfile).toContain('FROM qwen3.5:9b');
        expect(modelfile).toContain('PARAMETER temperature 0.15');
        expect(modelfile).toContain('PARAMETER top_p 0.1');
    });
});
```

Run: `node_modules/.bin/jest tests/config-generator.test.js`
Expected: FAIL (all tests)

- [ ] **Step 2: Create `src/config/generator.js`**

```javascript
/**
 * MLX/LLM Configuration Generator
 *
 * Generates run commands, config files, and settings for multiple
 * inference engines: MLX, oMLX, Ollama, and llama.cpp.
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
    getOptimalConfig(useCase = 'general') {
        return CATEGORY_PRESETS[useCase] || CATEGORY_PRESETS.general;
    }

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
        if (options.kvBits) cmd += ` --kv-bits ${options.kvBits}`;
        if (options.maxKvSize) cmd += ` --max-kv-size ${options.maxKvSize}`;
        if (options.trustRemoteCode) cmd += ` --trust-remote-code`;

        return cmd;
    }

    /**
     * Generate optimized mlx_lm.server command with KV cache optimization
     * This is the primary method for production use on Apple Silicon.
     */
    generateOptimizedMLXServerCommand(modelRef, useCase = 'general', totalRAMGB = 48, options = {}) {
        const preset = this.getOptimalConfig(useCase);
        const kvBits = options.kvBits ?? 4;
        // For 48GB RAM: safe context of 32K. Scale down for smaller RAM.
        const maxKvSize = options.maxKvSize ?? Math.min(32768, Math.floor((totalRAMGB - 4) * 1024));

        let cmd = `mlx_lm.server --model ${modelRef}`;
        cmd += ` --max-kv-size ${maxKvSize}`;
        cmd += ` --kv-bits ${kvBits}`;
        cmd += ` --trust-remote-code`;
        if (options.temperature !== undefined) cmd += ` --temp ${options.temperature}`;
        if (options.maxTokens) cmd += ` --max-tokens ${options.maxTokens}`;

        return cmd;
    }

    generateOMLXSettings(model, useCase = 'general') {
        const preset = this.getOptimalConfig(useCase);
        const modelKey = (model.name || model).replace(/[^a-zA-Z0-9_-]/g, '_');
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
        lines.push('TEMPLATE """' + this._getChatTemplate(useCase) + '"""');
        return lines.join('\n');
    }

    generateLLamaCppCommand(modelRef, useCase = 'general', gpuLayers = -1) {
        const preset = this.getOptimalConfig(useCase);
        let cmd = `llama-cli -m ${modelRef}`;
        cmd += ` -c ${preset.maxTokens * 2}`;
        cmd += ` --temp ${preset.temperature}`;
        cmd += ` --top-p ${preset.topP}`;
        cmd += ` -n ${preset.maxTokens}`;
        if (gpuLayers === -1) cmd += ' -ngl 999';
        else cmd += ` -ngl ${gpuLayers}`;
        if (preset.repeatPenalty !== 1.0) cmd += ` --repeat-penalty ${preset.repeatPenalty}`;
        return cmd;
    }

    _getChatTemplate(useCase) {
        const templates = {
            coding: '{{- if .System }}{{ .System }}{{ end }}\n{{- range .Messages }}\n{{- if eq .Role "user" }}\n### Instruction\n{{ .Content }}\n{{- end }}\n{{- if eq .Role "assistant" }}\n### Response\n{{ .Content }}\n{{- end }}\n{{- end }}',
            default: '{{- if .System }}{{ .System }}{{ end }}\n{{- range .Messages }}\n{{- if eq .Role "user" }}\nUser: {{ .Content }}\n{{- end }}\n{{- if eq .Role "assistant" }}\nAssistant: {{ .Content }}\n{{- end }}\n{{- end }}'
        };
        return templates[useCase] || templates.default;
    }
}

module.exports = ConfigGenerator;
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `node_modules/.bin/jest tests/config-generator.test.js --verbose`
Expected: All 6 tests pass

- [ ] **Step 4: Commit**

```bash
git add src/config/generator.js tests/config-generator.test.js
git commit -m "feat(config): add ConfigGenerator for MLX, oMLX, Ollama, and llama.cpp configs"
```

---

### Task 5: MLX Model Discovery via HuggingFace Catalog

**Files:**
- Create: `src/mlx/model-catalog.js`
- Create: `tests/mlx-model-catalog.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
const MLXModelCatalog = require('../src/mlx/model-catalog');

describe('MLXModelCatalog', () => {
    const catalog = new MLXModelCatalog();

    test('initializes with default HF endpoint', () => {
        expect(catalog.hfEndpoint).toBe('https://huggingface.co/api');
    });

    test('popular coding models list is non-empty', () => {
        const models = catalog.getPopularCodingModels();
        expect(models.length).toBeGreaterThan(0);
        expect(models[0]).toHaveProperty('hfPath');
        expect(models[0]).toHaveProperty('name');
        expect(models[0]).toHaveProperty('paramsB');
        expect(models[0]).toHaveProperty('quantization');
    });

    test('getModelByHardware returns reasonable suggestions for 16GB', () => {
        const suggestions = catalog.getModelByHardware(16, 'coding');
        expect(suggestions.length).toBeGreaterThan(0);
        // 16GB can handle up to 12B models
        expect(suggestions[0].paramsB).toBeLessThanOrEqual(13);
    });

    test('getModelByHardware returns MoE models for 8GB', () => {
        const suggestions = catalog.getModelByHardware(8, 'coding');
        const hasMoE = suggestions.some(m => m.isMoE);
        expect(hasMoE).toBe(true);
    });

    test('quantization maps MLX names to canonical', () => {
        expect(catalog.normalizeQuantization('4bit')).toBe('Q4_K_M');
        expect(catalog.normalizeQuantization('8bit')).toBe('Q8_0');
        expect(catalog.normalizeQuantization('OptiQ-4bit')).toBe('Q4_K_M');
        expect(catalog.normalizeQuantization('fp16')).toBe('FP16');
        expect(catalog.normalizeQuantization('Q4_K_M')).toBe('Q4_K_M');
    });

    test('getMemoryEstimate calculates correctly', () => {
        const est = catalog.getMemoryEstimate(7, 'Q4_K_M', 4096);
        expect(est.weightGB).toBeCloseTo(3.94, 1);  // 7B * 4.5 bits / 8 / 1024^3 * 1e9 ≈ 3.94 GB
        expect(est.totalGB).toBeGreaterThan(est.weightGB);  // total includes KV cache
    });
});
```

Run: `node_modules/.bin/jest tests/mlx-model-catalog.test.js`
Expected: FAIL (all tests)

- [ ] **Step 2: Create `src/mlx/model-catalog.js`**

```javascript
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
        const kvCacheGB = contextLength / 2048 * Math.min(3, paramsB * 0.3);
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
        const fetch = require('../utils/fetch');
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
```

- [ ] **Step 3: Run tests**

Run: `node_modules/.bin/jest tests/mlx-model-catalog.test.js --verbose`
Expected: All 6 tests pass

- [ ] **Step 4: Commit**

```bash
git add src/mlx/model-catalog.js tests/mlx-model-catalog.test.js
git commit -m "feat(mlx): add MLX model catalog with curated seed models and HF API integration"
```

---

### Task 6: Wire Everything into LLMChecker Class

**Files:**
- Modify: `src/index.js` (add MLXClient and ConfigGenerator to LLMChecker)

- [ ] **Step 1: Add MLX imports and methods to `src/index.js`**

At top of file (~line 1), add after existing requires:

```javascript
const MLXClient = require('./mlx/client');
const ConfigGenerator = require('./config/generator');
```

In constructor (~line 24), add after `this.ollamaClient`:

```javascript
        this.mlxClient = new MLXClient();
        this.configGenerator = new ConfigGenerator();
```

Add new method after `generateOllamaRecommendations` (~line 1121):

```javascript
    async generateMlxRecommendations(hardware) {
        const AppleSiliconDetector = require('./hardware/backends/apple-silicon');
        const detector = new AppleSiliconDetector();
        const mlxInfo = detector.mlxInfo();
        const MLXModelCatalog = require('./mlx/model-catalog');
        const catalog = new MLXModelCatalog();

        if (!mlxInfo.available) {
            return { available: false, reason: 'MLX framework not available on this system' };
        }

        const effectiveMemory = detector.getEffectiveMemoryForMLX();
        const codingModels = catalog.getModelByHardware(effectiveMemory, 'coding');
        const reasoningModels = catalog.getModelByHardware(effectiveMemory, 'reasoning');
        const generalModels = catalog.getModelByHardware(effectiveMemory, 'general');

        return {
            available: true,
            chip: mlxInfo.chip,
            effectiveMemoryGB: effectiveMemory,
            recommendations: {
                coding: codingModels.map(m => ({
                    name: m.name,
                    hfPath: m.hfPath,
                    paramsB: m.paramsB,
                    totalGB: m.totalGB,
                    isMoE: m.isMoE,
                    activeParamsB: m.activeParamsB,
                    config: this.configGenerator.getOptimalConfig('coding'),
                    runCommand: this.configGenerator.generateMLXRunCommand(m.hfPath, 'coding')
                })),
                reasoning: reasoningModels.map(m => ({
                    name: m.name,
                    hfPath: m.hfPath,
                    paramsB: m.paramsB,
                    totalGB: m.totalGB,
                    config: this.configGenerator.getOptimalConfig('reasoning'),
                    runCommand: this.configGenerator.generateMLXRunCommand(m.hfPath, 'reasoning')
                })),
                general: generalModels.map(m => ({
                    name: m.name,
                    hfPath: m.hfPath,
                    paramsB: m.paramsB,
                    totalGB: m.totalGB,
                    config: this.configGenerator.getOptimalConfig('general'),
                    runCommand: this.configGenerator.generateMLXRunCommand(m.hfPath, 'general')
                }))
            }
        };
    }
```

- [ ] **Step 2: Add `getConfigGenerator` accessor to LLMChecker**

```javascript
    getConfigGenerator() {
        return this.configGenerator;
    }

    getMlxClient() {
        return this.mlxClient;
    }
```

- [ ] **Step 3: Verify main tests still pass**

Run: `node tests/hardware-detector-regression.js`
Run: `node tests/run-all-tests.js`
Expected: PASS (no regressions)

- [ ] **Step 4: Commit**

```bash
git add src/index.js
git commit -m "feat(core): integrate MLXClient and ConfigGenerator into LLMChecker class"
```

---

### Task 7: Add MLX-Specific MCP Tools

**Files:**
- Modify: `bin/mcp-server.mjs`

- [ ] **Step 1: Add MLX MCP tools to `bin/mcp-server.mjs`**

After the existing `ollama_*` tool definitions (around line 900), add:

```javascript
// ============================================================================
// MLX TOOLS
// ============================================================================

const MLXClient = require('../src/mlx/client');

server.tool(
    "mlx_list_models",
    {
        mode: z.enum(["omlx", "direct"]).optional().describe("MLX client mode"),
    },
    async ({ mode }) => {
        try {
            const client = new MLXClient({ mode: mode || "omlx" });
            const models = await client.listModels();
            if (models.length === 0) {
                return { content: [{ type: "text", text: "No MLX models found. Use oMLX admin or huggingface-cli to download models." }] };
            }
            const summary = models.map(m => `- ${m.name} (${m.source})`).join("\n");
            return { content: [{ type: "text", text: `**MLX Models Available:**\n${summary}` }] };
        } catch (err) {
            return { content: [{ type: "text", text: `MLX error: ${err.message}` }] };
        }
    }
);

server.tool(
    "mlx_generate",
    {
        model: z.string().describe("MLX model name/path"),
        prompt: z.string().describe("Input prompt"),
        mode: z.enum(["omlx", "direct"]).optional().describe("MLX client mode"),
        temperature: z.number().min(0).max(2).optional().describe("Sampling temperature"),
        max_tokens: z.number().int().positive().optional().describe("Max tokens to generate"),
    },
    async ({ model, prompt, mode, temperature, max_tokens }) => {
        try {
            const client = new MLXClient({ mode: mode || "omlx" });
            const result = await client.generate(model, prompt, {
                generationOptions: {
                    temperature: temperature ?? 0.7,
                    max_tokens: max_tokens ?? 2048,
                }
            });
            return {
                content: [
                    { type: "text", text: result.response },
                    { type: "text", text: `\n\n_[${result.tokensPerSecond} tok/s, ${result.responseTime}ms]_` }
                ]
            };
        } catch (err) {
            return { content: [{ type: "text", text: `MLX generation failed: ${err.message}` }] };
        }
    }
);

server.tool(
    "mlx_optimize",
    {
        use_case: z.string().describe("Use case: coding, reasoning, chat, creative, general"),
        hf_model_id: z.string().optional().describe("HuggingFace model ID (optional)"),
    },
    async ({ use_case, hf_model_id }) => {
        try {
            const ConfigGenerator = require('../src/config/generator');
            const gen = new ConfigGenerator();
            const config = gen.getOptimalConfig(use_case);

            let output = `**Optimal config for ${use_case}:**\n\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\``;

            if (hf_model_id) {
                const runCmd = gen.generateMLXRunCommand(hf_model_id, use_case);
                const omlxSettings = gen.generateOMLXSettings({ name: hf_model_id }, use_case);
                output += `\n\n**Run command:**\n\`\`\`bash\n${runCmd}\n\`\`\``;
                output += `\n\n**oMLX settings snippet:**\n\`\`\`json\n${JSON.stringify(omlxSettings, null, 2)}\n\`\`\``;
            }

            return { content: [{ type: "text", text: output }] };
        } catch (err) {
            return { content: [{ type: "text", text: `Optimization failed: ${err.message}` }] };
        }
    }
);
```

- [ ] **Step 2: Test MCP server starts correctly**

```bash
node -e "
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
console.log('MCP SDK loaded successfully');
"
```

- [ ] **Step 3: Commit**

```bash
git add bin/mcp-server.mjs
git commit -m "feat(mcp): add MLX tools (mlx_list_models, mlx_generate, mlx_optimize)"
```

---

### Task 8: Integration Test — End-to-End MLX Workflow

**Files:**
- Create: `tests/mlx-integration.test.js`

- [ ] **Step 1: Write integration tests**

```javascript
const MLXClient = require('../src/mlx/client');
const MLXModelCatalog = require('../src/mlx/model-catalog');
const ConfigGenerator = require('../src/config/generator');
const AppleSiliconDetector = require('../src/hardware/backends/apple-silicon');

describe('MLX Integration', () => {
    const detector = new AppleSiliconDetector();
    const catalog = new MLXModelCatalog();
    const gen = new ConfigGenerator();

    test('hardware detection + model catalog + config generate coherent pipeline', () => {
        // Only meaningful on Apple Silicon
        if (process.arch !== 'arm64' || process.platform !== 'darwin') return;

        const info = detector.detect();
        expect(info).not.toBeNull();

        const effectiveMem = detector.getEffectiveMemoryForMLX();
        const suggestions = catalog.getModelByHardware(effectiveMem, 'coding');

        expect(suggestions.length).toBeGreaterThan(0);
        // Every suggestion should have a valid run command
        suggestions.forEach(m => {
            const cmd = gen.generateMLXRunCommand(m.hfPath, 'coding');
            expect(cmd).toContain(m.hfPath);
        });
    });

    test('MLXClient + ConfigGenerator: run command matches preset', () => {
        const cmd = gen.generateMLXRunCommand('mlx-community/test-model', 'coding');
        expect(cmd).toContain('--temp 0.15');
        expect(cmd).toContain('--top-p 0.1');
        expect(cmd).toContain('--max-tokens 4096');
    });

    test('MLXModelCatalog: all models have valid memory estimates', () => {
        const all = catalog.getAllModels();
        all.forEach(m => {
            const est = catalog.getMemoryEstimate(m.paramsB, m.quantization, 4096);
            expect(est.totalGB).toBeGreaterThan(0);
            expect(est.weightGB).toBeGreaterThan(0);
        });
    });

    test('MLXClient: availability check does not crash', async () => {
        const client = new MLXClient();
        const result = await client.checkAvailability();
        expect(result).toHaveProperty('available');
    });

    test('ConfigGenerator: all use cases produce valid configs', () => {
        ['coding', 'reasoning', 'chat', 'creative', 'general'].forEach(uc => {
            const config = gen.getOptimalConfig(uc);
            expect(config.temperature).toBeDefined();
            expect(config.topP).toBeDefined();
            expect(config.maxTokens).toBeDefined();
        });
    });
});
```

- [ ] **Step 2: Run integration tests**

Run: `node_modules/.bin/jest tests/mlx-integration.test.js --verbose`
Expected: All tests pass

- [ ] **Step 3: Run full test suite**

Run: `node tests/run-all-tests.js`
Expected: No regressions

- [ ] **Step 4: Commit**

```bash
git add tests/mlx-integration.test.js
git commit -m "test(integration): add end-to-end MLX workflow tests"
```

---

### Task 9: PR Preparation & Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/guides/usage-guide.md` (if exists)
- Create: `docs/guides/mlx-guide.md`

- [ ] **Step 1: Create `docs/guides/mlx-guide.md`**

```markdown
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
llm-checker ai-run --runtime mlx --models Qwen3.5-9B-OptiQ-4bit --prompt "Write a Python function"

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

### Generate configuration files

```bash
# Generate MLX run command
llm-checker config --runtime mlx --model mlx-community/Qwen3.5-9B-OptiQ-4bit --category coding

# Generate oMLX settings snippet
llm-checker config --runtime omlx --model Qwen3.5-9B --category coding
```

## Model Recommendations

### Best for each hardware tier

| RAM | Coding | Reasoning | General |
|-----|--------|-----------|---------|
| 8GB | Qwen3.5-4B-OptiQ-4bit (3GB) | DeepSeek-R1-Distill-Qwen-7B* | Phi-4-mini-3.8B |
| 16GB | Gemma-4-12b-coder (8GB) | DeepSeek-R1-Distill-Qwen-14B | Qwen3.5-9B-OptiQ-4bit |
| 32GB | Qwen3.6-27B-OptiQ-4bit (16GB) | DeepSeek-R1-Distill-Qwen-32B | Gemma-4-27B |
| 64GB | Any 70B@4bit | DeepSeek-R1-70B | Llama 4-70B |

## MCP Integration

When using oMLX, it has its own MCP server — llm-checker's MCP tools are optional:

```bash
# llm-checker MCP with MLX tools
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
```

- [ ] **Step 2: Update README with MLX support info**

Add a section to the existing README.md highlighting MLX support:

```markdown
## MLX Backend (Apple Silicon)

llm-checker now supports running models via MLX on Apple Silicon Macs,
in addition to the default Ollama backend.

- **oMLX mode:** Connect to a running oMLX server for full-featured inference
- **Direct mode:** Run models via `mlx_lm.generate` without a server
- **Model catalog:** 15+ curated MLX models for coding, reasoning, and general use
- **Config generation:** Optimal settings per use case, for MLX, oMLX, and Ollama

See [MLX Guide](docs/guides/mlx-guide.md) for complete documentation.
```

- [ ] **Step 3: Create PR description template**

Save as `docs/superpowers/PR_TEMPLATE.md`:

```markdown
## Summary

Adds MLX backend support to llm-checker — hardware detection, model discovery,
configuration generation, and inference execution via oMLX API or direct mlx-lm
subprocess.

## Changes

### New Files
- `src/mlx/client.js` — MLX execution client (oMLX API + direct modes)
- `src/mlx/index.js` — Barrel export
- `src/mlx/model-catalog.js` — HuggingFace MLX model discovery with curated seed
- `src/config/generator.js` — Multi-engine config generator (MLX, oMLX, Ollama, llama.cpp)
- `docs/guides/mlx-guide.md` — Complete MLX backend documentation

### Modified Files
- `src/hardware/backends/apple-silicon.js` — Added MLX availability detection,
  MLX-aware speed estimation, effective memory calculation
- `src/index.js` — Integrated MLXClient and ConfigGenerator into LLMChecker class
- `bin/enhanced_cli.js` — Added `--runtime` flag to ai-run, recommend, check commands
- `bin/mcp-server.mjs` — Added MLX tools (mlx_list_models, mlx_generate, mlx_optimize)

### Test Files
- `tests/mlx-client.test.js` — 6 tests for MLXClient
- `tests/apple-silicon-mlx.test.js` — 5 tests for MLX hardware detection
- `tests/config-generator.test.js` — 6 tests for ConfigGenerator
- `tests/mlx-model-catalog.test.js` — 6 tests for MLXModelCatalog
- `tests/mlx-integration.test.js` — 5 integration tests

## Architecture

MLX support follows the same pattern as the existing Ollama backend:

```
CLI (--runtime flag)
  → MLXClient
    → Mode A: oMLX HTTP API (:8000/v1/*)
    → Mode B: mlx_lm.generate (subprocess)
  → MLXModelCatalog (seed + HuggingFace API)
  → ConfigGenerator (mlx, omlx, ollama, llamacpp)
```

## Usage

```bash
# Check MLX availability
llm-checker ai-run --runtime mlx --reference-only

# Run with oMLX
llm-checker ai-run --runtime mlx --prompt "Hello" --models Qwen3.5-4B-OptiQ-4bit

# Run with direct MLX
MLX_MODE=direct llm-checker ai-run --runtime mlx --prompt "Hello"

# Get recommendations
llm-checker recommend --category coding --runtime mlx
```

## Testing

All existing tests pass. New MLX tests:

```bash
jest tests/mlx-client.test.js
jest tests/apple-silicon-mlx.test.js
jest tests/config-generator.test.js
jest tests/mlx-model-catalog.test.js
jest tests/mlx-integration.test.js
```

## Checklist

- [x] MLX execution client (oMLX API + direct subprocess)
- [x] Apple Silicon detection with MLX availability check
- [x] `--runtime` CLI flag for ai-run, recommend, check
- [x] MLX model catalog with curated seed models
- [x] Multi-engine config generator
- [x] MCP tools for MLX
- [x] Complete test coverage
- [x] Documentation
```

- [ ] **Step 4: Commit final documentation**

```bash
git add README.md docs/guides/mlx-guide.md docs/superpowers/PR_TEMPLATE.md
git commit -m "docs: add MLX backend documentation, usage guide, and PR template"
```

---

### Task 10: Final Verification & Push

- [ ] **Step 1: Run full test suite**

```bash
node tests/run-all-tests.js
```
Expected: All tests pass (zero failures)

- [ ] **Step 2: Run individual MLX tests**

```bash
node_modules/.bin/jest tests/mlx-client.test.js tests/apple-silicon-mlx.test.js tests/config-generator.test.js tests/mlx-model-catalog.test.js tests/mlx-integration.test.js --verbose
```
Expected: All MLX tests pass

- [ ] **Step 3: Manually test CLI commands**

```bash
node bin/enhanced_cli.js ai-run --runtime mlx --reference-only
node bin/enhanced_cli.js hw-detect
node bin/enhanced_cli.js recommend --category coding --runtime mlx --reference-only
```

- [ ] **Step 4: Push to private fork**

```bash
git push origin main
```

- [ ] **Step 5: Create draft PR to upstream**

```bash
# After pushing to private fork, create PR via GitHub CLI or UI:
gh pr create \
  --repo Pavelevich/llm-checker \
  --head YOUR_ORG:main \
  --base main \
  --title "feat: add MLX backend support (oMLX API + direct mlx-lm)" \
  --body-file docs/superpowers/PR_TEMPLATE.md
```

---

## Risk Mitigation

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Upstream PR rejected | Low | Keep private fork; maintain separately |
| oMLX API changes | Low | Pin oMLX version; use stable OpenAI endpoints |
| mlx-lm subprocess unreliable | Medium | Fall back to oMLX mode if direct fails |
| Existing tests break | Low | Run full suite before every commit |
| Feature merge conflicts | Medium | Rebase on upstream main before final PR |

## Verification Checklist

Before submitting the PR upstream:
- [ ] `node tests/run-all-tests.js` — all pass
- [ ] `node bin/enhanced_cli.js hw-detect` — no errors
- [ ] `node bin/enhanced_cli.js ai-run --runtime mlx --reference-only` — works
- [ ] All new MLX tests pass (`jest tests/mlx-*`)
- [ ] Documentation is complete (mlx-guide.md, README update)
- [ ] Code follows existing llm-checker patterns (Commander CLI, class-based modules, error handling)

---

### Task 11: KV Cache Optimization, MXFP8 & MLX Optimization Guide (Post-MVP Enhancement)

**Files:**
- Modify: `src/config/generator.js` (add KV cache flags, server command generator)
- Modify: `src/mlx/model-catalog.js` (add mxfp8, mxfp4, nvfp4, QAT support)
- Create: `docs/superpowers/guides/mlx-optimization-guide.md` (user-facing guide)

**Rationale:** Research from Google AI (June 2026) uncovered critical MLX optimization techniques
that dramatically improve performance on Apple Silicon, especially M4-series chips.
These findings should be embedded directly into the tool — not just documented.

---

#### Step 1: Add MXFP8/nvfp4/3bit/2bit Quantization Maps

File: `src/mlx/model-catalog.js`

Add bytes per param:

```javascript
const BYTES_PER_PARAM = {
    'Q4_K_M': 0.58, 'Q8_0': 1.05, 'FP16': 2.0, 'BF16': 2.0,
    'MXFP8': 1.0, 'MXFP4': 0.50, 'NVFP4': 0.50,
};
```

Add normalization:

```javascript
const QUANT_MAP = Object.assign(QUANT_MAP, {
    'mxfp8': 'MXFP8', 'mxfp4': 'MXFP4', 'nvfp4': 'NVFP4',
    'bf16': 'BF16', 'qat-bf16': 'BF16', 'qat-mxfp8': 'MXFP8',
});
```

---

#### Step 2: Add QAT Quality Bonus

QAT models have ~40% less quality loss at same bit-width.

```javascript
function getQualityPenalty(quantization, isQAT = false) {
    const map = { 'BF16': 0, 'MXFP8': 0.5, 'Q8_0': 0.5, 'Q4_K_M': 5, 'OptiQ-4bit': 3 };
    const base = map[quantization] || 5;
    return isQAT ? Math.round(base * 0.6) : base;
}

function isQATModel(modelName) {
    return /qat/i.test(modelName);
}
```

---

#### Step 3: KV Cache Flags in ConfigGenerator

File: `src/config/generator.js`

Add to `generateMLXRunCommand()`:
```javascript
if (options.kvBits) cmd += ' --kv-bits ' + options.kvBits;
if (options.maxKvSize) cmd += ' --max-kv-size ' + options.maxKvSize;
```

Add `generateOptimizedMLXServerCommand()`:
```javascript
generateOptimizedMLXServerCommand(modelRef, useCase = 'general', totalRAMGB = 48, options = {}) {
    const kvBits = options.kvBits ?? 4;
    const maxKvSize = options.maxKvSize ?? Math.min(32768, Math.max(8192, (totalRAMGB - 4) * 750));
    let cmd = 'mlx_lm.server --model ' + modelRef;
    cmd += ' --max-kv-size ' + maxKvSize;
    cmd += ' --kv-bits ' + kvBits;
    cmd += ' --trust-remote-code';
    return cmd;
}
```

Key insight: `--kv-bits 4` reduces KV cache by 4x with zero quality loss.

---

#### Step 4: Add Gemma 4 QAT Seed Models

```javascript
{ name: 'Gemma-4-12B-qat-bf16', hfPath: 'mlx-community/gemma-4-12B-it-qat-bf16', paramsB: 12, quantization: 'BF16', category: 'general', isMoE: false, context: 262144, isQAT: true },
{ name: 'Gemma-4-12B-qat-mxfp8', hfPath: 'mlx-community/gemma-4-12B-it-qat-mxfp8', paramsB: 12, quantization: 'MXFP8', category: 'general', isMoE: false, context: 262144, isQAT: true },
{ name: 'Gemma-4-12B-qat-4bit', hfPath: 'mlx-community/gemma-4-12B-it-qat-4bit', paramsB: 12, quantization: '4bit', category: 'general', isMoE: false, context: 262144, isQAT: true },
{ name: 'Gemma-4-12B-qat-OptiQ-4bit', hfPath: 'mlx-community/gemma-4-12B-it-qat-OptiQ-4bit', paramsB: 12, quantization: 'OptiQ-4bit', category: 'general', isMoE: false, context: 262144, isQAT: true },
```

---

#### Step 5: MoE Notation Parser

```javascript
static parseModelName(name) {
    const moe = name.match(/([\d.]+)B[-_][Aa]([\d.]+)b?/i);
    if (moe) return { paramsB: parseFloat(moe[1]), activeParamsB: parseFloat(moe[2]), isMoE: true };
    const dense = name.match(/([\d.]+)B/);
    if (dense) return { paramsB: parseFloat(dense[1]), isMoE: false };
    return {};
}
```

---

#### Step 6: OS Optimization Tips

```javascript
generateWiredMemoryHint(totalRAMGB) {
    const limit = Math.floor((totalRAMGB - 6) * 1024);
    return { title: 'Increase GPU wired memory limit', command: 'sudo sysctl iogpu.wired_mem_limit=' + limit, formula: '(total_RAM - 6GB) * 1024' };
}
```

Examples: 48GB -> 44000, 32GB -> 26624, 16GB -> 10240.

---

#### Step 7: Python API Pattern

Document for script users:
```python
model, tokenizer = load("model-name", tokenizer_config={"kv_bits": 4})
```

---

#### Step 8: Tests

Add tests for:
- MXFP8 normalization and memory estimation
- QAT detection and quality penalty
- KV cache server command generation
- MoE parser (A3B, a4b, dense)
- Wired memory hint generation
