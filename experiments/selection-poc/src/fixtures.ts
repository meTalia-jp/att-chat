import type { State } from './types';
export const initial: State = { turns: [
  { turn_id: 'turn-user', sequence_no: 0, role: 'user', status: 'completed', content: 'この発言はUserです。マーカー対象外です。' },
  { turn_id: 'turn-a', sequence_no: 1, role: 'assistant', status: 'completed', content: '# 選択の基本\n\n日本語ABC123。確認のあと、もう一度確認します。\n\n絵文字 😀 と家族 👨‍👩‍👧‍👦、結合文字 e\u0301 と か\u3099 を確認します。\n\n普通の文に **太字の対象** と [リンクの対象](https://example.com) と `code_123` を含みます。\n\n- リストの対象です。\n- 次の項目です。' },
  { turn_id: 'turn-b', sequence_no: 2, role: 'assistant', status: 'completed', content: '# 構造と制限\n\n日本語ABC123。確認のあと、もう一度確認します。\n\n段落の前半です。\n\n段落の後半です。\n\n```js\nconst value = 123;\n```\n\n| 名前 | 値 |\n| --- | --- |\n| 表の対象 | 123 |\n\nエスケープ \\*星\\* と文字参照 &amp; を含みます。\n\n末尾のジャンプ対象です。' },
  { turn_id: 'turn-live', sequence_no: 3, role: 'assistant', status: 'generating', content: '生成中の固定サンプルです。マーカー対象外です。' }
], highlights: [] };
