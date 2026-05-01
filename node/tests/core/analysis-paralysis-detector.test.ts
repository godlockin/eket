import { ParalysisDetector } from '../../src/core/analysis-paralysis-detector.js';

describe('ParalysisDetector', () => {
  let detector: ParalysisDetector;

  beforeEach(() => {
    detector = new ParalysisDetector();
  });

  test('write tool resets consecutive read counter', () => {
    detector.record('Read', 'a.ts');
    detector.record('Read', 'b.ts');
    detector.record('Read', 'c.ts');
    detector.record('Write', 'out.ts');
    // After reset, 4 more reads should not trigger
    detector.record('Read', 'd.ts');
    detector.record('Read', 'e.ts');
    detector.record('Read', 'f.ts');
    const result = detector.record('Read', 'g.ts');
    expect(result).toBeNull();
  });

  test('4 consecutive reads → no warning', () => {
    detector.record('Read', 'a.ts');
    detector.record('Read', 'b.ts');
    detector.record('Read', 'c.ts');
    const result = detector.record('Read', 'd.ts');
    expect(result).toBeNull();
  });

  test('5 consecutive reads → warning triggered', () => {
    detector.record('Read', 'a.ts');
    detector.record('Read', 'b.ts');
    detector.record('Read', 'c.ts');
    detector.record('Read', 'd.ts');
    const result = detector.record('Read', 'e.ts');
    expect(result).not.toBeNull();
    expect(result!.consecutiveReads).toBe(5);
    expect(result!.recentFiles).toContain('e.ts');
  });

  test('6th read after warning → no warning (throttle active)', () => {
    for (let i = 0; i < 5; i++) detector.record('Read', `file${i}.ts`);
    // 5th triggered warning; 6th should be throttled
    const result = detector.record('Read', 'file5.ts');
    expect(result).toBeNull();
  });

  test('8th read after initial warning → warning again (throttle passed)', () => {
    // reads 1-5: warning at 5
    for (let i = 0; i < 5; i++) detector.record('Read', `file${i}.ts`);
    // reads 6,7: throttled
    detector.record('Read', 'file5.ts');
    detector.record('Read', 'file6.ts');
    // read 8: lastWarnAt=5, readsSinceLastWarn=3 → should warn
    const result = detector.record('Read', 'file7.ts');
    expect(result).not.toBeNull();
    expect(result!.consecutiveReads).toBe(8);
  });

  test('unknown tool name → no effect', () => {
    const result = detector.record('SomethingElse', 'x.ts');
    expect(result).toBeNull();
  });

  test('reset clears state', () => {
    for (let i = 0; i < 5; i++) detector.record('Read', `file${i}.ts`);
    detector.reset();
    for (let i = 0; i < 4; i++) detector.record('Read', `file${i}.ts`);
    const result = detector.record('Read', 'extra.ts');
    // After reset, counter starts fresh → 5th read triggers again
    expect(result).not.toBeNull();
  });
});
