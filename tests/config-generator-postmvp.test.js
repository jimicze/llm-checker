const ConfigGenerator = require('../src/config/generator');

describe('ConfigGenerator POST-MVP', () => {
    const gen = new ConfigGenerator();

    test('generateMLXServerCommand includes prompt-cache-size', () => {
        const cmd = gen.generateMLXServerCommand('mlx-community/Qwen3.5-9B-OptiQ-4bit', 'coding', 48);
        expect(cmd).toContain('--prompt-cache-size');
        expect(cmd).toContain('--trust-remote-code');
        expect(cmd).toContain('mlx_lm.server');
        expect(cmd).toContain('--temp 0.15');
    });

    test('generateMLXServerCommand adjusts cache by RAM', () => {
        const cmd16GB = gen.generateMLXServerCommand('test', 'general', 16);
        const cmd48GB = gen.generateMLXServerCommand('test', 'general', 48);
        // cache should be larger for 48GB
        const cache16 = parseInt(cmd16GB.match(/--prompt-cache-size (\d+)/)[1]);
        const cache48 = parseInt(cmd48GB.match(/--prompt-cache-size (\d+)/)[1]);
        expect(cache48).toBeGreaterThan(cache16);
    });

    test('generateMLXRunCommand uses kv-bits (valid for mlx_lm.generate)', () => {
        const cmd = gen.generateMLXRunCommand('mlx-community/test-model', 'coding', { kvBits: 4, maxKvSize: 32768 });
        expect(cmd).toContain('--kv-bits 4');
        expect(cmd).toContain('--max-kv-size 32768');
    });

    test('generateWiredMemoryHint returns correct values for 48GB', () => {
        const hint = gen.generateWiredMemoryHint(48);
        expect(hint.command).toContain('43008'); // (48-6)*1024 = 43008
        expect(hint.examples['48GB']).toBe(43008);
    });

    test('generateWiredMemoryHint returns correct values for 16GB', () => {
        const hint = gen.generateWiredMemoryHint(16);
        expect(hint.command).toContain('10240'); // (16-6)*1024 = 10240
        expect(hint.examples['16GB']).toBe(10240);
    });
});
