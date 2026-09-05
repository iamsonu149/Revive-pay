import {authenticate,sameOrigin} from './auth';
import {RecoveryError} from '../domain/recovery/policy';
export async function merchantRequest(request:Request,run:(actor:string)=>Promise<unknown>) {
 const actor=await authenticate(request.headers);
 if(!actor) return Response.json({error:'Merchant authentication required'},{status:401,headers:{'WWW-Authenticate':'Basic realm="Revive Pay", charset="UTF-8"','Cache-Control':'no-store'}});
 if(!['GET','HEAD'].includes(request.method) && !sameOrigin(request)) return Response.json({error:'Cross-origin action denied'},{status:403});
 try {return Response.json(await run(actor),{headers:{'Cache-Control':'no-store'}});}
 catch(error) {
   if(error instanceof RecoveryError) return Response.json({error:error.message},{status:error.status});
   if(error instanceof SyntaxError) return Response.json({error:'Invalid JSON body'},{status:422});
   console.error('Merchant operation failed',error);
   return Response.json({error:'Operation could not be confirmed. Refresh the case and reconcile any existing execution.'},{status:500});
 }
}
