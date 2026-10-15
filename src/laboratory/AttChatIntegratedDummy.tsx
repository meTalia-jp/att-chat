import { useState } from 'react';
import './att-chat-integrated-dummy.css';

type FixtureState = 'normal' | 'marker-detail' | 'ask-one' | 'ask-three' | 'question-box' | 'question-many' | 'handoff-setup' | 'handoff-result' | 'dense-map';
type HandoffLevel = 'none' | 'minimal' | 'standard' | 'wide';
type MarkerFixture = { id: string; turn: number; quote: string; color: 'yellow' | 'red' | 'green' | 'blue'; memo: string };
type AskFixture = MarkerFixture & { question: string };
type KeepFixture = { id: string; conversation: string; turn: number; quote: string; question: string; unresolved?: boolean };

const markers: MarkerFixture[] = [
  { id: 'superposition', turn: 8, quote: '重ね合わせ', color: 'yellow', memo: '単純な並列計算との違いを確認' },
  { id: 'interference', turn: 8, quote: '干渉によって正解の確率を強めます', color: 'red', memo: 'アルゴリズム側の工夫' },
  { id: 'quantization', turn: 12, quote: 'モデルの量子化', color: 'green', memo: '物理の量子化との違い' },
  { id: 'four-bit', turn: 12, quote: '4bitへ減らす', color: 'blue', memo: '精度低下の程度' },
];

const baseKeeps: KeepFixture[] = [
  { id: 'keep-a', conversation: '量子について', turn: 8, quote: '重ね合わせとは、複数の状態を同時に表現することです', question: 'これは何が便利？' },
  { id: 'keep-b', conversation: '量子について', turn: 12, quote: '干渉によって正解の確率を強めます', question: '単純な並列計算とは違う？' },
  { id: 'keep-c', conversation: 'AIモデル', turn: 17, quote: 'モデルの量子化では重みの表現精度を減らします', question: '物理の量子化と同じ？' },
  { id: 'keep-d', conversation: 'AIモデル', turn: 21, quote: '4bitへ減らす', question: '精度はどの程度落ちる？' },
  { id: 'keep-e', conversation: '相対性理論', turn: 6, quote: '毎秒2cで縮みます', question: '相対速度との違いを確認', unresolved: true },
];

const extraKeeps: KeepFixture[] = Array.from({ length: 11 }, (_, index) => ({
  id: `extra-${index}`,
  conversation: index < 4 ? '量子について' : index < 8 ? 'AIモデル' : '相対性理論',
  turn: 24 + index,
  quote: ['観測すると一つの結果になります', '量子化誤差は層ごとに異なります', '座標系を分けて考えます'][index % 3],
  question: ['前提をもう一度確認', '実例と結び付けたい', 'この言い換えでよい？'][index % 3],
}));

const initialAsks: AskFixture[] = [
  { ...markers[2], question: 'これはLLMの量子化と同じ意味ですか？' },
  { ...markers[3], question: '精度はどの程度落ちますか？' },
  { ...markers[0], question: 'これがあるとなぜ計算に有利ですか？' },
];

const presetLabels: Record<FixtureState, string> = {
  normal: '1. 通常Conversation',
  'marker-detail': '2. Marker Detail open',
  'ask-one': '3. Immediate Ask 1件',
  'ask-three': '4. Immediate Ask 3件',
  'question-box': '5. Question Box open',
  'question-many': '6. Question Box Keep多数',
  'handoff-setup': '7. New Chat Handoff setup',
  'handoff-result': '8. Handoff後の新Conversation',
  'dense-map': '9. 長いConversation / miniMAP密集',
};

function excerpt(text: string, length = 42) {
  return Array.from(text).length > length ? Array.from(text).slice(0, length).join('') + '…' : text;
}

export function AttChatIntegratedDummy() {
  const [fixture, setFixture] = useState<FixtureState>('normal');
  const [fullCanvas, setFullCanvas] = useState(true);
  const [leftTab, setLeftTab] = useState<'chat' | 'questions'>('chat');
  const [quickTab, setQuickTab] = useState<'dictionary' | 'memo'>('dictionary');
  const [selectedMarker, setSelectedMarker] = useState<MarkerFixture | null>(null);
  const [askMode, setAskMode] = useState<'immediate' | 'deferred'>('immediate');
  const [askDraft, setAskDraft] = useState('これはどういう意味ですか？');
  const [mainDraft, setMainDraft] = useState('この話題について、もう少し具体例を挙げてください。');
  const [asks, setAsks] = useState<AskFixture[]>([]);
  const [keeps, setKeeps] = useState<KeepFixture[]>(baseKeeps);
  const [openGroups, setOpenGroups] = useState<string[]>(['量子について']);
  const [keepMenu, setKeepMenu] = useState<string | null>(null);
  const [handoffKeep, setHandoffKeep] = useState<KeepFixture | null>(null);
  const [handoffLevel, setHandoffLevel] = useState<HandoffLevel>('standard');
  const [handoffResult, setHandoffResult] = useState(false);
  const [notice, setNotice] = useState('fixture / local stateのみ。DB・API・LLMへ接続しません。');

  function applyFixture(next: FixtureState) {
    setFixture(next); setSelectedMarker(null); setKeepMenu(null); setHandoffKeep(null); setHandoffResult(false);
    setKeeps(next === 'question-many' ? [...extraKeeps, ...baseKeeps] : baseKeeps);
    setAsks(next === 'ask-one' ? initialAsks.slice(0, 1) : next === 'ask-three' ? initialAsks : []);
    setLeftTab(next === 'question-box' || next === 'question-many' || next === 'handoff-setup' ? 'questions' : 'chat');
    setOpenGroups(next === 'question-many' ? ['量子について', 'AIモデル', '相対性理論'] : ['量子について']);
    if (next === 'marker-detail') setSelectedMarker(markers[0]);
    if (next === 'handoff-setup') setHandoffKeep(baseKeeps[0]);
    if (next === 'handoff-result') setHandoffResult(true);
    setNotice(`${presetLabels[next]} を表示中。`);
  }

  function markerButton(marker: MarkerFixture) {
    return <button type="button" className={`att-dummy-marker marker-${marker.color}`} onClick={() => { setSelectedMarker(marker); setAskMode('immediate'); setAskDraft('これはどういう意味ですか？'); }} aria-label={`T${marker.turn} Marker ${marker.quote}`}>{marker.quote}</button>;
  }

  function addPreparedQuestion() {
    if (!selectedMarker || !askDraft.trim()) return;
    if (askMode === 'immediate') {
      setAsks(current => [...current.filter(item => item.id !== selectedMarker.id), { ...selectedMarker, question: askDraft.trim() }]);
      setNotice(`T${selectedMarker.turn}の質問をComposerへ追加しました。`);
    } else {
      const saved: KeepFixture = { id: `local-${Date.now()}`, conversation: '量子について', turn: selectedMarker.turn, quote: selectedMarker.quote, question: askDraft.trim() };
      setKeeps(current => [saved, ...current]); setLeftTab('questions'); setOpenGroups(current => [...new Set(['量子について', ...current])]);
      setNotice('Question Boxへmemory-only Keepを追加しました。');
    }
    setSelectedMarker(null);
  }

  function openHandoff(keep: KeepFixture) {
    setKeepMenu(null); setHandoffKeep(keep); setHandoffLevel('standard'); setHandoffResult(false);
  }

  const conversations = ['量子について', 'AIモデル', '相対性理論', '設計メモ'];
  const groupedKeeps = conversations.map(conversation => ({ conversation, items: keeps.filter(keep => keep.conversation === conversation) })).filter(group => group.items.length);
  const denseMap = fixture === 'dense-map';
  const mapTurns = denseMap ? Array.from({ length: 42 }, (_, index) => index + 1) : [7, 8, 9, 10, 11, 12, 13, 14];
  const handoffPreviewText = handoffKeep ? [
    handoffLevel === 'none' ? '' : `## 前の会話からの参考文脈\n\n[T${Math.max(1, handoffKeep.turn - 1)} / User]\n重ね合わせがなぜ有利なのですか？\n\n[T${handoffKeep.turn} / Assistant / Target]\n${handoffKeep.quote}\n\n`,
    `## 質問対象\n\n${handoffKeep.quote}\n\n## 質問\n\n${handoffKeep.question}`,
  ].join('') : '';

  return <section className={`att-integrated-dummy ${fullCanvas ? 'is-full-canvas' : ''}`} aria-label="Att-Chat Integrated Dummy UI">
    <header className="att-dummy-labbar">
      <div><strong>Att-Chat Integrated Dummy UI v0.1</strong><span>機能なし・memory-only</span></div>
      <label>表示fixture<select aria-label="表示fixture" value={fixture} onChange={event => applyFixture(event.target.value as FixtureState)}>{Object.entries(presetLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <button type="button" onClick={() => setFullCanvas(value => !value)}>{fullCanvas ? 'Lab表示へ戻る' : '全画面プレビュー'}</button>
    </header>

    <div className="att-dummy-grid">
      <aside className="att-dummy-left" aria-label="Dummy Left Sidebar">
        <div className="att-dummy-tabs" role="tablist" aria-label="左Sidebar表示">
          <button role="tab" aria-selected={leftTab === 'chat'} onClick={() => setLeftTab('chat')}>チャット</button>
          <button role="tab" aria-selected={leftTab === 'questions'} onClick={() => setLeftTab('questions')}>質問箱</button>
        </div>
        {leftTab === 'chat' ? <div className="att-dummy-conversation-list">
          <p className="att-dummy-section-note">Conversationを探して開く</p>
          {conversations.map((conversation, index) => <button type="button" className={index === 0 ? 'is-current' : ''} key={conversation} onClick={() => setNotice(`「${conversation}」を開く想定です。`)}><strong>{conversation}</strong><span>{index === 0 ? 'T12まで · 2分前' : `${8 + index * 4} Turns`}</span></button>)}
        </div> : <div className="att-dummy-question-box">
          <div className="att-dummy-question-head"><span>Keepがある会話</span><button type="button" onClick={() => { setOpenGroups([]); setKeepMenu(null); }}>すべて閉じる</button></div>
          {groupedKeeps.map(group => <section key={group.conversation}>
            <button type="button" className="att-dummy-group" aria-expanded={openGroups.includes(group.conversation)} onClick={() => { setKeepMenu(null); setOpenGroups(current => current.includes(group.conversation) ? current.filter(item => item !== group.conversation) : [...current, group.conversation]); }}><span>{openGroups.includes(group.conversation) ? '▼' : '▶'} {group.conversation}</span><small>{group.items.length}件</small></button>
            {openGroups.includes(group.conversation) && <div className="att-dummy-keep-list">{group.items.map(keep => <article key={keep.id}>
              <div className="att-dummy-keep-row"><strong>T{keep.turn}</strong><span><button type="button" className="att-dummy-return" onClick={() => setNotice(keep.unresolved ? `T${keep.turn}へ復帰。Marker位置を確認できません。` : `T${keep.turn}のMarkerへ復帰しpulseする想定です。`)}>元へ戻る</button><button type="button" className="att-dummy-more" aria-label={`T${keep.turn}のその他の操作`} aria-expanded={keepMenu === keep.id} onClick={() => setKeepMenu(current => current === keep.id ? null : keep.id)}>…</button></span></div>
              <blockquote>「{excerpt(keep.quote, 28)}」</blockquote><p>{keep.question}</p>{keep.unresolved && <small>Marker位置未解決</small>}
              {keepMenu === keep.id && <div className="att-dummy-keep-menu"><button type="button" onClick={() => { setKeepMenu(null); setNotice('「質問する」は完成予想だけのダミーです。'); }}>質問する</button><button type="button" onClick={() => openHandoff(keep)}>新規チャット</button></div>}
            </article>)}</div>}
          </section>)}
        </div>}
      </aside>

      <main className="att-dummy-center" aria-label="Dummy Conversation">
        <header className="att-dummy-conversation-head"><div><small>Conversation</small><h2>{handoffResult ? '新しいチャット' : '量子について'}</h2></div><span>{handoffResult ? 'memory-only preview' : '12 Turns'}</span></header>
        {handoffResult ? <div className="att-dummy-result">
          <p className="att-dummy-source-chip">元の会話「量子について」 / T8 から引継ぎ</p>
          <article className="is-user"><strong>User</strong><p>{handoffKeep?.question ?? 'これは何が便利なんですか？'}</p></article>
          <article className="is-assistant"><strong>Assistant</strong><p>ダミー回答です。重ね合わせだけで計算が速くなるのではなく、干渉を設計して欲しい結果の確率を強める点が重要です。</p></article>
          <button type="button" onClick={() => { setHandoffResult(false); setHandoffKeep(null); }}>元のConversation表示へ戻す</button>
        </div> : <div className="att-dummy-turns">
          <article className="is-user"><header><strong>T7 · User</strong><button type="button">☆</button></header><p>量子ビットの重ね合わせがあると、なぜ計算に有利になるのですか？</p></article>
          <article className="is-assistant"><header><strong>T8 · Assistant</strong><button type="button">★</button></header><p>量子ビットは{markerButton(markers[0])}によって複数の候補を扱えます。ただし、観測すれば一つしか取り出せません。量子アルゴリズムでは{markerButton(markers[1])}。単純に全結果を同時に読む仕組みではありません。</p></article>
          <article className="is-user"><header><strong>T9 · User</strong><button type="button">☆</button></header><p>重ね合わせだけで速いのではなく、干渉まで含めて考えるのですね。</p></article>
          <article className="is-assistant"><header><strong>T10 · Assistant</strong><button type="button">☆</button></header><p>はい。候補を保持することと、正解を高い確率で観測できるよう振幅を操作することは分けて考えます。</p></article>
          <article className="is-user"><header><strong>T11 · User</strong><button type="button">☆</button></header><p>LLMでいう量子化も、量子力学と関係するのでしょうか。</p></article>
          <article className="is-assistant"><header><strong>T12 · Assistant</strong><button type="button">★</button></header><p>{markerButton(markers[2])}は、連続的・高精度な重みを{markerButton(markers[3])}など、少ない段階で近似する処理です。名前は似ていますが量子コンピュータを使うという意味ではありません。</p></article>
          {denseMap && Array.from({ length: 12 }, (_, index) => <article className={index % 2 ? 'is-assistant' : 'is-user'} key={index}><header><strong>T{13 + index} · {index % 2 ? 'Assistant' : 'User'}</strong><button type="button">{index % 5 === 0 ? '★' : '☆'}</button></header><p>{index % 2 ? '長い会話でMarkerと重要Turnが増えた状態を確認するためのダミー回答です。' : '前の説明を踏まえて、次の疑問を短く確認します。'}</p></article>)}
        </div>}

        {!handoffResult && <section className="att-dummy-composer" aria-label="Dummy Composer">
          <label>通常メッセージ<textarea value={mainDraft} onChange={event => setMainDraft(event.target.value)} /></label>
          <div className="att-dummy-references"><strong>参照中 {asks.length ? `${asks.length}件` : ''}</strong>{asks.length === 0 ? <p>Markerから「今すぐ質問」を選ぶと、通常本文と分離して表示します。</p> : asks.map(item => <article key={item.id}><span className={`att-dummy-ref-dot marker-${item.color}`} /><div><small>T{item.turn}「{excerpt(item.quote, 24)}」</small><input aria-label={`T${item.turn} Immediate Ask`} value={item.question} onChange={event => setAsks(current => current.map(ask => ask.id === item.id ? { ...ask, question: event.target.value } : ask))} /></div><button type="button" aria-label={`T${item.turn}の参照を外す`} onClick={() => setAsks(current => current.filter(ask => ask.id !== item.id))}>×</button></article>)}</div>
          <div className="att-dummy-send-row"><span>自動送信しません</span><button type="button" disabled>送信</button></div>
        </section>}

        {selectedMarker && <aside className="att-dummy-marker-detail" role="dialog" aria-label="Marker Detail">
          <header><div><small>T{selectedMarker.turn} Marker</small><blockquote>「{selectedMarker.quote}」</blockquote></div><button type="button" aria-label="Marker Detailを閉じる" onClick={() => setSelectedMarker(null)}>×</button></header>
          <div className="att-dummy-ask-modes"><button type="button" aria-pressed={askMode === 'immediate'} onClick={() => setAskMode('immediate')}>今すぐ質問</button><button type="button" aria-pressed={askMode === 'deferred'} onClick={() => setAskMode('deferred')}>後で質問</button></div>
          <div className="att-dummy-prefixes"><span>prefix</span>{[['質問', '質問です。 '], ['しかし…', 'ただ、疑問が残ります。 '], ['意見', '私の考えでは、']].map(([label, prefix]) => <button type="button" key={label} onClick={() => setAskDraft(current => current + prefix)}>{label}</button>)}</div>
          <label>質問入力<input value={askDraft} onChange={event => setAskDraft(event.target.value)} /></label>
          <label>Marker色<select value={selectedMarker.color} disabled><option>{selectedMarker.color}</option></select></label>
          <label>Marker memo<textarea value={selectedMarker.memo} readOnly /></label>
          <button type="button" className="att-dummy-primary" onClick={addPreparedQuestion}>{askMode === 'immediate' ? 'Composerへ追加' : '質問箱へ保存'}</button>
        </aside>}
      </main>

      <aside className="att-dummy-right" aria-label="Dummy Right Sidebar">
        <section className="att-dummy-quick-tools"><div className="att-dummy-tabs" role="tablist" aria-label="Quick Tool"><button role="tab" aria-selected={quickTab === 'dictionary'} onClick={() => setQuickTab('dictionary')}>Quick辞書</button><button role="tab" aria-selected={quickTab === 'memo'} onClick={() => setQuickTab('memo')}>Quickメモ</button></div>
          {quickTab === 'dictionary' ? <div className="att-dummy-tool-body"><strong>superposition</strong><p>重ね合わせ。複数の状態を組み合わせた量子状態。</p><small>Source: EJDict-hand（表示fixture）</small></div> : <div className="att-dummy-tool-body"><ul><li>重ね合わせと干渉の違い</li><li>4bit量子化の精度</li><li>後で具体例を読む</li></ul></div>}
        </section>
        <section className={`att-dummy-minimap ${denseMap ? 'is-dense' : ''}`} aria-label="Dummy Turn miniMAP">
          <header><div><strong>Turn miniMAP</strong><small>★ Turn目印　● Marker</small></div><div><button type="button" aria-pressed={!denseMap}>詳細</button><button type="button" aria-pressed={denseMap}>全体</button></div></header>
          <div className="att-dummy-map-rows">{mapTurns.map(turn => {
            const starred = [8, 12, 21, 33, 39].includes(turn), dots = turn % 6 === 0 ? 3 : turn % 4 === 0 ? 2 : turn % 3 === 0 ? 1 : 0;
            return <button type="button" className={turn === 12 ? 'is-current' : ''} key={turn} onClick={() => setNotice(`miniMAP T${turn} jumpの完成予想です。`)}><span>{denseMap && turn % 5 !== 0 && turn !== 1 ? '' : `T${turn}`}</span><span className="att-dummy-map-signals">{starred && <b>★</b>}{Array.from({ length: dots }, (_, index) => <i className={`marker-${(['yellow', 'red', 'green', 'blue'] as const)[(turn + index) % 4]}`} key={index} />)}</span></button>;
          })}</div>
        </section>
      </aside>
    </div>

    <footer className="att-dummy-status" role="status">{notice}</footer>

    {handoffKeep && !handoffResult && <div className="att-dummy-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setHandoffKeep(null); }}><section className="att-dummy-handoff" role="dialog" aria-modal="true" aria-label="New Chat Handoff Dummy">
      <header><div><small>Question Box → New Chat</small><h2>新規チャット</h2></div><button type="button" aria-label="閉じる" onClick={() => setHandoffKeep(null)}>×</button></header>
      <fieldset><legend>引継ぎ</legend>{([['none', 'しない'], ['minimal', '少なめ'], ['standard', '標準'], ['wide', '多め']] as const).map(([value, label]) => <label key={value}><input type="radio" name="dummy-handoff" checked={handoffLevel === value} onChange={() => setHandoffLevel(value)} />{label}{value === 'standard' && <small>初期値</small>}</label>)}</fieldset>
      <section><h3>Preview</h3><dl><dt>Source</dt><dd>{handoffKeep.conversation} / T{handoffKeep.turn}</dd><dt>Level</dt><dd>{{ none: '引継ぎなし', minimal: '前1 Turn + Target', standard: '前3 Turn + Target', wide: '前5 Turn + Target' }[handoffLevel]}</dd></dl><pre>{handoffPreviewText}</pre></section>
      <footer><button type="button" onClick={() => setHandoffKeep(null)}>戻る</button><button type="button" className="att-dummy-primary" onClick={() => { setHandoffResult(true); setFixture('handoff-result'); setNotice('新Conversation完成イメージへ切り替えました。実送信はしていません。'); }}>新規チャットとして送信</button></footer>
    </section></div>}
  </section>;
}
