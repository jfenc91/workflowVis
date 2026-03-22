// Minimal browser-based test runner

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

interface SuiteResult {
  name: string;
  tests: TestResult[];
}

let _passCount = 0;
let _failCount = 0;
const _results: SuiteResult[] = [];
let _currentSuite: SuiteResult | null = null;

export function describe(name: string, fn: () => void): void {
  const suite: SuiteResult = { name, tests: [] };
  _results.push(suite);
  const prevSuite = _currentSuite;
  _currentSuite = suite;
  fn();
  _currentSuite = prevSuite;
}

export function it(name: string, fn: () => void): void {
  try {
    fn();
    _passCount++;
    _currentSuite!.tests.push({ name, passed: true });
  } catch (e) {
    _failCount++;
    _currentSuite!.tests.push({ name, passed: false, error: (e as Error).message });
  }
}

interface Matchers {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toBeTruthy(): void;
  toBeFalsy(): void;
  toBeGreaterThan(expected: number): void;
  toBeGreaterThanOrEqual(expected: number): void;
  toBeLessThan(expected: number): void;
  toBeLessThanOrEqual(expected: number): void;
  toBeNull(): void;
  toBeInstanceOf(cls: new (...args: unknown[]) => unknown): void;
  toContain(item: unknown): void;
  not: {
    toBe(expected: unknown): void;
    toBeNull(): void;
    toBeTruthy(): void;
  };
}

export function expect(actual: unknown): Matchers {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toEqual(expected: unknown) {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a !== b) {
        throw new Error(`Expected ${b}, got ${a}`);
      }
    },
    toBeTruthy() {
      if (!actual) throw new Error(`Expected truthy, got ${JSON.stringify(actual)}`);
    },
    toBeFalsy() {
      if (actual) throw new Error(`Expected falsy, got ${JSON.stringify(actual)}`);
    },
    toBeGreaterThan(expected: number) {
      if (!((actual as number) > expected)) {
        throw new Error(`Expected ${actual} > ${expected}`);
      }
    },
    toBeGreaterThanOrEqual(expected: number) {
      if (!((actual as number) >= expected)) {
        throw new Error(`Expected ${actual} >= ${expected}`);
      }
    },
    toBeLessThan(expected: number) {
      if (!((actual as number) < expected)) {
        throw new Error(`Expected ${actual} < ${expected}`);
      }
    },
    toBeLessThanOrEqual(expected: number) {
      if (!((actual as number) <= expected)) {
        throw new Error(`Expected ${actual} <= ${expected}`);
      }
    },
    toBeNull() {
      if (actual !== null) throw new Error(`Expected null, got ${JSON.stringify(actual)}`);
    },
    toBeInstanceOf(cls: new (...args: unknown[]) => unknown) {
      if (!(actual instanceof cls)) {
        throw new Error(`Expected instance of ${cls.name}`);
      }
    },
    toContain(item: unknown) {
      if (Array.isArray(actual)) {
        if (!actual.includes(item)) throw new Error(`Array does not contain ${JSON.stringify(item)}`);
      } else if (typeof actual === 'string') {
        if (!actual.includes(item as string)) throw new Error(`String does not contain ${JSON.stringify(item)}`);
      } else {
        throw new Error(`toContain requires array or string`);
      }
    },
    not: {
      toBe(expected: unknown) {
        if (actual === expected) throw new Error(`Expected not ${JSON.stringify(expected)}`);
      },
      toBeNull() {
        if (actual === null) throw new Error(`Expected not null`);
      },
      toBeTruthy() {
        if (actual) throw new Error(`Expected falsy, got ${JSON.stringify(actual)}`);
      },
    },
  };
}

export function renderResults(): { pass: number; fail: number } {
  const container = document.getElementById('test-results');
  if (!container) return { pass: _passCount, fail: _failCount };

  let html = `<h2>Test Results: ${_passCount} passed, ${_failCount} failed</h2>`;

  for (const suite of _results) {
    html += `<div class="suite"><h3>${suite.name}</h3>`;
    for (const test of suite.tests) {
      const cls = test.passed ? 'pass' : 'fail';
      const icon = test.passed ? '\u2714' : '\u2718';
      html += `<div class="test ${cls}">${icon} ${test.name}`;
      if (test.error) {
        html += `<div class="error">${test.error}</div>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
  }

  container.innerHTML = html;

  // Also log to console
  console.log(`\n=== Test Results: ${_passCount} passed, ${_failCount} failed ===`);
  for (const suite of _results) {
    console.group(suite.name);
    for (const test of suite.tests) {
      if (test.passed) {
        console.log(`  \u2714 ${test.name}`);
      } else {
        console.error(`  \u2718 ${test.name}: ${test.error}`);
      }
    }
    console.groupEnd();
  }

  return { pass: _passCount, fail: _failCount };
}
