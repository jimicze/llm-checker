const MLXClient = require('../src/mlx/client');
const MLXModelCatalog = require('../src/mlx/model-catalog');
const ConfigGenerator = require('../src/config/generator');
const AppleSiliconDetector = require('../src/hardware/backends/apple-silicon');
const LLMChecker = require('../src/index');

describe('MLX Integration', () => {
    const detector = new AppleSiliconDetector();
    const catalog = new MLXModelCatalog();
    const gen = new ConfigGenerator();

    test('hardware detection + model catalog + config generate coherent pipeline', () => {
        detector.isSupported = true;
        const info = detector.detect();
        expect(info).not.toBeNull();

        const effectiveMem = detector.getEffectiveMemoryForMLX() || 8;
        const suggestions = catalog.getModelByHardware(effectiveMem, 'coding');

        expect(suggestions.length).toBeGreaterThan(0);
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

    test('LLMChecker integrates MLXClient and ConfigGenerator', () => {
        const checker = new LLMChecker();
        expect(checker.getMlxClient()).toBeDefined();
        expect(checker.getConfigGenerator()).toBeDefined();
        expect(typeof checker.generateMlxRecommendations).toBe('function');
    });

    test('generateMlxRecommendations returns properly structured result', async () => {
        const checker = new LLMChecker();
        const hardware = await checker.hardwareDetector.getSystemInfo();
        const result = await checker.generateMlxRecommendations(hardware);
        expect(result).toHaveProperty('available');
        if (result.available) {
            expect(result).toHaveProperty('recommendations');
            expect(result.recommendations).toHaveProperty('coding');
            expect(result.recommendations).toHaveProperty('general');
        }
    });

    test('AppleSiliconDetector + MLXModelCatalog + ConfigGenerator: end-to-end coherence', () => {
        detector.isSupported = true;
        const info = detector.detect();
        const mem = detector.getEffectiveMemoryForMLX() || 16;
        const useCase = 'coding';

        const models = catalog.getModelByHardware(mem, useCase);
        expect(models.length).toBeGreaterThan(0);

        const bestModel = models[0];
        const config = gen.getOptimalConfig(useCase);
        const cmd = gen.generateMLXRunCommand(bestModel.hfPath, useCase);

        expect(cmd).toContain(bestModel.hfPath);
        expect(config.temperature).toBeLessThanOrEqual(0.2);
        expect(bestModel.totalGB).toBeLessThanOrEqual(mem);
    });
});
