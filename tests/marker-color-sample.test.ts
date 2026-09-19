import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { markerColorIds, markerColorPalettes } from '../src/laboratory/marker-color-sample.ts';
import { experiments } from '../src/laboratory/catalog.ts';

test('Marker Color Sampleは4つの保存色IDを変えず5 paletteを比較する',()=>{
  assert.deepEqual(markerColorIds,['yellow','red','green','blue']);
  assert.deepEqual(markerColorPalettes.map(palette=>palette.id),['current','vivid-a','vivid-b','pastel','high-contrast']);
  for(const palette of markerColorPalettes)for(const surface of [palette.text,palette.list,palette.minimap]){
    assert.deepEqual(Object.keys(surface),markerColorIds);
    assert.ok(Object.values(surface).every(value=>/^#[0-9a-f]{6}$/i.test(value)));
  }
});

test('Currentは旧本番色を保持し、本番CSS tokenはVivid Aを用途別に参照する',()=>{
  const current=markerColorPalettes[0],vivid=markerColorPalettes[1];
  const production=readFileSync(new URL('../src/client/style.css',import.meta.url),'utf8');
  const colors=readFileSync(new URL('../src/client/marker-colors.css',import.meta.url),'utf8');
  assert.deepEqual(current.text,{yellow:'#f8eaa0',red:'#f3bcb6',green:'#cae4bd',blue:'#c5ddec'});
  assert.match(production,/@import "\.\/marker-colors\.css"/);
  for(const color of markerColorIds){
    assert.equal(current.text[color],current.list[color]);
    assert.equal(current.text[color],current.minimap[color]);
    assert.match(colors,new RegExp(`--marker-${color}-text:${vivid.text[color]}`));
    assert.match(colors,new RegExp(`--marker-${color}-list:${vivid.list[color]}`));
    assert.match(colors,new RegExp(`--marker-${color}-minimap:${vivid.minimap[color]}`));
    assert.match(colors,new RegExp(`\\.minimap \\.mark-${color}\\{background:var\\(--marker-${color}-minimap\\)\\}`));
  }
  const core=readFileSync(new URL('../src/client/MarkerCore.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(core,/marker-color-sample|markerColorPalettes/);
  assert.match(core,/marker-color-select mark-\$\{color\}/);
});

test('CatalogのColor Sample定義はv0.1契約を満たす',()=>{
  const experiment=experiments.find(item=>item.id==='marker-color-sample');
  assert.ok(experiment);
  assert.equal(experiment.runnable,true);
  assert.equal(experiment.execution?.entry,'marker-color-sample');
  assert.equal(experiment.derived_from,null);
  for(const key of ['schema_version','id','title','kind','status','version','runnable','purpose','hypothesis','derived_from','equipment','execution','procedure','acceptance'])assert.ok(key in experiment,key);
});
