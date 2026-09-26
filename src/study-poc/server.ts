import { createServer,type IncomingMessage } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname,resolve,sep } from 'node:path';
import { StudyCoordinator } from './coordinator.ts';
import type { StudyProvider } from './contracts.ts';
import { problems } from './problems.ts';
import { StudyError } from './validation.ts';
async function body(req:IncomingMessage,keys:string[]){
 if(!req.headers['content-type']?.startsWith('application/json'))throw new StudyError('JSON_REQUIRED',415);
 let data='',size=0;for await(const part of req){size+=part.length;if(size>16000)throw new StudyError('REQUEST_TOO_LARGE',413);data+=part;}
 let v:unknown;try{v=JSON.parse(data);}catch{throw new StudyError('INVALID_JSON');}
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))throw new StudyError('INVALID_INPUT');return v as Record<string,unknown>;
}
export function createStudyServer(provider:StudyProvider,coordinator=new StudyCoordinator(provider),options:{debug?:boolean;distPath?:string}={}){
 const server=createServer(async(req,res)=>{
  const send=(status:number,value:unknown)=>{if(res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  try{
   const port=(server.address() as {port:number}).port,hosts=[`127.0.0.1:${port}`,`localhost:${port}`];
   if(!hosts.includes(req.headers.host??'')||req.headers.origin&&!hosts.map(h=>'http://'+h).includes(req.headers.origin))throw new StudyError('ORIGIN_REJECTED',403);
   const path=new URL(req.url!,'http://localhost').pathname;
   if(path==='/api/problems'&&req.method==='GET')return send(200,problems.map(p=>({id:p.id,public_title:p.public_title,public_question:p.public_question})));
   if(path==='/api/models'&&req.method==='GET')return send(200,{models:await provider.models()});
   if(path==='/api/sessions'&&req.method==='POST'){await body(req,[]);return send(201,coordinator.create());}
   const match=path.match(/^\/api\/sessions\/([a-zA-Z0-9-]+)(?:\/(start|stop|pause|restart|debug))?$/);
   if(match){const [,id,action]=match;
    if(!action&&req.method==='GET')return send(200,coordinator.public(id));
    if(action==='debug'&&req.method==='GET'){if(!options.debug)throw new StudyError('DEBUG_DISABLED',404);return send(200,coordinator.details(id));}
    if(req.method==='POST'){
     const input=await body(req,action==='start'?['problem_id','model']:[]);
     if(action==='start'){
      if(typeof input.problem_id!=='string'||typeof input.model!=='string')throw new StudyError('INVALID_INPUT');
      // start reserves synchronously; response remains buffered until terminal state.
      const stop=()=>{if(!res.writableEnded)try{coordinator.stop(id);}catch{ /* session already reset */ }};res.once('close',stop);
      try{return send(200,await coordinator.start(id,input.problem_id,input.model));}finally{res.off('close',stop);}
     }
     if(action==='stop'||action==='pause')return send(200,coordinator.stop(id));
     if(action==='restart')return send(200,coordinator.restart(id));
    }
   }
   if(path.startsWith('/api/')||req.method!=='GET')throw new StudyError('NOT_FOUND',404);
   if((path==='/debug'||path==='/study-debug.html')&&!options.debug)throw new StudyError('DEBUG_DISABLED',404);
   const root=resolve(options.distPath??'.cache/study-poc-dist'),file=resolve(root,path==='/'?'study-poc.html':path==='/debug'?'study-debug.html':'.'+path);
   if(!file.startsWith(root+sep))throw new StudyError('NOT_FOUND',404);
   let content:Buffer;try{content=await readFile(file);}catch{throw new StudyError('NOT_FOUND',404);}
   res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'} as Record<string,string>)[extname(file)]??'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(content);
  }catch(error){send(error instanceof StudyError?error.status:502,{error:{code:error instanceof StudyError?error.code:'PROVIDER_ERROR'}});}
 });return server;
}
