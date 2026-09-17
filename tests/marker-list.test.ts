import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import type { Highlight, HighlightColor } from '../src/shared/contracts.ts';
import { filterHighlights, locateHighlightElements, orderHighlights, markerExcerpt } from '../src/client/marker-list.ts';

test('表示専用excerpt: 60 grapheme境界、日本語・英数字・emoji・結合文字・改行', () => {
  for (const unit of ['日', 'a', '1', '👨‍👩‍👧‍👦', 'e\u0301', '🇯🇵', '\n']) {
    for (const count of [0, 59, 60, 61]) {
      const input = unit.repeat(count);
      assert.deepEqual(markerExcerpt(input), { text: unit.repeat(Math.min(count, 60)) + (count > 60 ? '…' : ''), truncated: count > 60 });
    }
  }
});

test('excerptは保存anchorを変更せず、同文別Turnのjump先を変えない', () => {
  const text = '日本語👩🏽‍💻e\u0301 abc\n'.repeat(20);
  const h = Object.freeze({ ...highlight('same', 'turn-b', 7, 7 + text.length, 'green'), source_text: text, target_text: text });
  const before = JSON.stringify(h);
  assert.equal(markerExcerpt(h.target_text).truncated, true);
  assert.equal(JSON.stringify(h), before);
  const dom = new JSDOM(`<main><article data-turn="turn-a"><mark data-highlight="same" data-s="7" data-e="${h.end_offset}"></mark></article><article data-turn="turn-b"><mark data-highlight="same" data-s="7" data-e="${h.end_offset}"></mark></article></main>`);
  assert.equal(locateHighlightElements(dom.window.document.querySelector('main')!, h)[0].closest('[data-turn]')?.getAttribute('data-turn'), 'turn-b');
  dom.window.close();
});

function highlight(id: string, turn: string, start: number, end: number, color: HighlightColor, status: Highlight['status'] = 'resolved'): Highlight {
  return { highlight_id: id, turn_id: turn, start_offset: start, end_offset: end, source_text: '同じ文', target_text: '同じ文', color, note: `${id}のメモ`, created_at: 'x', updated_at: 'x', status, reason: status === 'unresolved' ? 'source_text不一致' : null };
}

test('複数Turn・同色複数件のfilterとID/Turn/offsetによるジャンプ先特定', () => {
  const values = [highlight('a1', 'turn-a', 0, 3, 'yellow'), highlight('a2', 'turn-a', 4, 7, 'yellow'), highlight('b1', 'turn-b', 0, 3, 'blue'), highlight('bad', 'turn-b', 4, 7, 'red', 'unresolved')];
  assert.deepEqual(filterHighlights(values, new Set<HighlightColor>(['yellow'])).map(value => value.highlight_id), ['a1', 'a2']);
  assert.deepEqual(filterHighlights(values, new Set<HighlightColor>(['yellow', 'blue'])).map(value => value.highlight_id), ['a1', 'a2', 'b1']);
  assert.deepEqual(filterHighlights(values, new Set()).map(value => value.highlight_id), []);
  assert.deepEqual(filterHighlights(values, new Set<HighlightColor>(['yellow', 'red', 'green', 'blue'])), values);
  const turns = [{ turn_id: 'turn-a', sequence_no: 1 }, { turn_id: 'turn-b', sequence_no: 2 }] as Parameters<typeof orderHighlights>[1];
  assert.deepEqual(orderHighlights([values[2], values[1], values[0]], turns).map(value => value.highlight_id), ['a1', 'a2', 'b1']);

  const html = `<main style="width:900px"><article data-turn="turn-a"><mark data-highlight="a1" data-s="0" data-e="3">同じ文</mark> / <mark data-highlight="a2" data-s="4" data-e="7">同じ文</mark></article><article data-turn="turn-b"><mark data-highlight="b1" data-s="0" data-e="3">同じ文</mark><mark data-highlight="bad" data-s="4" data-e="7">同じ文</mark></article></main>`;
  let dom = new JSDOM(html), root = dom.window.document.querySelector('main') as HTMLElement;
  assert.equal(locateHighlightElements(root, values[1])[0].textContent, '同じ文');
  assert.equal(locateHighlightElements(root, values[1])[0].closest('[data-turn]')?.getAttribute('data-turn'), 'turn-a');
  assert.equal(locateHighlightElements(root, values[2])[0].closest('[data-turn]')?.getAttribute('data-turn'), 'turn-b');
  assert.deepEqual(locateHighlightElements(root, values[3]), []);

  root.style.width = '360px';
  assert.equal(locateHighlightElements(root, values[1])[0].dataset.highlight, 'a2');
  dom.window.close();
  dom = new JSDOM(html); root = dom.window.document.querySelector('main') as HTMLElement;
  assert.equal(locateHighlightElements(root, values[1])[0].dataset.highlight, 'a2');

  const split = highlight('split', 'turn-a', 10, 18, 'green');
  root.insertAdjacentHTML('beforeend', '<article data-turn="turn-a"><mark data-highlight="split" data-s="10" data-e="13">装飾</mark><strong><mark data-highlight="split" data-s="15" data-e="18">範囲</mark></strong></article>');
  assert.equal(locateHighlightElements(root, split).length, 2);
  assert.deepEqual(locateHighlightElements(root, { ...split, end_offset: 19 }), []);
  dom.window.close();
});
