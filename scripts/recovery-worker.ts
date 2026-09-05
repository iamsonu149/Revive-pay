import {RecoveryService} from '../src/domain/recovery/recovery-service';
import {db} from '../src/lib/db';
let stopping=false;
process.on('SIGINT',()=>{stopping=true;});
process.on('SIGTERM',()=>{stopping=true;});
async function main() {
 const service=new RecoveryService();
 do {
   const results=await service.runDue('SCHEDULER');
   console.log(JSON.stringify({at:new Date().toISOString(),results}));
   if(process.argv.includes('--once')||stopping)break;
   for(let i=0;i<30&&!stopping;i++)await new Promise(resolve=>setTimeout(resolve,1000));
 }while(!stopping);
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.$disconnect());
