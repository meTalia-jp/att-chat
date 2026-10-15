import type { HighlightColor } from '../shared/contracts.ts';

export type MapTurn = { id: string; role: 'User' | 'Assistant'; text: string; important: boolean; markers: { color: HighlightColor; text: string }[] };
// Experiment-local data; no persistent Turn or Highlight IDs/anchors.
export const turnMapFixture: readonly MapTurn[] = Array.from({length:16}, (_,i) => ({
  id:`T${i+1}`, role:i%2===0?'User':'Assistant', important:[3,7,12].includes(i),
  text: [
    '会話の中から、あとで戻りたい発言を探したいです。',
    '文章の一部分に付けるMarkerと、Turn全体の重要さは別の手がかりです。',
    '長い説明でも地図の一行として見たいです。',
    '重要なTurnには星を付けます。星は評価点ではなく、あとで戻るための目印です。',
  ][i%4] + (i===7 ? '\n\n'+Array.from({length:10},(_,n)=>`補足${n+1}：会話の長さと重要さは同じではありません。長い本文も短い質問も地図では同じ一行です。読み進めた後に番号と目印から戻れるかを確かめます。`).join('\n\n') : ''),
  markers: i===7 ? [{color:'yellow',text:'長さと重要さ'},{color:'red',text:'同じ一行'},{color:'blue',text:'番号と目印'}] : i===1 ? [{color:'green',text:'別の手がかり'}] : i===14 ? [{color:'blue',text:'地図の一行'}] : [],
}));

export const longTurnMapFixture: readonly MapTurn[] = Array.from({length:50},(_,i)=>({
  ...turnMapFixture[i%16], id:`T${i+1}`,
  important: i%9===3 || (i>=23&&i<=27),
  markers: i>=23&&i<=27 ? turnMapFixture[7].markers : turnMapFixture[i%16].markers,
}));

const hundredTurnText = [
  '今日の議題を順番に整理して、あとで戻れる形にしたいです。',
  'まず目的を確認し、判断が必要な箇所だけを明確にします。',
  'この説明は後半の設計判断にも関係しそうです。',
  '局所的な気付きにはMarker、Turn全体にはImportantを使います。',
  '前提が変わった場合に見直す場所を残しておきます。',
  '次の質問では実装範囲と検証範囲を分けて考えます。',
  'ここまでの内容を短くまとめてから次へ進みましょう。',
  '長い会話でも全体のどこにいるかを地図から把握したいです。',
  '複数のMarkerが同じTurnにある場合の密度も確認します。',
  '最後に未決事項と次に試すことを整理します。',
];

export const hundredTurnMapFixture: readonly MapTurn[] = Array.from({length:100},(_,i)=>{
  const dense=i>=47&&i<=52;
  const markers=dense
    ? turnMapFixture[7].markers
    : i%17===1 ? [{color:'green' as const,text:'設計判断'}]
    : i%19===7 ? [{color:'blue' as const,text:'現在位置'}]
    : i%23===11 ? [{color:'yellow' as const,text:'検証範囲'},{color:'red' as const,text:'未決事項'}]
    : [];
  const long=i===24||i===49||i===74
    ? '\n\n'+Array.from({length:8},(_,n)=>`補足${n+1}：これは100 Turn表示で長い発言と短い発言が混在する状態を確認するためのダミー文章です。`).join('\n\n')
    : '';
  return {id:`T${i+1}`,role:i%2===0?'User':'Assistant',text:hundredTurnText[i%hundredTurnText.length]+long,important:i%13===4||dense,markers};
});
