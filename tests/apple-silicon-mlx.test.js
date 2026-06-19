const AppleSiliconDetector = require('../src/hardware/backends/apple-silicon');

describe('AppleSiliconDetector MLX', () => {
    let detector;

    beforeEach(() => {
        detector = new AppleSiliconDetector();
    });

    test('detect() returns null on non-Apple Silicon (simulated)', () => {
        const originalArch = process.arch;
        const originalPlatform = process.platform;
        Object.defineProperty(process, 'arch', { value: 'x64' });
        Object.defineProperty(process, 'platform', { value: 'darwin' });
        detector.isSupported = false;
        expect(detector.detect()).toBeNull();
        Object.defineProperty(process, 'arch', { value: originalArch });
        Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    test('getChipInfo returns structure with mlx field', () => {
        // Force supported for the test (on Intel Mac too)
        detector.isSupported = true;
        const info = detector.getChipInfo();
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

    test('getEffectiveMemoryForMLX returns a number', () => {
        detector.isSupported = true;
        const info = detector.getChipInfo();
        const effective = detector.getEffectiveMemoryForMLX();
        expect(typeof effective).toBe('number');
        expect(effective).toBeGreaterThanOrEqual(0);
    });

    test('mlxInfo returns not-available when mlx not installed', () => {
        detector.isSupported = true;
        const result = detector.mlxInfo();
        expect(result.available).toBe(false);
    });

    test('estimateTokensPerSecond with mlx runtime returns higher value', () => {
        detector.isSupported = true;
        const ollamaTPS = detector.estimateTokensPerSecond(7, 'Q4_K_M', 'ollama');
        const mlxTPS = detector.estimateTokensPerSecond(7, 'Q4_K_M', 'mlx');
        expect(mlxTPS).toBeGreaterThanOrEqual(ollamaTPS);
    });
});
