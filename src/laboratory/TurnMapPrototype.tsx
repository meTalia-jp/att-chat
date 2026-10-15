import { useEffect, useRef, useState } from 'react';
import { turnMapFixture, longTurnMapFixture, hundredTurnMapFixture } from './turn-map-fixture.ts';
import { currentTurnAtAnchor, turnJumpScrollTop } from './turn-map-position.ts';
import './turn-map.css';
import { CollapsibleTools } from './CollapsibleTools.tsx';

export function TurnMapPrototype() {
  const [integrated,setIntegrated]=useState(false);
  const [controlsHost,setControlsHost]=useState<HTMLDivElement|null>(null);
  const [selection,setSelection]=useState<{text:string;turnId?:string}>({text:''});
  const [fixtureSize,setFixtureSize]=useState<'16'|'50'|'100'>('16');
  const turns=fixtureSize==='100'?hundredTurnMapFixture:fixtureSize==='50'?longTurnMapFixture:turnMapFixture;
  const [mode,setMode]=useState<'detail'|'overview'>('detail');
  const [important,setImportant]=useState(()=>new Set(turnMapFixture.filter(t=>t.important).map(t=>t.id)));
  const [current,setCurrent]=useState('T1');
  const [pulse,setPulse]=useState<string|null>(null);
  const root=useRef<HTMLDivElement>(null), timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  function updateCurrent(){
    const measured=Array.from(root.current?.querySelectorAll<HTMLElement>('[data-map-turn]')??[]).map(e=>({id:e.dataset.mapTurn!,top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom}));
    const id=currentTurnAtAnchor(measured,window.innerHeight);if(id)setCurrent(id);
  }
  useEffect(()=>{
    const update=updateCurrent;
    window.addEventListener('scroll',update,{passive:true});window.addEventListener('resize',update);update();
    return ()=>{window.removeEventListener('scroll',update);window.removeEventListener('resize',update);if(timer.current)clearTimeout(timer.current);};
  },[fixtureSize]);
  function jump(id:string){
    const target=root.current?.querySelector<HTMLElement>(`[data-map-turn="${id}"]`);
    if(!target)return;
    const rect=target.getBoundingClientRect();
    const scrollHeight=(document.scrollingElement??document.documentElement).scrollHeight;
    window.scrollTo({top:turnJumpScrollTop(rect.top,rect.bottom,window.scrollY,window.innerHeight,scrollHeight),behavior:'instant'});
    target.focus({preventScroll:true});updateCurrent();setPulse(id);
    if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>setPulse(null),1400);
  }
  const map=<>
        <h3>Turn miniMAP</h3><small>★ Turn目印　● Marker</small>
        <div className="turn-map-mode" role="group" aria-label="miniMAP表示モード"><button aria-pressed={mode==='detail'} onClick={()=>setMode('detail')}>詳細</button><button aria-pressed={mode==='overview'} onClick={()=>setMode('overview')}>全体</button></div>
        <p aria-live="polite">表示位置：{current}</p>
        {mode==='detail'?<nav aria-label="Turn miniMAP" className="turn-map-rows">{turns.map(turn=><div key={turn.id} className="turn-map-row" data-map-row={turn.id}>
          <button aria-current={current===turn.id?'location':undefined} onClick={()=>jump(turn.id)}>{turn.id}</button>
          <span className="turn-map-star-slot">{important.has(turn.id)&&<button className="turn-important" aria-label={`${turn.id} Importantへ移動`} onClick={()=>jump(turn.id)}>★</button>}</span>
          <span className="turn-map-dots">{turn.markers.map((m,i)=><button key={i} style={{color:`var(--marker-${m.color}-minimap)`}} aria-label={`${turn.id} Marker ${i+1} ${m.color}へ移動`} title={m.text} onClick={()=>jump(turn.id)}>●</button>)}</span>
        </div>)}</nav>:<nav aria-label="Turn全体MAP" className="turn-map-overview" style={{gridTemplateRows:`repeat(${turns.length},minmax(0,1fr))`}}>
          {turns.map((turn,i)=><div key={turn.id} className="turn-overview-row" data-overview-turn={turn.id} data-current={current===turn.id}>
            <button aria-label={`${turn.id}へ移動`} title={turn.id} onClick={()=>jump(turn.id)} aria-current={current===turn.id?'location':undefined}>{i===0||i===turns.length-1||(i+1)%10===0||current===turn.id?turn.id:'─'}</button>
            <span>{important.has(turn.id)&&<button className="turn-overview-star" aria-label={`${turn.id} Importantへ移動`} onClick={()=>jump(turn.id)}>★</button>}</span>
            <span className="turn-overview-dots">{turn.markers.map((m,j)=><button key={j} style={{color:`var(--marker-${m.color}-minimap)`}} aria-label={`${turn.id} Marker ${j+1} ${m.color}へ移動`} title={`${turn.id}: ${m.text}`} onClick={()=>jump(turn.id)}>●</button>)}</span>
          </div>)}
        </nav>}
  </>;
  return <section aria-label="Turn miniMAP Prototype">
    <h2>{integrated?'Right Sidebar Hybrid Prototype v0.2':'Turn miniMAP + ★ Important Turn'}</h2>
    <p>● はTurn内の「ここ」、★ はTurn全体の「重要」。本文の☆で切替。地図の目印はTurnへ移動します。</p>
    <label><input type="checkbox" checked={integrated} onChange={e=>{setIntegrated(e.target.checked);if(e.target.checked){setFixtureSize('50');setImportant(new Set(longTurnMapFixture.filter(t=>t.important).map(t=>t.id)));}}}/>Sidebar統合試験（50 Turnで開始）</label>
    <label>会話fixture <select aria-label="会話fixture" value={fixtureSize} onChange={e=>{const next=e.target.value as '16'|'50'|'100';const fixture=next==='100'?hundredTurnMapFixture:next==='50'?longTurnMapFixture:turnMapFixture;setFixtureSize(next);setImportant(new Set(fixture.filter(t=>t.important).map(t=>t.id)));setPulse(null);}}><option value="16">16 Turn</option><option value="50">50 Turn</option><option value="100">100 Turn</option></select></label>
    <div ref={setControlsHost}/>
    <div className={`turn-map-layout ${integrated?'tools-layout':''}`}>
      <div ref={root} onMouseUp={()=>{const selected=window.getSelection();const node=selected?.anchorNode;const element=node?.nodeType===1?node as Element:node?.parentElement;const article=element?.closest<HTMLElement>('[data-map-turn]');if(selected?.toString().trim()&&article&&root.current?.contains(article))setSelection({text:selected.toString(),turnId:article.dataset.mapTurn});}}>{turns.map(turn=><article key={turn.id} data-map-turn={turn.id} tabIndex={-1} className={`turn-map-article ${pulse===turn.id?'turn-map-pulse':''}`}>
        <header><strong>{turn.id} · {turn.role}</strong><button className="turn-important" aria-label={`${turn.id} Important切替`} aria-pressed={important.has(turn.id)} onClick={()=>setImportant(old=>{const next=new Set(old);if(next.has(turn.id))next.delete(turn.id);else next.add(turn.id);return next;})}>{important.has(turn.id)?'★':'☆'}</button></header>
        {turn.text.split('\n\n').map((p,i)=><p key={i}>{p}</p>)}
        {!!turn.markers.length&&<p className="turn-fixture-quotes">Marker断片：{turn.markers.map((m,i)=><mark key={i} className={`mark-${m.color}`}>{m.text}</mark>)}</p>}
      </article>)}</div>
      <aside className={`turn-map-sidebar ${integrated?'tools-sidebar':''}`} aria-label="Turn navigation">
        {integrated?<CollapsibleTools selection={selection} controlsHost={controlsHost}>{map}</CollapsibleTools>:<>{map}<small className="turn-map-lower">Sidebar統合試験でQuick Memo / Dictionaryとの共存を確認できます</small></>}
      </aside>
    </div>
  </section>;
}
