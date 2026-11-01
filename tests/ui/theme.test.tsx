import { readFileSync } from 'node:fs';
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_KEY, initialTheme } from '../../src/lib/theme';
import { renderApp, renderWithPlan } from './helpers';

function mockSystemDark(dark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi
      .fn()
      .mockReturnValue({ matches: dark, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
}

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
});
afterEach(() => vi.unstubAllGlobals());

describe('theme toggle', () => {
  it('follows the system preference, toggles, applies to <html> and remembers the choice', async () => {
    mockSystemDark(true);
    const { user } = renderApp();
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    await user.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('light');
    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark');
  });

  it('a saved choice beats the system preference', () => {
    mockSystemDark(true);
    window.localStorage.setItem(THEME_KEY, 'light');
    expect(initialTheme()).toBe('light');
    window.localStorage.setItem(THEME_KEY, 'nonsense');
    expect(initialTheme()).toBe('dark');
  });

  it('survives missing matchMedia and throwing storage', async () => {
    vi.stubGlobal('matchMedia', undefined);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const { user } = renderWithPlan();
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    spy.mockRestore();
  });
});

/** WCAG relative luminance and contrast, computed from the real tokens in index.css. */
function tokens(block: string): Record<string, [number, number, number]> {
  const out: Record<string, [number, number, number]> = {};
  for (const m of block.matchAll(/--([a-z-]+):\s*(\d+) (\d+) (\d+);/g)) {
    out[m[1] ?? ''] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  return out;
}
function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

describe('colour contrast in both themes (WCAG AA 4.5:1)', () => {
  const css = readFileSync('src/index.css', 'utf8');
  const lightBlock = /:root \{([\s\S]*?)\n {2}\}/.exec(css)?.[1] ?? '';
  const darkBlock = /:root\[data-theme='dark'\] \{([\s\S]*?)\n {2}\}/.exec(css)?.[1] ?? '';
  const themes = { light: tokens(lightBlock), dark: tokens(darkBlock) };

  const pairs: [string, string][] = [
    ['ink', 'paper'],
    ['ink', 'card'],
    ['ink', 'field'],
    ['ink-soft', 'paper'],
    ['ink-soft', 'card'],
    ['ink-soft', 'field'],
    ['placeholder', 'field'],
    ['accent', 'paper'],
    ['accent', 'card'],
    ['accent', 'accent-soft'],
    ['on-accent', 'accent'],
    ['on-accent', 'accent-dark'],
    ['ok', 'card'],
    ['ok', 'ok-soft'],
    ['warn', 'card'],
    ['warn', 'paper'],
    ['warn', 'warn-soft'],
  ];

  for (const theme of ['light', 'dark'] as const) {
    it.each(pairs)(`${theme}: %s on %s`, (fg, bg) => {
      const t = themes[theme];
      const a = t[fg];
      const b = t[bg];
      expect(a, `missing --${fg}`).toBeDefined();
      expect(b, `missing --${bg}`).toBeDefined();
      if (a && b) expect(ratio(a, b)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it.each(['light', 'dark'] as const)(
    '%s: category swatches are visible against the card (3:1)',
    (theme) => {
      const t = themes[theme];
      const card = t.card;
      for (const key of Object.keys(t).filter((k) => k.startsWith('sw-'))) {
        const swatch = t[key];
        if (swatch && card) expect(ratio(swatch, card), key).toBeGreaterThanOrEqual(3);
      }
    },
  );

  it('supports prefers-contrast: more and forced colours', () => {
    expect(css).toMatch(/@media \(prefers-contrast: more\)[\s\S]*--ink-soft: var\(--ink\)/);
    expect(css).toMatch(/@media \(forced-colors: active\)[\s\S]*CanvasText/);
  });

  it('dark surfaces get lighter as they rise (paper < card < field)', () => {
    const d = themes.dark;
    if (d.paper && d.card && d.field) {
      expect(luminance(d.paper)).toBeLessThan(luminance(d.card));
      expect(luminance(d.card)).toBeLessThan(luminance(d.field));
    }
  });
});
