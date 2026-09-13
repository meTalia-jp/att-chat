export async function api<T>(path: string, data?: unknown): Promise<T> {
  const res = await fetch(path, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  return body as T;
}
export async function apiRequest<T>(path: string, method: 'POST' | 'PATCH' | 'DELETE', data?: unknown): Promise<T> {
  const res = await fetch(path, { method, headers: data === undefined ? undefined : { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
  if (res.status === 204) return undefined as T;
  const value = await res.json();
  if (!res.ok) throw new Error(value.error?.message ?? `HTTP ${res.status}`);
  return value as T;
}
