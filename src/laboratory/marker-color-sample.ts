import type { HighlightColor } from '../shared/contracts.ts';

export type MarkerColorSurface = Record<HighlightColor, string>;
export type MarkerColorPalette = {
  id: 'current' | 'vivid-a' | 'vivid-b' | 'pastel' | 'high-contrast';
  title: string;
  intent: string;
  text: MarkerColorSurface;
  list: MarkerColorSurface;
  minimap: MarkerColorSurface;
};

export const markerColorIds: readonly HighlightColor[] = ['yellow', 'red', 'green', 'blue'];

// Experiment-local display samples. These values are not imported by MarkerCore.
export const markerColorPalettes: readonly MarkerColorPalette[] = [
  {
    id: 'current', title: 'Current', intent: 'Vivid A採用前のAtt-Chat旧本番表示。比較基準として保持。',
    text: { yellow:'#f8eaa0', red:'#f3bcb6', green:'#cae4bd', blue:'#c5ddec' },
    list: { yellow:'#f8eaa0', red:'#f3bcb6', green:'#cae4bd', blue:'#c5ddec' },
    minimap: { yellow:'#f8eaa0', red:'#f3bcb6', green:'#cae4bd', blue:'#c5ddec' },
  },
  {
    id: 'vivid-a', title: 'Vivid A', intent: '黄・赤・緑・青を素直に強め、一覧と小点を本文より一段鮮明にする案。',
    text: { yellow:'#ffd84d', red:'#ff7a73', green:'#69d57a', blue:'#6aafff' },
    list: { yellow:'#ffc928', red:'#f95d67', green:'#3fc45d', blue:'#438ff0' },
    minimap: { yellow:'#ffb800', red:'#ed334d', green:'#1fa447', blue:'#216dd6' },
  },
  {
    id: 'vivid-b', title: 'Vivid B', intent: '赤をマゼンタ寄り、緑をティール寄りにして色相差も強める案。',
    text: { yellow:'#ffe25a', red:'#ff72a5', green:'#4fd9ba', blue:'#7792ff' },
    list: { yellow:'#ffd21f', red:'#f34b91', green:'#20bea0', blue:'#536ff0' },
    minimap: { yellow:'#f2b900', red:'#d91f73', green:'#008f78', blue:'#304fc9' },
  },
  {
    id: 'pastel', title: 'Pastel', intent: '長文での穏やかさを優先し、小さい点だけ識別性を補う参考案。',
    text: { yellow:'#fff1ad', red:'#ffc9c9', green:'#ccebc9', blue:'#c9def5' },
    list: { yellow:'#f3db78', red:'#eca6aa', green:'#9fd19e', blue:'#9cbee4' },
    minimap: { yellow:'#d7a900', red:'#d96c77', green:'#5caa62', blue:'#548bc7' },
  },
  {
    id: 'high-contrast', title: 'High Contrast', intent: '色の識別を最優先し、本文は淡色、一覧と小点は強い色に分ける参考案。',
    text: { yellow:'#ffe36b', red:'#ffaaa6', green:'#9fdda8', blue:'#9ec9f5' },
    list: { yellow:'#e9b900', red:'#d83232', green:'#168447', blue:'#1769aa' },
    minimap: { yellow:'#b98a00', red:'#b41423', green:'#006f37', blue:'#004f9e' },
  },
];
