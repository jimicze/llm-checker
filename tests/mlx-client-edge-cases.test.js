const MLXClient = require('../src/mlx/client');

describe('MLXClient — edge cases & negatives', () => {
    // ── normalizeBaseURL edge cases ──
    test('normalizeBaseURL handles empty string', () => {
        const client = new MLXClient();
        const result = client.normalizeBaseURL('');
        expect(result).toBe('http://localhost/v1');
    });

    test('normalizeBaseURL handles null/undefined', () => {
        const client = new MLXClient();
        const result = client.normalizeBaseURL(null);
        expect(result).toBe('http://localhost/v1');
    });

    test('normalizeBaseURL handles IPv6 address', () => {
        const client = new MLXClient();
        const result = client.normalizeBaseURL('http://[::1]:8000');
        expect(result).toContain('[::1]');
        expect(result).toContain('/v1');
    });

    test('normalizeBaseURL handles URL with trailing slash', () => {
        const client = new MLXClient();
        const result = client.normalizeBaseURL('http://localhost:8000/');
        expect(result).toBe('http://localhost:8000/v1');
    });

    test('normalizeBaseURL preserves existing /v1 path', () => {
        const client = new MLXClient();
        const result = client.normalizeBaseURL('http://localhost:8000/v1');
        expect(result).toBe('http://localhost:8000/v1');
    });

    // ── isRetryableError edge cases ──
    test('isRetryableError handles null/undefined error', () => {
        const client = new MLXClient();
        expect(client.isRetryableError(null)).toBe(false);
        expect(client.isRetryableError(undefined)).toBe(false);
    });

    test('isRetryableError handles error with no message', () => {
        const client = new MLXClient();
        expect(client.isRetryableError({})).toBe(false);
        expect(client.isRetryableError(new Error())).toBe(false);
    });

    test('isRetryableError handles string error', () => {
        const client = new MLXClient();
        expect(client.isRetryableError('ECONNREFUSED')).toBe(false); // not an object
    });

    // ── calculateTokensPerSecond edge cases ──
    test('calculateTokensPerSecond handles null/undefined', () => {
        const client = new MLXClient();
        const result = client.calculateTokensPerSecond(null);
        expect(result.tokensPerSecond).toBe(0);
        expect(result.promptTokensPerSecond).toBe(0);
    });

    test('calculateTokensPerSecond handles partial usage data', () => {
        const client = new MLXClient();
        const result = client.calculateTokensPerSecond({ prompt_tokens_per_second: 50 });
        expect(result.promptTokensPerSecond).toBe(50);
        expect(result.tokensPerSecond).toBe(0); // no generation data
    });

    test('calculateTokensPerSecond handles eval_duration-based calculation', () => {
        const client = new MLXClient();
        // 100 tokens in 2 seconds = 50 tok/s
        const result = client.calculateTokensPerSecond({ eval_count: 100, eval_duration: 2_000_000_000 });
        expect(result.evalTokensPerSecond).toBe(50);
    });

    test('calculateTokensPerSecond handles zero eval_duration', () => {
        const client = new MLXClient();
        const result = client.calculateTokensPerSecond({ eval_count: 100, eval_duration: 0 });
        expect(result.evalTokensPerSecond).toBe(0);
    });

    // ── checkAvailability caching edge cases ──
    test('checkAvailability caches result and respects timeout', async () => {
        const client = new MLXClient();
        client.isAvailable = { available: false, error: 'cached' };
        client.lastCheck = Date.now(); // just updated
        const result = await client.checkAvailability();
        expect(result.error).toBe('cached'); // used cache, didn't call API
    });

    test('checkAvailability bypasses cache after timeout', async () => {
        const client = new MLXClient();
        client.isAvailable = { available: false, error: 'stale' };
        client.lastCheck = Date.now() - 60000; // 60s ago, cacheTimeout is 30s
        // Should attempt real check (will fail with connection refused, not return stale)
        const result = await client.checkAvailability();
        expect(result.error).not.toBe('stale');
    });

    // ── listModels edge cases (direct mode) ──
    test('listModels in direct mode does not crash with nonexistent modelDir', async () => {
        const client = new MLXClient({ mode: 'direct', modelDir: '/nonexistent/path' });
        const models = await client.listModels();
        expect(Array.isArray(models)).toBe(true);
        // May return models from HF cache or be empty — both are valid
    });

    // ── generate edge cases ──
    test('generate throws when MLX not available', async () => {
        const client = new MLXClient();
        client.isAvailable = { available: false, error: 'not available' };
        client.lastCheck = Date.now();
        await expect(client.generate('test', 'prompt'))
            .rejects.toThrow(/not available/i);
    });

    test('generate with empty prompt does not crash', async () => {
        const client = new MLXClient({ mode: 'direct' });
        // Force unavailable state via cache (avoids actual Python check)
        client.isAvailable = { available: false, error: 'simulated' };
        client.lastCheck = Date.now();
        await expect(client.generate('test', ''))
            .rejects.toThrow();
    });

    test('chat with empty messages array', async () => {
        const client = new MLXClient();
        client.isAvailable = { available: false, error: 'not available' };
        client.lastCheck = Date.now();
        await expect(client.chat('test', []))
            .rejects.toThrow(/not available/i);
    });

    // ── testModelPerformance edge cases ──
    test('testModelPerformance returns failure object on error', async () => {
        const client = new MLXClient();
        client.isAvailable = { available: false, error: 'not available' };
        client.lastCheck = Date.now();
        const result = await client.testModelPerformance('test');
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
        expect(typeof result.responseTime).toBe('number');
    });

    // ── Constructor edge cases ──
    test('constructor with MLX_HOST env var', () => {
        process.env.MLX_HOST = 'http://custom:8080';
        const client = new MLXClient();
        expect(client.baseURL).toBe('http://custom:8080/v1');
        delete process.env.MLX_HOST;
    });

    test('constructor with OMLX_HOST env var', () => {
        process.env.OMLX_HOST = 'http://omlx:9090';
        const client = new MLXClient();
        expect(client.baseURL).toBe('http://omlx:9090/v1');
        delete process.env.OMLX_HOST;
    });
});
