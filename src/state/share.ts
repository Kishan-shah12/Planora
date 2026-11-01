import type { Plan } from '../schemas';
import { parsePlan } from './validate';

export const SHARE_PREFIX = '#plan=';
/** Hard cap on the encoded payload so a crafted link cannot make us decode megabytes. */
export const MAX_SHARE_CHARS = 32_000;

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(encoded: string): string {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function encodePlan(plan: Plan): string {
  return toBase64Url(JSON.stringify(plan));
}

export function shareHash(plan: Plan): string {
  return `${SHARE_PREFIX}${encodePlan(plan)}`;
}

export type DecodeResult =
  { ok: true; plan: Plan } | { ok: false; reason: 'too_large' | 'malformed' | 'invalid' };

export function decodePlan(encoded: string): DecodeResult {
  if (encoded.length > MAX_SHARE_CHARS) return { ok: false, reason: 'too_large' };
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return { ok: false, reason: 'malformed' };
  let data: unknown;
  try {
    data = JSON.parse(fromBase64Url(encoded));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const plan = parsePlan(data);
  return plan ? { ok: true, plan } : { ok: false, reason: 'invalid' };
}

/** Reads a plan from a location hash, or null when the hash is not a share link. */
export function planFromHash(hash: string): DecodeResult | null {
  return hash.startsWith(SHARE_PREFIX) ? decodePlan(hash.slice(SHARE_PREFIX.length)) : null;
}
