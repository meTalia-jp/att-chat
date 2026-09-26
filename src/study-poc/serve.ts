import { LMStudioProvider } from '../server/provider.ts';
import { StudyCoordinator } from './coordinator.ts';
import { createStudyServer } from './server.ts';
const port=Number(process.env.STUDY_POC_PORT??5190);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid STUDY_POC_PORT');
const provider=new LMStudioProvider(),coordinator=new StudyCoordinator(provider),server=createStudyServer(provider,coordinator,{debug:process.env.STUDY_POC_DEBUG==='1'});
server.once('error',()=>{console.error('Study PoC server could not start');process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`Study P0 http://127.0.0.1:${port} (memory only)`));
const stop=()=>{coordinator.shutdown();server.closeAllConnections();server.close();};process.once('SIGINT',stop);process.once('SIGTERM',stop);
