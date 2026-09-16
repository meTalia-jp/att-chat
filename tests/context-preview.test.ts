import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDatabase } from '../src/server/storage/database.ts';
import { Repository } from '../src/server/storage/repository.ts';
import { RetrievalRepository } from '../src/retrieval/repository.ts';
import { RetrievalService } from '../src/retrieval/service.ts';
import { ContextPreviewService,PreviewError } from '../src/context-preview/service.ts';
import { createAppServer } from '../src/server/http.ts';
function fixture(content='前'.repeat(1200)+'引用'+'後'.repeat(1200),start=1200,end=1202){
 const db=openDatabase(':memory:'),repo=new Repository(db),c=repo.createConversation('S5'),other=repo.createConversation('別'),now='2026-01-01';
 const insert=db.prepare('INSERT INTO turns VALUES(?,?,?,?,?,?,?,?)');
 for(const [id,seq,role,text,status] of [['p0',0,'assistant','最初','completed'],['p1',2,'user','質問','completed'],['p2',4,'assistant','前回答','completed'],['a',7,'assistant',content,'completed'],['g',8,'assistant','生成中','generating'],['f',9,'assistant','失敗','failed'],['c',10,'assistant','中止','cancelled'],['n1',12,'user','次の質問','completed'],['n2',14,'assistant','次の回答','completed'],['n3',20,'user','最後','completed']] as const)insert.run(id,c.conversation_id,seq,role,text,status,now,status==='generating'?null:now);
 insert.run('other',other.conversation_id,0,'assistant','別会話','completed',now,now);
 const h=repo.createHighlight(c.conversation_id,{turn_id:'a',start_offset:start,end_offset:end,source_text:content.slice(start,end),target_text:content.slice(start,end),color:'yellow',note:''});
 const retrieval=new RetrievalService(new RetrievalRepository(db)),service=new ContextPreviewService(db,retrieval);
 return {db,repo,c,other,h,retrieval,service,build:(p:Record<string,unknown>={})=>service.build(c.conversation_id,h.highlight_id,p)};
}
async function use(fn:(f:ReturnType<typeof fixture>)=>unknown,content?:string,start?:number,end?:number){const f=fixture(content,start,end);try{await fn(f);}finally{f.db.close();}}
for(const budget of [300,600,1000])for(const ratio of ['5:5','6:4','7:3'])test(`S5 A budget ${budget} ratio ${ratio}`,()=>use(f=>{
 const r=f.build({local_budget:budget,local_ratio:ratio}),s=r.sections[0];assert.equal(s.source,'local');if(s.source!=='local')return;
 assert.equal(s.before.length,budget*Number(ratio[0])/10);assert.equal(s.after.length,budget-s.before.length);assert.equal(s.highlight,'引用');assert.equal(r.sections.length,1);
}));
test('S5 Highlight only / Turn端の予算再配分',async()=>{
 await use(f=>{const r=f.build();assert.equal(r.content_utf16,2);},'引用',0,2);
 await use(f=>{const s=f.build({local_budget:300}).sections[0];assert(s.source==='local');assert.equal(s.before,'');assert.equal(s.after.length,300);},'引用'+'後'.repeat(400),0,2);
});
test('S5 grapheme / 原文不一致・unresolved・途中anchor拒否、書込なし',()=>use(f=>{
 const snapshot=()=>JSON.stringify(f.db.prepare('SELECT * FROM highlights').all());
 f.db.exec('DROP TRIGGER highlight_anchor_immutable; DROP TRIGGER highlight_update_validate');
 f.db.prepare('UPDATE highlights SET source_text=? WHERE highlight_id=?').run('不一致',f.h.highlight_id);const old=snapshot();
 assert.throws(()=>f.build(),(e:unknown)=>e instanceof PreviewError&&e.code==='INVALID_ANCHOR');assert.equal(snapshot(),old);
 f.db.prepare("UPDATE highlights SET source_text=?,status='unresolved',reason='test' WHERE highlight_id=?").run(f.h.source_text,f.h.highlight_id);assert.throws(()=>f.build());
 f.db.prepare("UPDATE highlights SET status='resolved',reason=NULL,start_offset=3,end_offset=4,source_text=? WHERE highlight_id=?").run(f.retrieval.getTurn('a').content.slice(3,4),f.h.highlight_id);assert.throws(()=>f.build(),/grapheme/);
},'😀é引用👩‍👩‍👧‍👦'.repeat(100),4,6));
test('S5 grapheme境界に内側丸め・原文連結保持',()=>use(f=>{
 const s=f.build({local_budget:300,local_ratio:'7:3'}).sections[0];assert(s.source==='local');
 const content=f.retrieval.getTurn('a').content,b=new Set([...new Intl.Segmenter('ja',{granularity:'grapheme'}).segment(content)].map(x=>x.index));b.add(content.length);
 assert(b.has(s.start_offset));assert(b.has(s.end_offset));assert.equal(s.before+s.highlight+s.after,content.slice(s.start_offset,s.end_offset));
},'👩‍👩‍👧‍👦'.repeat(100)+'引用'+'é'.repeat(200),1100,1102));
test('S5 B 0/1/3、欠番・未完了除外・会話非混入・順序・anchor一回',()=>use(f=>{
 for(const before of [0,1,3])for(const after of [0,1,3]){const r=f.build({strategy:'A+B',before_turns:before,after_turns:after});assert.equal(r.sections.length,before+1+after);assert.equal(r.sections.filter(s=>s.turn_id==='a').length,1);assert(r.sections.every(s=>!['g','f','c','other'].includes(s.turn_id)));assert.deepEqual(r.sections.map(s=>s.sequence_no),[...r.sections.map(s=>s.sequence_no)].sort((a,b)=>a-b));assert.equal(r.sections[before].source,'local');}
 assert.deepEqual(f.build({strategy:'A+B'}).sections.map(s=>s.role),['assistant','assistant','user']);
}));
test('S5 boundary / deterministic / total length',()=>use(f=>{
 const h=f.repo.createHighlight(f.c.conversation_id,{turn_id:'p0',start_offset:0,end_offset:2,source_text:'最初',target_text:'最初',color:'blue',note:''});
 const p={strategy:'A+B',before_turns:3,after_turns:3};const r=f.service.build(f.c.conversation_id,h.highlight_id,p);assert.equal(r.before_returned,0);assert.equal(r.after_returned,3);
 assert.deepEqual(r,f.service.build(f.c.conversation_id,h.highlight_id,p));assert.equal(r.total_utf16,r.request_preview.length);
 const h2=f.repo.createHighlight(f.c.conversation_id,{turn_id:'n2',start_offset:0,end_offset:4,source_text:'次の回答',target_text:'次の回答',color:'blue',note:''});assert.equal(f.service.build(f.c.conversation_id,h2.highlight_id,p).after_returned,1);
 f.db.prepare('INSERT INTO turns VALUES(?,?,?,?,?,?,?,?)').run('last',f.c.conversation_id,30,'assistant','末尾','completed','2026','2026');
 const last=f.repo.createHighlight(f.c.conversation_id,{turn_id:'last',start_offset:0,end_offset:2,source_text:'末尾',target_text:'末尾',color:'blue',note:''});assert.equal(f.service.build(f.c.conversation_id,last.highlight_id,p).after_returned,0);
}));
test('S5 total上限拒否・Temporal全文保持・silent truncationなし',()=>use(f=>{
 const now='2026';f.db.prepare('INSERT INTO turns VALUES(?,?,?,?,?,?,?,?)').run('long',f.c.conversation_id,6,'user','長'.repeat(20000),'completed',now,now);
 assert.throws(()=>f.build({strategy:'A+B'}),(e:unknown)=>e instanceof PreviewError&&e.code==='PREVIEW_TOO_LARGE');assert.equal(f.build().strategy,'A');
 const r=f.build({strategy:'A+B',before_turns:0});assert.equal(r.sections[1].source,'temporal_after');assert('content' in r.sections[1]&&r.sections[1].content==='次の質問');
}));
test('S5 read-only全table / 引用検証失敗・不正条件・会話外',()=>use(f=>{
 const tables=f.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as {name:string}[];
 const snap=()=>tables.map(t=>f.db.prepare(`SELECT * FROM ${t.name} ORDER BY rowid`).all());const old=snap();
 f.build();f.build({strategy:'A+B'});
 for(const p of [{before_turns:-1},{after_turns:4},{before_turns:1.5},{local_budget:0},{strategy:'C'},{local_ratio:'8:2'},{extra:1}])assert.throws(()=>f.build(p));
 assert.throws(()=>f.service.build(f.other.conversation_id,f.h.highlight_id));assert.deepEqual(snap(),old);
}));
test('S5 HTTP Preview / structured limit error / read-only',()=>use(async f=>{
 const server=createAppServer(f.repo,'dist',undefined,undefined,f.retrieval,f.service);server.listen(0,'127.0.0.1');await once(server,'listening');
 try{const url=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/conversations/${f.c.conversation_id}/highlights/${f.h.highlight_id}/context-preview`;
 const request=(p:unknown)=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});
 const r=await request({strategy:'A+B'});assert.equal(r.status,200);assert.equal((await r.json()).sections.length,3);
 const bad=await request({before_turns:5});assert.equal(bad.status,400);assert.equal((await bad.json()).error.code,'INVALID_PARAMETERS');
 f.db.prepare('INSERT INTO turns VALUES(?,?,?,?,?,?,?,?)').run('oversize',f.c.conversation_id,6,'user','長'.repeat(20000),'completed','2026','2026');
 const oversized=await request({strategy:'A+B'});assert.equal(oversized.status,413);assert.equal((await oversized.json()).error.code,'PREVIEW_TOO_LARGE');
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}));
