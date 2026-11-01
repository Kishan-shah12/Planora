import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Every tracked source file under the given folders (no node_modules, build output or caches). */
function filesUnder(...roots: string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (['node_modules', 'dist', 'coverage', 'test-results', 'playwright-report'].includes(name))
        continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else out.push(path.replace(/\\/g, '/'));
    }
  };
  roots.forEach(walk);
  return out;
}

const read = (path: string) => readFileSync(path, 'utf8');
const sourceFiles = filesUnder('src', 'api', 'scripts').filter((f) => /\.(ts|tsx)$/.test(f));
const testFiles = filesUnder('tests', 'e2e').filter((f) => /\.(ts|tsx)$/.test(f));

describe('project hygiene', () => {
  it('ships the documents an evaluator or contributor needs', () => {
    for (const doc of [
      'README.md',
      'LICENSE',
      'SECURITY.md',
      'CONTRIBUTING.md',
      '.env.example',
      '.editorconfig',
      'docs/ARCHITECTURE.md',
      'docs/ACCESSIBILITY.md',
      'docs/TESTING.md',
      'docs/DEPLOYMENT.md',
      '.github/workflows/ci.yml',
      'vercel.json',
    ]) {
      expect(existsSync(doc), doc).toBe(true);
    }
  });

  it('keeps every source file small (under 250 lines; engine data tables excepted)', () => {
    for (const file of sourceFiles.filter((f) => !f.endsWith('src/engine/presets.ts'))) {
      expect(read(file).split('\n').length, file).toBeLessThanOrEqual(250);
    }
  });

  it('never uses any or ts-ignore in source or tests (this file excepted: it holds the patterns)', () => {
    for (const file of [...sourceFiles, ...testFiles].filter(
      (f) => !f.endsWith('hygiene.test.ts'),
    )) {
      const text = read(file);
      expect(text, file).not.toMatch(/:\s*any\b|as any\b|<any>/);
      expect(text, file).not.toMatch(/@ts-ignore|@ts-nocheck/);
    }
  });

  it('never renders untrusted text as HTML or evaluates code', () => {
    for (const file of sourceFiles) {
      expect(read(file), file).not.toMatch(
        /dangerouslySetInnerHTML|\.innerHTML\s*=|\beval\(|new Function\(/,
      );
    }
  });

  it('has no debug logging in the browser code', () => {
    for (const file of sourceFiles.filter((f) => f.startsWith('src/'))) {
      expect(read(file), file).not.toMatch(/console\.(log|debug|info|warn|error)\(/);
    }
  });

  it('server logs never include request data, only fixed messages', () => {
    for (const file of sourceFiles.filter((f) => f.startsWith('api/'))) {
      for (const call of read(file).match(/console\.error\([^)]*\)/g) ?? []) {
        expect(call, file).toMatch(/^console\.error\('[^'`$]*'\)$/);
      }
    }
  });

  it('contains no credentials and keeps the key on the server only', () => {
    for (const file of filesUnder('src', 'api', 'scripts', 'tests', 'e2e', 'docs', 'public')) {
      const text = read(file);
      expect(text, file).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);
      expect(text, file).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/);
    }
    for (const file of sourceFiles.filter((f) => f.startsWith('src/'))) {
      expect(read(file), file).not.toMatch(/GEMINI_API_KEY|import\.meta\.env\.VITE_/);
    }
    expect(read('.gitignore')).toMatch(/^\.env$/m);
  });

  it('documents how to run, test and deploy', () => {
    const readme = read('README.md');
    for (const phrase of [
      'npm run dev',
      'npm run check',
      'npm run e2e',
      'GEMINI_API_KEY',
      'SECURITY.md',
    ]) {
      expect(readme, phrase).toContain(phrase);
    }
    const manifest = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>;
      engines?: { node?: string };
    };
    for (const script of ['dev', 'build', 'check', 'coverage', 'e2e', 'format:check']) {
      expect(manifest.scripts[script], script).toBeDefined();
    }
    expect(manifest.engines?.node).toBeDefined();
  });
});
