import type { DictionaryResult } from './quick-dictionary.ts';

const messages = {
  loading: '辞書を読み込んでいます…',
  'not-found': '見つかりませんでした',
  invalid: '英単語を1語選択してください',
  unavailable: '辞書を読み込めませんでした',
  'missing-asset': '辞書データが未配置、または取得できません。',
};
export function DictionaryPanel({ result }: { result: DictionaryResult }) {
  return <section className="quick-dictionary-panel" aria-label="Dictionary">
    <h3>Dictionary</h3>
    <div className="quick-dictionary-result" role="status" aria-live="polite" tabIndex={0}>
      {result.status === 'found' ? <><strong>{result.word}</strong><p>{result.meaning}</p></>
        : <p>{messages[result.status]}</p>}
      {result.status === 'missing-asset' && <>
        <p>EJDict-hand の JSON を以下に配置してください。</p>
        <code>public/dictionaries/ejdict-hand/ejdict.json</code>
        <p><a href="https://kujirahand.com/web-tools/EJDictFreeDL.php" target="_blank" rel="noreferrer">辞書データの取得元</a></p>
        <p>配置済みの場合は配信設定・接続を確認し、build配信では再build後に検索してください。</p>
      </>}
    </div>
    <small>Source: <a href="https://github.com/kujirahand/EJDict" target="_blank" rel="noreferrer">{result.source}</a></small>
  </section>;
}
