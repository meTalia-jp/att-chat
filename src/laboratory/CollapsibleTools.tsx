import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { QuickMemoPanel, type QuickMemoItem } from './QuickMemoPanel.tsx';
import { DictionaryPanel } from './DictionaryPanel.tsx';
import { createDictionarySearch, quickDictionary, type DictionaryResult, type DictionaryService } from './quick-dictionary.ts';
import './marker-quick-action.css';
import './collapsible-tools.css';

// Experiment-local hybrid shell. Tool panels remain mounted across tab changes.
export function CollapsibleTools({ children, selection, controlsHost, service=quickDictionary }: { children:ReactNode; selection:{text:string;turnId?:string}; controlsHost:HTMLElement|null; service?:DictionaryService }) {
  const [tab,setTab]=useState<'dictionary'|'memo'>('dictionary');
  const [items,setItems]=useState<QuickMemoItem[]>([]);
  const [text,setText]=useState('experiment');
  const [result,setResult]=useState<DictionaryResult|null>(null);
  const [toast,setToast]=useState(0);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const memoBody=useRef<HTMLDivElement>(null),memoScroll=useRef(0);
  const [search]=useState(()=>createDictionarySearch(service,setResult));
  useEffect(()=>()=>{search.cancel();if(timer.current)clearTimeout(timer.current);},[search]);
  useEffect(()=>{if(selection.text)setText(selection.text);},[selection]);
  useLayoutEffect(()=>{if(tab==='memo'){const list=memoBody.current?.querySelector('.quick-memo-scroll');if(list)list.scrollTop=memoScroll.current;}},[tab]);
  function selectTab(next:'dictionary'|'memo') {
    if(tab==='memo')memoScroll.current=memoBody.current?.querySelector('.quick-memo-scroll')?.scrollTop??0;
    setTab(next);
  }
  function addMemo(){
    if(!text.trim())return;
    setItems(old=>[...old,{id:crypto.randomUUID(),text,turnId:text===selection.text?selection.turnId:undefined,createdAt:new Date().toISOString()}]);
    window.getSelection()?.removeAllRanges();
    if(timer.current)clearTimeout(timer.current);
    setToast(old=>old+1);timer.current=setTimeout(()=>setToast(0),1100);
  }
  return <>
    {controlsHost&&createPortal(<details className="tools-input" open><summary>Lab試験入力（Sidebar面積の評価対象外）</summary><label>選択文字列 / 試験入力<input aria-label="Sidebar試験入力" value={text} onChange={e=>setText(e.target.value)}/></label><button onClick={addMemo}>Quick Memoへ追加</button><button onClick={()=>{selectTab('dictionary');void search.search(text);window.getSelection()?.removeAllRanges();}}>Dictionary検索</button></details>,controlsHost)}
    <div className="tools-quick-area">
      <div role="tablist" aria-label="Quick Tool"><button role="tab" id="dictionary-tab" aria-selected={tab==='dictionary'} aria-controls="dictionary-body" onClick={()=>selectTab('dictionary')}>Quick辞書</button><button role="tab" id="memo-tab" aria-selected={tab==='memo'} aria-controls="memo-body" onClick={()=>selectTab('memo')}>Quickメモ</button></div>
      <div role="tabpanel" id="dictionary-body" aria-labelledby="dictionary-tab" hidden={tab!=='dictionary'}>{result?<DictionaryPanel result={result}/>:<p className="tools-unsearched">まだ検索していません。英単語を1語選択してください。</p>}</div>
      <div ref={memoBody} role="tabpanel" id="memo-body" aria-labelledby="memo-tab" hidden={tab!=='memo'}><QuickMemoPanel items={items}/></div>
    </div>
    <div className="tools-persistent-map">{children}</div>
    <div className="tools-toast-host" role="status" aria-live="polite">{toast>0&&<div key={toast} className="tools-toast">✓ Quick Memoに追加しました</div>}</div>
  </>;
}
