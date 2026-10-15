import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { CollectionStore } from '../src/server/collections.ts';
import { writeFileAtomically } from '../src/server/atomic-file.ts';
import { emptyCollections, groupConversations } from '../src/shared/collections.ts';
import { openDatabase } from '../src/server/storage/database.ts';
import { Repository } from '../src/server/storage/repository.ts';
import { createAppServer } from '../src/server/http.ts';

async function fixture(work: (path: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'attchat-collections-'));
  try { await work(join(dir, 'collections.json')); } finally { await rm(dir, {recursive:true,force:true}); }
}
test('Collection lifecycle, single membership, stale unassign and reload', () => fixture(async path => {
  const store = new CollectionStore(path, () => ['conversation']);
  assert.deepEqual(await store.load(), {data:emptyCollections(),warnings:[],writable:true});
  await Promise.all([store.create(' A '), store.create('B')]);
  const [a,b] = store.get().data.collections;
  assert.match(a.id, /^[0-9a-f-]{36}$/); assert.equal(a.name,'A');
  await store.rename(a.id,' Renamed '); await store.assign(a.id,'conversation'); await store.assign(b.id,'conversation');
  await store.unassign(a.id,'conversation'); assert.equal(store.get().data.membership.conversation,b.id);
  await store.unassign(b.id,'conversation'); assert.deepEqual(store.get().data.membership,{});
  await store.assign(a.id,'conversation'); await store.deleteCollection(a.id);
  assert.deepEqual(store.get().data.membership,{});
  assert.deepEqual(await new CollectionStore(path,()=>['conversation']).load(),store.get());
  const copy=store.get();copy.data.collections[0].name='mutation';assert.equal(store.get().data.collections[0].name,'B');
  for (const operation of [() => store.create(' '), () => store.create('B'), () => store.rename('unknown','X'), () => store.assign('unknown','conversation'), () => store.assign(b.id,'unknown'), () => store.unassign('unknown','conversation'), () => store.deleteCollection('unknown')]) await assert.rejects(operation());
}));
test('corrupt, unknown version and malformed schema preserve file and block every mutation', () => fixture(async path => {
  for (const raw of ['{', JSON.stringify({...emptyCollections(),version:2}), JSON.stringify({...emptyCollections(),membership:[]}), JSON.stringify({...emptyCollections(),collections:[{id:'a',name:'A'},{id:'a',name:'B'}]})]) {
    await writeFile(path,raw);const store=new CollectionStore(path,()=>[]);const result=await store.load();
    assert.equal(result.writable,false);assert.ok(result.warnings.length);assert.deepEqual(result.data,emptyCollections());
    for(const operation of [()=>store.create('A'),()=>store.rename('a','B'),()=>store.assign('a','c'),()=>store.unassign('a','c'),()=>store.deleteCollection('a')])await assert.rejects(operation());
    assert.equal(await readFile(path,'utf8'),raw);
  }
}));
test('orphan memberships are hidden but preserved through load and unrelated writes or DB switching', () => fixture(async path => {
  const raw={version:1,collections:[{id:'a',name:'A'}],membership:{live:'a',missing:'a',other:'absent'}};
  await writeFile(path,JSON.stringify(raw));let ids=['live','other'];const store=new CollectionStore(path,()=>ids);
  const result=await store.load();assert.deepEqual(result.data.membership,{live:'a'});assert.ok(result.warnings.length);
  assert.deepEqual(JSON.parse(await readFile(path,'utf8')),raw);
  ids=[];assert.deepEqual(store.get().data.membership,{});await store.rename('a','Renamed');
  assert.deepEqual(JSON.parse(await readFile(path,'utf8')).membership,raw.membership);
  ids=['live','missing'];assert.deepEqual(store.get().data.membership,{live:'a',missing:'a'});
}));
test('atomic replace failure keeps original file/memory and removes temporary file; queue recovers', () => fixture(async path => {
  let fail=false;
  const store=new CollectionStore(path,()=>[],(path,data)=>writeFileAtomically(path,data,fail?async()=>{throw new Error('replace failed');}:undefined));
  await store.load();await store.create('A');const before=await readFile(path,'utf8'), snapshot=store.get();fail=true;
  await assert.rejects(store.create('B'),/replace failed/);assert.deepEqual(store.get(),snapshot);assert.equal(await readFile(path,'utf8'),before);
  assert.deepEqual(await readdir(join(path,'..')),['collections.json']);fail=false;await store.create('C');assert.equal(store.get().data.collections.length,2);
}));
test('Collection HTTP safety and lifecycle preserve Conversation, Turn, updated_at and schema', () => fixture(async path => {
  const db=openDatabase(':memory:'),repo=new Repository(db);const conversation=repo.createConversation('Original');
  const store=new CollectionStore(path,()=>repo.listConversations().map(c=>c.conversation_id));await store.load();
  const server=createAppServer(repo,resolve('dist'),undefined,undefined,undefined,undefined,undefined,undefined,undefined,store);
  server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const request=(path:string,method='GET',data?:unknown,headers:Record<string,string>={})=>fetch(base+path,{method,headers:{...(data===undefined?{}:{'Content-Type':'application/json'}),...headers},body:data===undefined?undefined:JSON.stringify(data)});
  try {
    await request(`/api/conversations/${conversation.conversation_id}/turns`,'POST',{content:'keep this Turn'});
    const before=repo.detail(conversation.conversation_id),schema=db.prepare('SELECT sql FROM sqlite_master ORDER BY name').all();
    const created=await request('/api/collections','POST',{name:'A'});assert.equal(created.status,201);const a=(await created.json()).data.collections[0].id;
    const b=(await(await request('/api/collections','POST',{name:'B'})).json()).data.collections[1].id;
    assert.equal((await request(`/api/collections/${a}`,'PATCH',{name:'Renamed'})).status,200);
    for(const id of [a,b])assert.equal((await request(`/api/collections/${id}/conversations/${conversation.conversation_id}`,'PUT',{})).status,200);
    assert.equal((await request(`/api/collections/${b}/conversations/${conversation.conversation_id}`,'DELETE',{})).status,200);
    await request(`/api/collections/${a}/conversations/${conversation.conversation_id}`,'PUT',{});
    const collectionFile=await readFile(path,'utf8');
    await request(`/api/conversations/${conversation.conversation_id}`,'PATCH',{title:'New title'});
    assert.equal(await readFile(path,'utf8'),collectionFile,'Conversation rename never writes collections');
    assert.equal(groupConversations(repo.listConversations(),store.get().data).groups.get(a)![0].title,'New title');
    const renamed=repo.detail(conversation.conversation_id);
    await request(`/api/collections/${a}`,'DELETE',{});
    assert.deepEqual(repo.detail(conversation.conversation_id),renamed);assert.deepEqual(renamed.turns,before.turns);
    assert.deepEqual(db.prepare('SELECT sql FROM sqlite_master ORDER BY name').all(),schema);
    assert.equal((await request(`/api/collections/${b}/conversations/unknown`,'PUT',{})).status,404);
    assert.equal((await request(`/api/collections/unknown/conversations/${conversation.conversation_id}`,'PUT',{})).status,404);
    assert.equal((await request('/api/collections','POST',{name:'X',unexpected:true})).status,400);
    assert.equal((await request('/api/collections','POST')).status,415);
    assert.equal((await request('/api/collections','GET',undefined,{Origin:'https://foreign.example'})).status,403);
    const badHost = await new Promise<number | undefined>((resolve, reject) => { const req=httpRequest(base+'/api/collections',{headers:{Host:'foreign.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end(); });
    assert.equal(badHost,403);
    const timestamp=repo.getConversation(conversation.conversation_id).updated_at;
    await request(`/api/collections/${b}/conversations/${conversation.conversation_id}`,'PUT',{});
    assert.equal(repo.getConversation(conversation.conversation_id).updated_at,timestamp);
  } finally { server.close();server.closeAllConnections();await once(server,'close');db.close(); }
}));
test('100/1000 Conversations partition once without dropping, duplicating or mutating the full list', t => {
  for(const count of [100,1000]) {
    const conversations=Array.from({length:count},(_,i)=>({conversation_id:String(i),title:`Conversation ${i}`,created_at:'2026',updated_at:'2026'}));
    const data={version:1 as const,collections:[{id:'a',name:'A'}],membership:Object.fromEntries(conversations.filter((_,i)=>i%2===0).map(c=>[c.conversation_id,'a']))};
    const started=performance.now();const groups=groupConversations(conversations,data);const elapsed=performance.now()-started;
    assert.equal(groups.unclassified.length,count/2);assert.equal(groups.groups.get('a')!.length,count/2);assert.equal(conversations.length,count);
    t.diagnostic(`${count} Conversations: ${elapsed.toFixed(3)} ms (classification only)`);
  }
});
