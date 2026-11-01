import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Vercel runs /api as native Node ESM, which needs explicit ".js" on relative imports.
 * Vite and the tests are lenient, so only a deployed function would reveal a missing one.
 */
const roots = ['api', 'api/_lib', 'src/schemas'];
const extra = ['src/engine/dates.ts'];

function files(): string[] {
  const out = [...extra];
  for (const dir of roots) {
    for (const name of readdirSync(dir)) if (name.endsWith('.ts')) out.push(join(dir, name));
  }
  return out;
}

describe('serverless import hygiene', () => {
  it.each(files())('%s uses explicit .js extensions for relative imports', (file) => {
    const source = readFileSync(file, 'utf8');
    const specs = [...source.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)].map((m) => m[1] ?? '');
    for (const spec of specs) expect(spec.endsWith('.js'), `${file}: ${spec}`).toBe(true);
  });

  it('the files the API reaches only import other checked files', () => {
    const source = readFileSync('api/parse-intake.ts', 'utf8');
    const reaches = [...source.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)].map((m) => m[1]);
    expect(reaches).toContain('../src/schemas/index.js');
    expect(reaches).toContain('../src/engine/dates.js');
  });
});
