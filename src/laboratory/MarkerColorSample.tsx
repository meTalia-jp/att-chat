import type { CSSProperties } from 'react';
import { markerColorIds, markerColorPalettes, type MarkerColorPalette } from './marker-color-sample.ts';
import './marker-color-sample.css';

function paletteStyle(palette: MarkerColorPalette) {
  const style: CSSProperties & Record<string, string> = {};
  for (const color of markerColorIds) {
    style[`--sample-${color}-text`] = palette.text[color];
    style[`--sample-${color}-list`] = palette.list[color];
    style[`--sample-${color}-map`] = palette.minimap[color];
  }
  return style;
}

function TextSamples() {
  return <>
    <p className="color-sample-copy">普通の日本語本文の中で、<mark className="sample-yellow">重要な結論</mark>や
      <mark className="sample-red">注意すべき条件</mark>がどの程度見つけやすいかを確認します。</p>
    <p className="color-sample-copy">長めの文章では周囲の文字を読み続けられることも必要です。会話を後から読み返すとき、
      説明の流れを妨げずに<mark className="sample-green">もう一度考えたい部分が自然に目へ入ること</mark>と、
      <mark className="sample-blue">本文自体の可読性が維持されること</mark>を同時に比較します。</p>
    <p className="color-sample-near" aria-label="4色が近接する例">
      {markerColorIds.map(color => <mark key={color} className={`sample-${color}`}>{color}</mark>)}
    </p>
  </>;
}

function ListSample() {
  return <div className="color-sample-list" aria-label="Marker一覧の見本">
    {markerColorIds.map((color, index) => <div className="color-sample-list-item" key={color}>
      <span className={`sample-list-swatch sample-list-${color}`} aria-hidden="true" />
      <span><strong>{color}</strong> · Assistant #{index + 2}<br/><small>読み返し用のMarker抜粋を表示します…</small></span>
    </div>)}
  </div>;
}

function MinimapSample() {
  return <div className="color-sample-map" aria-label="miniMAP相当の小さい色点">
    <span className="color-sample-viewport" aria-label="viewport" />
    {markerColorIds.map((color, index) => <span key={color} className={`sample-map-dot sample-map-${color}`} style={{ top: `${12 + index * 23}%`, left: `${12 + (index % 2) * 12}px` }} aria-label={`${color} marker`} />)}
  </div>;
}

export function MarkerColorSample() {
  return <div className="marker-color-sample" aria-label="Marker Color Sample">
    <div className="color-sample-guidance">
      <p>同じ文章、一覧、miniMAP相当を5案で表示します。自動採点はせず、人間が実画面で判断します。</p>
      <ul>
        <li>4色を区別しやすく、Markerが一目で見つかるか</li>
        <li>本文が読みにくくならず、長文でうるさすぎないか</li>
        <li>miniMAPの小さい点でも色を区別できるか</li>
        <li>明るい面と暗い面のどちらでも極端に見えなくならないか</li>
      </ul>
    </div>
    <div className="color-sample-grid">
      {markerColorPalettes.map(palette => <article className="color-sample-palette" key={palette.id} data-palette={palette.id} style={paletteStyle(palette)}>
        <header><h3>{palette.title}</h3><p>{palette.intent}</p></header>
        <section className="color-sample-surface color-sample-light" aria-label={`${palette.title} 明るい本文`}><h4>本文 · light</h4><TextSamples /></section>
        <section className="color-sample-surface color-sample-dark" aria-label={`${palette.title} 暗い本文`}><h4>本文 · dark reference</h4><TextSamples /></section>
        <div className="color-sample-lower">
          <section><h4>Marker一覧</h4><ListSample /></section>
          <section><h4>miniMAP</h4><MinimapSample /></section>
        </div>
        <details><summary>表示色</summary>{markerColorIds.map(color => <p key={color}><strong>{color}</strong>: 本文 {palette.text[color]} / 一覧 {palette.list[color]} / miniMAP {palette.minimap[color]}</p>)}</details>
      </article>)}
    </div>
  </div>;
}
