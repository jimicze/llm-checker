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
        expect(custom.baseURL).toBe('http://localhost:8080/v1');
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
