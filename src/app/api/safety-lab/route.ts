import {merchantRequest} from '@/lib/api';
import {SafetyLabService,safetyScenarios,type SafetyScenario} from '@/domain/recovery/safety-lab-service';
import {RecoveryError} from '@/domain/recovery/policy';
export function GET(request:Request){return merchantRequest(request,()=>new SafetyLabService().list());}
export function POST(request:Request){return merchantRequest(request,async actor=>{const raw=await request.text();if(raw.length>2048)throw new RecoveryError('Request too large',413);let body:{scenario?:string};try{body=JSON.parse(raw);}catch{throw new RecoveryError('Invalid JSON',400);}if(!safetyScenarios.includes(body.scenario as SafetyScenario))throw new RecoveryError('Unknown safety scenario',400);return new SafetyLabService().run(body.scenario as SafetyScenario,actor);});}
