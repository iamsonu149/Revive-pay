import {Metrics} from './baseline-strategies';
export const strategies=['Naive Retry All','Fixed Rule Strategy','Revive Pay Decision Engine'] as const;
export type Strategy=typeof strategies[number];
export type SimulationRow={id?:string;amount:number;recommendedAction:string;predictedRecoveryProbability:number;status:string;unsafeRetry?:boolean};
function draw(key:string) {let hash=2166136261;for(const ch of key){hash=Math.imul(hash^ch.charCodeAt(0),16777619);}return (hash>>>0)%100;}
export function simulate(rows:SimulationRow[],strategy:Strategy):Metrics {
 let retry=0,msg=0,count=0,money=0,bad=0;
 for(const x of rows) {
   const action=strategy==='Naive Retry All'?'RETRY_LATER':strategy==='Fixed Rule Strategy'?(x.amount<=10000?'RETRY_LATER':'STOP'):x.recommendedAction;
   if(action==='RETRY_LATER')retry++;
   if(action==='SEND_PAYMENT_UPDATE_LINK')msg++;
   if(strategy==='Revive Pay Decision Engine'&&x.unsafeRetry&&action!=='RETRY_LATER')bad++;
   // All strategies use the same draw and probability. Review/stop cannot recover money.
   const canRecover=(action==='RETRY_LATER'&&!x.unsafeRetry)||action==='SEND_PAYMENT_UPDATE_LINK';
   if(canRecover && draw(x.id??`${x.amount}:${x.predictedRecoveryProbability}`)<x.predictedRecoveryProbability) {count++;money+=x.amount;}
 }
 return {strategyName:strategy,totalPayments:rows.length,failuresDetected:rows.length,recoveredCount:count,recoveredAmount:money,retryAttempts:retry,messagesSent:msg,avoidedBadRetries:bad,customerAnnoyanceScore:Math.min(10,Math.max(0,Math.round((retry*1.3+msg*.7)/(rows.length||1)*10)))};
}
