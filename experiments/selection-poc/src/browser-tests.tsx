import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Markdown } from './Markdown';
import { initial } from './fixtures';
import { addHighlight, deserialize, serialize } from './contracts.mjs';
import { captureSelection, jump } from './selection';
import type { State } from './types';

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
export async function runBrowserTests() {
  const host = document.createElement('div');
  host.id = 'browser-test-fixture';
  host.style.cssText = 'position:fixed;inset:0 auto auto 0;width:900px;max-width:95vw;height:65vh;overflow:auto;z-index:99999;background:white;padding:12px';
  document.body.append(host);
  const root = createRoot(host);
  let state: State;
  const render = () => flushSync(() => root.render(<>{state.turns.map(t => <article data-turn={t.turn_id} key={t.turn_id}><div className="markdown"><Markdown content={t.content} highlights={state.highlights.filter(h => h.turn_id === t.turn_id)} /></div></article>)}</>));
  const reset = () => { state = deserialize(serialize(initial)) as State; render(); };
  const nodeAt = (turn: string, needle: string, occurrence = 0) => {
    const el = host.querySelector(`[data-turn="${turn}"] .markdown`)!;
    const nodes: Text[] = []; const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let node;
    while ((node = walker.nextNode())) nodes.push(node as Text);
    const text = nodes.map(n => n.data).join('');
    let index = -1; for (let i = 0; i <= occurrence; i++) index = text.indexOf(needle, index + 1);
    assert(index >= 0, `fixtureに文字列がない: ${needle}`);
    const point = (at: number, end: boolean): [Text, number] => {
      let seen = 0;
      for (const n of nodes) { if (at < seen + n.length || (end && at === seen + n.length)) return [n, at - seen]; seen += n.length; }
      throw new Error('fixture境界エラー');
    };
    return { start: point(index, false), end: point(index + needle.length, true) };
  };
  const select = (turn: string, needle: string, occurrence = 0, reverse = false) => {
    const p = nodeAt(turn, needle, occurrence);
    const s = window.getSelection()!; s.removeAllRanges();
    if (reverse) s.setBaseAndExtent(...p.end, ...p.start); else s.setBaseAndExtent(...p.start, ...p.end);
    return captureSelection(host, state);
  };
  const rows: { name: string; passed: boolean; detail: string }[] = [];
  const test = (name: string, fn: () => string | void) => { try { reset(); rows.push({ name, passed: true, detail: fn() || '期待どおり' }); } catch (e) { rows.push({ name, passed: false, detail: String(e) }); } };
  const accepted = (turn: string, text: string, source = text, occurrence = 0, reverse = false) => {
    const h = select(turn, text, occurrence, reverse);
    assert(h.turn_id === turn && h.source_text === source && h.target_text === text, '原文・表示・Turnが期待と不一致');
    state = addHighlight(state, h) as State; render();
    assert(Array.from(host.querySelectorAll('[data-highlight]')).map(x => x.textContent).join('') === text, 'ハイライト表示が不一致');
    return `対応: ${turn} [${h.start_offset}, ${h.end_offset}) / ${JSON.stringify(source)}`;
  };
  const rejected = (fn: () => unknown, reason: string) => { let error = ''; try { fn(); } catch (e) { error = (e as Error).message; } assert(error.includes(reason), `期待する拒否「${reason}」ではない: ${error || '受理された'}`); return `拒否確認: ${error}`; };
  try {
    test('日本語＋英数字', () => accepted('turn-a', '日本語ABC123'));
    test('同一Turn内の2番目の同じ語', () => { const h = select('turn-a', '確認', 1); const text = state.turns[1].content; assert(h.start_offset === text.indexOf('確認', text.indexOf('確認') + 1), '別の出現へ移動'); return accepted('turn-a', '確認', '確認', 1); });
    test('別Turnの同じ文章', () => accepted('turn-b', '日本語ABC123'));
    test('絵文字', () => accepted('turn-a', '😀'));
    test('ZWJ家族絵文字', () => accepted('turn-a', '👨‍👩‍👧‍👦'));
    test('結合文字Latin', () => accepted('turn-a', 'e\u0301'));
    test('結合文字かな', () => accepted('turn-a', 'か\u3099'));
    test('サロゲート途中', () => rejected(() => select('turn-a', '\ud83d'), '文字の途中'));
    test('結合文字途中', () => rejected(() => select('turn-a', 'e'), '文字の途中'));
    test('太字全体', () => accepted('turn-a', '太字の対象'));
    test('太字の一部', () => accepted('turn-a', '字の対'));
    test('通常文→太字→通常文', () => accepted('turn-a', '普通の文に 太字の対象 と ', '普通の文に **太字の対象** と '));
    test('リンクラベル全体', () => accepted('turn-a', 'リンクの対象'));
    test('リンクラベルの一部', () => accepted('turn-a', 'ンクの対'));
    test('インラインコード', () => accepted('turn-a', 'code_123'));
    test('リスト項目', () => accepted('turn-a', 'リストの対象'));
    test('見出し', () => accepted('turn-a', '選択の基本'));
    test('未対応文字を途中に含む選択', () => {
      state = { turns: [{ turn_id: 'mixed', sequence_no: 0, role: 'assistant', status: 'completed', content: 'start **&amp;** end' }], highlights: [] }; render();
      return rejected(() => select('mixed', 'start & end'), '未対応の文字');
    });
    test('コードブロック', () => rejected(() => select('turn-b', 'const value'), 'コードブロック'));
    test('複数段落', () => rejected(() => { const a = nodeAt('turn-b', '段落の前半'), b = nodeAt('turn-b', '段落の後半'); window.getSelection()!.setBaseAndExtent(...a.start, ...b.end); captureSelection(host, state); }, '複数段落'));
    test('表', () => rejected(() => select('turn-b', '表の対象'), '表'));
    test('Markdownエスケープ', () => rejected(() => select('turn-b', '*星*'), '正確に変換'));
    test('文字参照', () => rejected(() => select('turn-b', '&'), '正確に変換'));
    test('逆方向選択', () => accepted('turn-a', '日本語ABC123', '日本語ABC123', 0, true));
    test('Turnまたぎ', () => rejected(() => { const a = nodeAt('turn-a', '日本語ABC123'), b = nodeAt('turn-b', '日本語ABC123'); window.getSelection()!.setBaseAndExtent(...a.start, ...b.end); captureSelection(host, state); }, 'Turnまたぎ'));
    test('生成中Turn', () => rejected(() => select('turn-live', '生成中'), '確定assistant'));
    test('User Turn', () => rejected(() => select('turn-user', 'User'), '確定assistant'));
    test('同一範囲重複', () => { state = addHighlight(state, select('turn-a', '日本語ABC')) as State; render(); return rejected(() => addHighlight(state, select('turn-a', '日本語ABC')), '重複'); });
    test('一部重複', () => { state = addHighlight(state, select('turn-a', '日本語ABC')) as State; render(); return rejected(() => addHighlight(state, select('turn-a', '語ABC123')), '重複'); });
    test('包含', () => { state = addHighlight(state, select('turn-a', '日本語ABC')) as State; render(); return rejected(() => addHighlight(state, select('turn-a', '日本')), '包含'); });
    test('隣接', () => { state = addHighlight(state, select('turn-a', '日本語')) as State; render(); state = addHighlight(state, select('turn-a', 'ABC123')) as State; render(); assert(host.querySelectorAll('mark').length === 2, '隣接2件が描画されない'); });
    test('4色・複数Turn・メモのJSON復元', () => {
      for (const [turn, text, color] of [['turn-a', '日本語', 'yellow'], ['turn-a', '😀', 'red'], ['turn-a', '太字の対象', 'green'], ['turn-b', '日本語', 'blue']]) {
        state = addHighlight(state, { ...select(turn, text), color, note: `メモ-${color}` }) as State; render();
      }
      state = deserialize(serialize(state)) as State; render();
      assert(state.highlights.length === 4 && state.highlights.every(h => h.note === `メモ-${h.color}`), '複数データが不一致');
      for (const color of ['yellow', 'red', 'green', 'blue']) assert(host.querySelector(`mark.mark-${color}`), `${color}が復元されない`);
    });
    test('JSON保存→再読込→同位置→ジャンプ', () => {
      const h = select('turn-b', '末尾のジャンプ対象'); state = addHighlight(state, h) as State;
      const json = serialize(state); state = deserialize(json) as State; render();
      assert(state.highlights[0].start_offset === h.start_offset, '位置不一致');
      host.scrollTop = 0; const target = jump(host, h.highlight_id); const rect = target.getBoundingClientRect(), frame = host.getBoundingClientRect();
      assert(target.textContent === h.target_text && document.activeElement === target && rect.top >= frame.top && rect.bottom <= frame.bottom, 'ジャンプ表示範囲・フォーカス不一致');
    });
    test('幅900→360→再読込→ジャンプ', () => {
      const h = select('turn-b', '末尾のジャンプ対象'); state = addHighlight(state, h) as State; const json = serialize(state);
      host.style.width = '360px'; state = deserialize(json) as State; render(); const target = jump(host, h.highlight_id);
      const rect = target.getBoundingClientRect(), frame = host.getBoundingClientRect(); assert(target.textContent === h.target_text && rect.top >= frame.top && rect.bottom <= frame.bottom, '狭幅復元の位置不一致'); host.style.width = '900px';
    });
    test('source_text不一致はunresolved・描画なし', () => {
      const h = select('turn-a', '日本語'); state = addHighlight(state, h) as State;
      const data = JSON.parse(serialize(state)); data.highlights[0].source_text = '改変'; state = deserialize(JSON.stringify(data)) as State; render();
      assert(state.highlights[0].status === 'unresolved' && host.querySelectorAll('mark').length === 0, '不一致アンカーを描画した');
    });
    test('要素境界の選択', () => rejected(() => { const p = host.querySelector('[data-turn="turn-a"] p')!; const r = document.createRange(); r.selectNodeContents(p); const s = window.getSelection()!; s.removeAllRanges(); s.addRange(r); captureSelection(host, state); }, '要素境界'));
  } finally { window.getSelection()?.removeAllRanges(); root.unmount(); host.remove(); }
  return { tested_at: new Date().toISOString(), user_agent: navigator.userAgent, viewport: { width: innerWidth, height: innerHeight }, method: 'Real browser DOM Range/Selection; synthetic directional selection, not physical drag', passed: rows.filter(r => r.passed).length, total: rows.length, rows };
}
