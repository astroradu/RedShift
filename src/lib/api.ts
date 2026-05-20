import { invokeGetBackend, type BackendInfo } from './tauri';

const READY_TIMEOUT_MS = 8000;
const POLL_MS = 80;

let backendPromise: Promise<BackendInfo> | null = null;

export function getBackend(): Promise<BackendInfo> {
  if (!backendPromise) {
    backendPromise = waitForBackend();
  }
  return backendPromise;
}

async function waitForBackend(): Promise<BackendInfo> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastErr: unknown = null;
  while (Date.now() < deadline) {
    try {
      const info = await invokeGetBackend();
      if (info && info.url && info.token) return info;
    } catch (err) {
      lastErr = err;
    }
    await sleep(POLL_MS);
  }
  throw new Error(`Backend not ready within ${READY_TIMEOUT_MS}ms${lastErr ? `: ${String(lastErr)}` : ''}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { url, token } = await getBackend();
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Accept', 'application/json');

  const response = await fetch(`${url}${path}`, { ...init, headers });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new ApiError(response.status, text || response.statusText, path);
  }
  return (await response.json()) as T;
}

/**
 * Like apiFetch, but returns an ArrayBuffer. Use for the Sky Viewer star
 * catalogue endpoint which serves a packed float32 binary blob.
 */
export async function fetchBinary(path: string, init?: RequestInit): Promise<ArrayBuffer> {
  const { url, token } = await getBackend();
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Accept', 'application/octet-stream');

  const response = await fetch(`${url}${path}`, { ...init, headers });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new ApiError(response.status, text || response.statusText, path);
  }
  return await response.arrayBuffer();
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly path: string) {
    super(`[${status}] ${path}: ${message}`);
    this.name = 'ApiError';
  }
}

export interface SseHandlers<TProgress, TDone> {
  onProgress?: (event: TProgress) => void;
  onDone?: (event: TDone) => void;
  onError?: (err: unknown) => void;
  signal?: AbortSignal;
}

export async function subscribeSSE<TProgress, TDone>(
  path: string,
  body: unknown,
  handlers: SseHandlers<TProgress, TDone>
): Promise<void> {
  try {
    const { url, token } = await getBackend();
    const response = await fetch(`${url}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: handlers.signal,
    });
    if (!response.ok || !response.body) {
      const detail = await readErrorDetail(response);
      throw new ApiError(response.status, detail, path);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const event = parseSseFrame(raw);
        if (!event) continue;
        if (event.name === 'done') {
          handlers.onDone?.(event.data as TDone);
        } else if (event.name === 'progress') {
          handlers.onProgress?.(event.data as TProgress);
        } else if (event.name === 'error') {
          const message = (event.data as { message?: string } | null)?.message ?? 'Calculation failed';
          handlers.onError?.(new Error(message));
        }
      }
    }
  } catch (err) {
    handlers.onError?.(err);
    throw err;
  }
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return response.statusText || 'SSE stream failed to open';
    try {
      const parsed = JSON.parse(text) as { detail?: unknown };
      if (typeof parsed.detail === 'string') return parsed.detail;
    } catch {
      // not JSON — fall through
    }
    return text;
  } catch {
    return response.statusText || 'SSE stream failed to open';
  }
}

function parseSseFrame(raw: string): { name: string; data: unknown } | null {
  let name = 'message';
  const dataLines: string[] = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) name = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  try {
    return { name, data: JSON.parse(dataLines.join('\n')) };
  } catch {
    return null;
  }
}
