import type { ApiRequest, ApiResponse } from '../../api/_lib/http';

export interface Captured {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

export const TEST_HOST = 'aayojan.test';

/** A same-origin JSON POST by default; `headers` are merged over those defaults. */
export function mockReq(over: Partial<ApiRequest> = {}): ApiRequest {
  return {
    method: 'POST',
    body: {},
    ...over,
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '1.2.3.4',
      origin: `https://${TEST_HOST}`,
      host: TEST_HOST,
      ...over.headers,
    },
  };
}

export function mockRes(): { res: ApiResponse; out: Captured } {
  const out: Captured = { status: 0, body: undefined, headers: {} };
  const res: ApiResponse = {
    status(code) {
      out.status = code;
      return res;
    },
    json(body) {
      out.body = body;
    },
    setHeader(name, value) {
      out.headers[name] = value;
    },
  };
  return { res, out };
}
