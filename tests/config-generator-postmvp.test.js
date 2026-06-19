const ConfigGenerator = require('../src/config/generator');

describe('ConfigGenerator POST-MVP', () => {
    const gen = new ConfigGenerator();

    test('generateOptimizedMLXServerCommand includes --kv-bits 4', () => {
        const cmd = gen.generateOptimizedMLXServerCommand('mlx-community/Qwen3.5-9B-OptiQ-4bit', 'coding', 48);
        expect(cmd).toContain('--kv-bits 4');
        expect(cmd).toContain('--max-kv-size');
        expect(cmd).toContain('--trust-remote-code');
        expect(cmd).toContain('mlx_lm.server');
    });

    test('generateOptimizedMLXServerCommand adjusts maxKvSize by RAM', () => {
        const cmd16GB = gen.generateOptimizedMLXServerCommand('test', 'general', 16);
        const cmd48GB = gen.generateOptimizedMLXServerCommand('test', 'general', 48);
        // kv size should be larger for 48GB
        const kv16 = parseInt(cmd16GB.match(/--max-kv-size (\d+)/)[1]);
        const kv48 = parseInt(cmd48GB.match(/--max-kv-size (\d+)/)[1]);
        expect(kv48).toBeGreaterThan(kv16);
    });

    test('generateOptimizedMLXServerCommand accepts custom kvBits', () => {
        const cmd = gen.generateOptimizedMLXServerCommand('test', 'general', 32, { kvBits: 8 });
        expect(cmd).toContain('--kv-bits 8');
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
