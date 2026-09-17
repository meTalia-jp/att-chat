import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { markerLanes, measureMinimap, viewportRange } from '../src/client/minimap.ts';
import type { Highlight } from '../src/shared/contracts.ts';

test('viewport: short/long conversation, scroll, resize and outside', () => {
  assert.deepEqual(viewportRange(100, 100, 800), { start: 0, end: 1 });
  assert.deepEqual(viewportRange(-500, 2000, 500), { start: .25, end: .5 });
  assert.deepEqual(viewportRange(-500, 2000, 1000), { start: .25, end: .75 });
  assert.equal(viewportRange(900, 2000, 800), null);
  assert.equal(viewportRange(-2000, 2000, 800), null);
  assert.equal(viewportRange(0, 0, 800), null);
});

test('dense markers never share overlapping click targets; lanes are reused', () => {
  assert.deepEqual(markerLanes([], 280), []);
  assert.deepEqual(markerLanes([0], 280), [0]);
  const positions = [0, 0, .01, .02, .03, .5, .51, 1];
  const lanes = markerLanes(positions, 280);
  for (let i=0;i<positions.length;i++) for(let j=i+1;j<positions.length;j++) {
    assert.ok(lanes[i] !== lanes[j] || (positions[j]-positions[i])*280 >= 22);
  }
  assert.equal(lanes[5], 0);
});

test('DOM positions use IDs and offsets; unresolved/absent excluded; add/delete/switch recalculate', () => {
  const dom = new JSDOM('<div id="root"><article data-turn="a"><mark data-highlight="h0" data-s="0" data-e="2"></mark><mark data-highlight="h1" data-s="2" data-e="4"></mark></article><article data-turn="b"><mark data-highlight="h2" data-s="0" data-e="2"></mark><mark data-highlight="h3" data-s="2" data-e="4"></mark></article></div>');
  const root = dom.window.document.getElementById('root')!;
  const rect = (element: Element, top: number, height=20) => { element.getBoundingClientRect = () => ({ top, height } as DOMRect); };
  rect(root, -100, 1000);
  Array.from(root.querySelectorAll('article')).forEach((e,i)=>rect(e,i*500-100));
  Array.from(root.querySelectorAll('mark')).forEach((e,i)=>rect(e,i*100));
  const values = ['yellow','red','green','blue'].map((color,i)=>({highlight_id:`h${i}`,turn_id:i<2?'a':'b',start_offset:i%2*2,end_offset:i%2*2+2,status:'resolved',color,source_text:'同文',target_text:'同文'} as Highlight));
  const snapshot = JSON.stringify(values);
  assert.equal(measureMinimap(root, [], 800).markers.length, 0);
  assert.equal(measureMinimap(root, values.slice(0,1), 800).markers.length, 1);
  const map = measureMinimap(root, values, 800);
  assert.deepEqual(map.markers.map(m=>m.position), [.1,.2,.3,.4]);
  assert.equal(map.turns.length, 2);
  assert.equal(measureMinimap(root, [{...values[0],status:'unresolved'}],800).unknown,1);
  assert.equal(measureMinimap(root, [{...values[0],turn_id:'b'}],800).unknown,1);
  root.querySelector('[data-highlight="h0"]')!.remove();
  assert.equal(measureMinimap(root, values,800).markers.length,3);
  root.insertAdjacentHTML('beforeend','<article data-turn="new"></article>');
  assert.equal(measureMinimap(root, values,800).turns.length,3);
  rect(root,-100,2000);
  assert.equal(measureMinimap(root,values,800).markers[0].position,.1);
  root.replaceChildren();
  assert.equal(measureMinimap(root,values,800).markers.length,0);
  assert.equal(JSON.stringify(values),snapshot);
  dom.window.close();
});
