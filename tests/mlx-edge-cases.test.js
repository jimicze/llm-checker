const ConfigGenerator = require('../src/config/generator');
const MLXModelCatalog = require('../src/mlx/model-catalog');
const AppleSiliconDetector = require('../src/hardware/backends/apple-silicon');

describe('ConfigGenerator — edge cases & negatives', () => {
    const gen = new ConfigGenerator();

    test('getOptimalConfig handles empty string', () => {
        const config = gen.getOptimalConfig('');
        expect(config).toBeDefined();
        expect(config.temperature).toBeDefined();
    });

    test('getOptimalConfig handles undefined', () => {
        const config = gen.getOptimalConfig(undefined);
        expect(config).toBeDefined();
    });

    test('getOptimalConfig handles null', () => {
        const config = gen.getOptimalConfig(null);
        expect(config).toBeDefined();
    });

    test('generateMLXRunCommand handles empty modelRef', () => {
        const cmd = gen.generateMLXRunCommand('', 'coding');
        expect(cmd).toContain('--model');
        expect(cmd).not.toContain('undefined');
    });

    test('generateMLXRunCommand handles undefined useCase', () => {
        const cmd = gen.generateMLXRunCommand('test', undefined);
        expect(cmd).toContain('--temp');
    });

    test('generateMLXRunCommand with temperature=0 does not break', () => {
        // 0 is a valid temperature but falsy in JS
        const cmd = gen.generateMLXRunCommand('test', 'coding', { temperature: 0 });
        expect(cmd).toContain('--temp 0');
    });

    test('generateMLXRunCommand with maxTokens=0', () => {
        const cmd = gen.generateMLXRunCommand('test', 'coding', { maxTokens: 0 });
        expect(cmd).toContain('--max-tokens 0');
        // 0 means unlimited in mlx_lm, should be valid
    });

    test('generateMLXRunCommand with seed=0', () => {
        // 0 is a valid seed
        const cmd = gen.generateMLXRunCommand('test', 'coding', { seed: 0 });
        expect(cmd).toContain('--seed 0');
    });

    test('generateOMLXSettings handles special characters in model name', () => {
        const settings = gen.generateOMLXSettings({ name: 'model/v2:latest' }, 'coding');
        const keys = Object.keys(settings);
        expect(keys[0]).not.toContain('/');
        expect(keys[0]).not.toContain(':');
    });

    test('generateOMLXSettings handles null model name', () => {
        const settings = gen.generateOMLXSettings({ name: null }, 'coding');
        const keys = Object.keys(settings);
        // Should not crash, should produce some key
        expect(keys.length).toBe(1);
        expect(typeof keys[0]).toBe('string');
    });

    test('generateOMLXSettings handles undefined model', () => {
        const settings = gen.generateOMLXSettings(undefined, 'coding');
        expect(settings).toBeDefined();
    });

    test('generateOllamaModelfile handles modelRef with spaces', () => {
        const mf = gen.generateOllamaModelfile('my model:v2', 'coding');
        expect(mf).toContain('FROM');
        expect(mf).not.toContain('undefined');
    });

    test('generateLLamaCppCommand handles gpuLayers=0', () => {
        const cmd = gen.generateLLamaCppCommand('test.gguf', 'coding', 0);
        expect(cmd).toContain('-ngl 0');
        expect(cmd).not.toContain('-ngl 999');
    });

    test('generateLLamaCppCommand handles negative gpuLayers', () => {
        const cmd = gen.generateLLamaCppCommand('test.gguf', 'coding', -5);
        // negative means all layers on GPU, so -ngl 999
        expect(cmd).toContain('-ngl 999');
    });

    // ── generateMLXServerCommand edge cases ──
    test('generateMLXServerCommand handles 0 RAM', () => {
        const cmd = gen.generateMLXServerCommand('test', 'general', 0);
        expect(cmd).toContain('--prompt-cache-size');
        expect(cmd).toContain('--trust-remote-code');
    });

    test('generateMLXServerCommand handles negative RAM', () => {
        const cmd = gen.generateMLXServerCommand('test', 'general', -10);
        expect(cmd).toContain('--prompt-cache-size');
    });

    test('generateMLXRunCommand with kvBits=0 (valid for mlx_lm.generate)', () => {
        const cmd = gen.generateMLXRunCommand('test', 'general', { kvBits: 0 });
        expect(cmd).toContain('--kv-bits 0');
    });

    // ── generateWiredMemoryHint edge cases ──
    test('generateWiredMemoryHint handles 0 RAM', () => {
        const hint = gen.generateWiredMemoryHint(0);
        expect(hint.command).toBeDefined();
        expect(typeof hint.title).toBe('string');
    });

    test('generateWiredMemoryHint handles very large RAM', () => {
        const hint = gen.generateWiredMemoryHint(1024);
        expect(hint.command).toContain('1042432'); // (1024-6)*1024
    });
});

describe('MLXModelCatalog — edge cases & negatives', () => {
    const catalog = new MLXModelCatalog();

    test('getModelByHardware handles 0GB memory', () => {
        const models = catalog.getModelByHardware(0, 'coding');
        expect(Array.isArray(models)).toBe(true);
        // with 0GB, effective = max(0, 0-4)*0.6 = 0, should get no results
        expect(models.length).toBe(0);
    });

    test('getModelByHardware handles negative memory', () => {
        const models = catalog.getModelByHardware(-10, 'coding');
        expect(Array.isArray(models)).toBe(true);
    });

    test('getModelByHardware handles null memory', () => {
        const models = catalog.getModelByHardware(null, 'coding');
        expect(Array.isArray(models)).toBe(true);
    });

    test('getModelByHardware handles undefined useCase', () => {
        const models = catalog.getModelByHardware(16, undefined);
        expect(Array.isArray(models)).toBe(true);
    });

    test('getModelByHardware handles unknown useCase', () => {
        const models = catalog.getModelByHardware(16, 'nonexistent');
        expect(Array.isArray(models)).toBe(true);
    });

    test('normalizeQuantization handles empty string', () => {
        const result = catalog.normalizeQuantization('');
        expect(result).toBe('Q4_K_M'); // fallback to default, not crash
    });

    test('normalizeQuantization handles undefined', () => {
        const result = catalog.normalizeQuantization(undefined);
        expect(result).toBe('Q4_K_M');
    });

    test('normalizeQuantization handles null', () => {
        const result = catalog.normalizeQuantization(null);
        expect(result).toBe('Q4_K_M');
    });

    test('getMemoryEstimate handles 0 paramsB', () => {
        const est = catalog.getMemoryEstimate(0, 'Q4_K_M', 4096);
        expect(est.totalGB).toBeGreaterThanOrEqual(0);
        expect(est.weightGB).toBeGreaterThanOrEqual(0);
    });

    test('getMemoryEstimate handles negative paramsB', () => {
        const est = catalog.getMemoryEstimate(-7, 'Q4_K_M', 4096);
        expect(est.totalGB).toBeGreaterThanOrEqual(0);
    });

    test('getMemoryEstimate handles extreme context length', () => {
        const est = catalog.getMemoryEstimate(7, 'Q4_K_M', 10000000);
        expect(est.kvCacheGB).toBeGreaterThan(0);
        expect(est.totalGB).toBeGreaterThan(est.weightGB);
    });

    test('getMemoryEstimate handles unknown quantization', () => {
        const est = catalog.getMemoryEstimate(7, 'FAKE_QUANT', 4096);
        expect(est.totalGB).toBeGreaterThan(0); // fallback to default
    });

    test('getQualityPenalty handles unknown quantization', () => {
        const penalty = catalog.getQualityPenalty('FAKE');
        expect(typeof penalty).toBe('number');
    });

    test('getQualityPenalty handles null quantization', () => {
        const penalty = catalog.getQualityPenalty(null);
        expect(typeof penalty).toBe('number');
    });

    test('isQATModel is case sensitive correctly', () => {
        // QAT detection should be case-insensitive or match various cases
        expect(catalog.isQATModel('gemma-4-12B-QAT-bf16')).toBe(true);
        expect(catalog.isQATModel('gemma-4-12B-qat-bf16')).toBe(true);
    });

    test('isQATModel handles null/undefined model name', () => {
        expect(catalog.isQATModel(null)).toBe(false);
        expect(catalog.isQATModel(undefined)).toBe(false);
    });

    test('isQATModel handles empty string', () => {
        expect(catalog.isQATModel('')).toBe(false);
    });

    test('parseModelName handles null/undefined', () => {
        expect(MLXModelCatalog.parseModelName(null)).toEqual({});
        expect(MLXModelCatalog.parseModelName(undefined)).toEqual({});
    });

    test('parseModelName handles empty string', () => {
        expect(MLXModelCatalog.parseModelName('')).toEqual({});
    });

    test('parseModelName handles random string with no numbers', () => {
        const result = MLXModelCatalog.parseModelName('some-random-model-name');
        expect(result).toEqual({});
    });

    test('parseModelName handles lowercase a3b notation', () => {
        const result = MLXModelCatalog.parseModelName('model-35B-a3b');
        expect(result.isMoE).toBe(true);
        expect(result.paramsB).toBe(35);
        expect(result.activeParamsB).toBe(3);
    });

    test('parseModelName handles uppercase A4B notation', () => {
        const result = MLXModelCatalog.parseModelName('model-16B-A4B');
        expect(result.isMoE).toBe(true);
        expect(result.activeParamsB).toBe(4);
    });

    test('getPopularCodingModels returns empty when no coding models match', () => {
        const emptyCatalog = new MLXModelCatalog({ models: [] });
        const models = emptyCatalog.getPopularCodingModels();
        expect(Array.isArray(models)).toBe(true);
        expect(models.length).toBe(0);
    });

    test('searchHuggingface with empty query does not crash', async () => {
        const result = await catalog.searchHuggingface('', 5);
        expect(Array.isArray(result)).toBe(true);
    });

    test('searchHuggingface handles network failure gracefully', async () => {
        const badCatalog = new MLXModelCatalog({ hfEndpoint: 'http://nonexistent.invalid/api' });
        const result = await badCatalog.searchHuggingface('mlx-community', 5);
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(0); // graceful fallback
    });
});

describe('AppleSiliconDetector MLX — edge cases', () => {
    const detector = new AppleSiliconDetector();

    test('getEffectiveMemoryForMLX returns 0 when not supported', () => {
        detector.isSupported = false;
        const mem = detector.getEffectiveMemoryForMLX();
        expect(mem).toBe(0);
    });

    test('mlxInfo returns not-available when not supported', () => {
        detector.isSupported = false;
        const info = detector.mlxInfo();
        expect(info.available).toBe(false);
        expect(info.reason).toBe('Not Apple Silicon');
    });
});
