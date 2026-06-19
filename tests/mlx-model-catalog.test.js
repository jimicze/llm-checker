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
        expect(suggestions[0].paramsB).toBeLessThanOrEqual(13);
    });

    test('getModelByHardware includes MoE models for 8GB', () => {
        const suggestions = catalog.getModelByHardware(8, 'coding');
        const hasMoE = suggestions.some(m => m.isMoE);
        expect(hasMoE).toBe(true);
    });

    test('normalizeQuantization maps MLX names to canonical', () => {
        expect(catalog.normalizeQuantization('4bit')).toBe('Q4_K_M');
        expect(catalog.normalizeQuantization('8bit')).toBe('Q8_0');
        expect(catalog.normalizeQuantization('OptiQ-4bit')).toBe('Q4_K_M');
        expect(catalog.normalizeQuantization('fp16')).toBe('FP16');
        expect(catalog.normalizeQuantization('Q4_K_M')).toBe('Q4_K_M');
    });

    test('getMemoryEstimate calculates correctly', () => {
        const est = catalog.getMemoryEstimate(7, 'Q4_K_M', 4096);
        expect(est.weightGB).toBeGreaterThan(3);
        expect(est.weightGB).toBeLessThan(5);
        expect(est.totalGB).toBeGreaterThan(est.weightGB);
    });
});
