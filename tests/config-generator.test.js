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

    test('getOptimalConfig falls back to general for unknown categories', () => {
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

    test('generateOllamaModelfile produces valid Modelfile syntax', () => {
        const modelfile = gen.generateOllamaModelfile('qwen3.5:9b', 'coding');
        expect(modelfile).toContain('FROM qwen3.5:9b');
        expect(modelfile).toContain('PARAMETER temperature 0.15');
        expect(modelfile).toContain('PARAMETER top_p 0.1');
    });
});
