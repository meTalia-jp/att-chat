export async function api<T>(path: string, data?: unknown): Promise<T> {
  const res = await fetch(path, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  return body as T;
}
