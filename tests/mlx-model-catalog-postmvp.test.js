const MLXModelCatalog = require('../src/mlx/model-catalog');

describe('MLXModelCatalog POST-MVP', () => {
    const catalog = new MLXModelCatalog();

    test('normalizeQuantization maps MXFP8', () => {
        expect(catalog.normalizeQuantization('mxfp8')).toBe('MXFP8');
        expect(catalog.normalizeQuantization('mxfp4')).toBe('MXFP4');
        expect(catalog.normalizeQuantization('nvfp4')).toBe('NVFP4');
    });

    test('normalizeQuantization maps QAT variants', () => {
        expect(catalog.normalizeQuantization('qat-bf16')).toBe('BF16');
        expect(catalog.normalizeQuantization('qat-mxfp8')).toBe('MXFP8');
    });

    test('getMemoryEstimate handles MXFP8', () => {
        const est = catalog.getMemoryEstimate(12, 'MXFP8', 4096);
        // MXFP8 = 1.0 bytes/param, 12B params = ~12GB weights
        expect(est.weightGB).toBeGreaterThan(10);
        expect(est.weightGB).toBeLessThan(14);
    });

    test('getQualityPenalty returns base for non-QAT', () => {
        expect(catalog.getQualityPenalty('Q4_K_M')).toBe(5);
        expect(catalog.getQualityPenalty('BF16')).toBe(0);
    });

    test('getQualityPenalty reduces penalty for QAT', () => {
        expect(catalog.getQualityPenalty('Q4_K_M', true)).toBe(3); // 5 * 0.6 = 3
        // OptiQ-4bit base = 3, 3 * 0.6 = 1.8, Math.round(1.8) = 2
        expect(catalog.getQualityPenalty('OptiQ-4bit', true)).toBe(2);
    });

    test('isQATModel detects QAT in name', () => {
        expect(catalog.isQATModel('Gemma-4-12B-qat-bf16')).toBe(true);
        expect(catalog.isQATModel('Qwen3.5-9B-OptiQ-4bit')).toBe(false);
    });

    test('parseModelName parses MoE notation A3B', () => {
        const result = MLXModelCatalog.parseModelName('Qwen3.5-35B-A3B-OptiQ-4bit');
        expect(result.isMoE).toBe(true);
        expect(result.paramsB).toBe(35);
        expect(result.activeParamsB).toBe(3);
    });

    test('parseModelName parses dense model', () => {
        const result = MLXModelCatalog.parseModelName('Qwen3.5-9B-OptiQ-4bit');
        expect(result.isMoE).toBe(false);
        expect(result.paramsB).toBe(9);
    });

    test('getAllModels includes Gemma 4 QAT models', () => {
        const models = catalog.getAllModels();
        const qatModels = models.filter(m => m.isQAT);
        expect(qatModels.length).toBeGreaterThanOrEqual(4);
    });
});
