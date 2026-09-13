export class ProviderError extends Error {}

export class LMStudioProvider {
  readonly baseUrl: string;
  constructor(baseUrl = process.env.LM_STUDIO_BASE_URL ?? 'http://127.0.0.1:1234/v1') {
    const url = new URL(baseUrl);
    if (url.protocol !== 'http:' || !['127.0.0.1','localhost','[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash) throw new Error('LM StudioはローカルHTTP接続先を指定してください');
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }
  async models(): Promise<string[]> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, { signal: AbortSignal.timeout(10000), redirect: 'error' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const value = await res.json();
      if (!Array.isArray(value.data) || value.data.some((m: { id?: unknown }) => !m || typeof m.id !== 'string')) throw new Error('不正なモデル一覧');
      return [...new Set<string>(value.data.map((m: { id: string }) => m.id))];
    } catch (e) { throw new ProviderError(`LM Studioのモデル取得に失敗しました: ${(e as Error).message}`); }
  }
  async generate(snapshot: Record<string, unknown>, signal: AbortSignal, onText: (text: string) => void) {
    const res = await fetch(`${this.baseUrl}/chat/completions`, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot), signal });
    if (!res.ok) { await res.body?.cancel(); throw new ProviderError(`LM Studio HTTP ${res.status}`); }
    if (!res.body || !res.headers.get('content-type')?.includes('text/event-stream')) throw new ProviderError('SSE応答ではありません');
    const reader = res.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
    let buffer = '', finished = false;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) throw new ProviderError('正常終了イベント前に通信が切断されました');
        buffer += decoder.decode(value, { stream: true });
        if (buffer.length > 1_000_000) throw new ProviderError('SSEイベントが大きすぎます');
        let match: RegExpExecArray | null;
        while ((match = /\r?\n\r?\n/.exec(buffer))) {
          const event = buffer.slice(0, match.index); buffer = buffer.slice(match.index + match[0].length);
          const data = event.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
          if (!data) continue;
          if (data === '[DONE]') { if (!finished) throw new ProviderError('finish_reasonがありません'); return; }
          const chunk = JSON.parse(data);
          if (chunk.error) throw new ProviderError('LM Studioがstreamエラーを返しました');
          if (!Array.isArray(chunk.choices)) throw new ProviderError('不正なstream応答');
          const choice = chunk.choices.find((c: { index: number }) => c.index === 0);
          if (!choice) continue; // optional usage-only chunk
          if (choice.delta?.tool_calls) throw new ProviderError('ツール呼出しは未対応です');
          if (choice.delta?.content != null) {
            if (typeof choice.delta.content !== 'string' || finished) throw new ProviderError('不正な本文イベント');
            onText(choice.delta.content);
          }
          if (choice.finish_reason != null) {
            if (!['stop','length'].includes(choice.finish_reason)) throw new ProviderError(`未対応の終了理由: ${choice.finish_reason}`);
            finished = true;
          }
        }
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
}
