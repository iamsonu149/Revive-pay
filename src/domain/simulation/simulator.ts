import {Metrics} from './baseline-strategies';
export const strategies=['Naive Retry All','Fixed Rule Strategy','Revive Pay Decision Engine'] as const;
export type Strategy=typeof strategies[number];
export type SimulationRow={id?:string;amount:number;recommendedAction:string;predictedRecoveryProbability:number;status:string;unsafeRetry?:boolean};
export type SimulationAssumptions={retryCost:number;contactCost:number;riskLoss:number;churnCost:number;seed:number};
export const defaultAssumptions:SimulationAssumptions={retryCost:3,contactCost:2,riskLoss:250,churnCost:120,seed:42};
export const deploymentSafetyConstraints={maximumUnsafeRetries:0,maximumCustomerPressure:3} as const;
function draw(key:string,seed:number){let hash=2166136261^seed;for(const ch of key)hash=Math.imul(hash^ch.charCodeAt(0),16777619);return (hash>>>0)%100;}
export function simulate(rows:SimulationRow[],strategy:Strategy,a:SimulationAssumptions=defaultAssumptions):Metrics{
 let retry=0,msg=0,count=0,money=0,badAvoided=0,unsafe=0,approval=0,protectedCount=0;
 for(const x of rows){const action=strategy==='Naive Retry All'?'RETRY_LATER':strategy==='Fixed Rule Strategy'?(x.amount<=10000?'RETRY_LATER':'NEEDS_REVIEW'):x.recommendedAction;if(action==='RETRY_LATER')retry++;if(action==='SEND_PAYMENT_UPDATE_LINK')msg++;if(action==='NEEDS_REVIEW')approval++;if(x.unsafeRetry&&action==='RETRY_LATER')unsafe++;if(x.unsafeRetry&&action!=='RETRY_LATER'){badAvoided++;protectedCount++;}const canRecover=(action==='RETRY_LATER'&&!x.unsafeRetry)||action==='SEND_PAYMENT_UPDATE_LINK';if(canRecover&&draw(x.id??`${x.amount}:${x.predictedRecoveryProbability}`,a.seed)<x.predictedRecoveryProbability){count++;money+=x.amount;}}
 const annoyance=Math.min(10,Math.max(0,Math.round((retry*1.3+msg*.7)/(rows.length||1)*10)));const retrySpend=Math.round(retry*a.retryCost),contactSpend=Math.round(msg*a.contactCost),risk=Math.round(unsafe*a.riskLoss),churn=Math.round((annoyance/10)*rows.length*a.churnCost);const net=money-retrySpend-contactSpend-risk-churn;
 return {strategyName:strategy,totalPayments:rows.length,failuresDetected:rows.length,recoveredCount:count,recoveredAmount:money,retryAttempts:retry,messagesSent:msg,avoidedBadRetries:badAvoided,customerAnnoyanceScore:annoyance,estimatedRetryCost:retrySpend,estimatedContactCost:contactSpend,expectedRiskLoss:risk,estimatedChurnImpact:churn,netRecoveredValue:net,recoveryPerRetry:retry?Math.round(money/retry):0,recoveryPerContact:msg?Math.round(money/msg):0,customersProtected:protectedCount,approvalWorkload:approval,unsafeRetriesAttempted:unsafe,replayId:`seed-${a.seed}`,seed:a.seed};
}
export function markPareto(rows:Metrics[]){return rows.map(row=>({...row,paretoEfficient:!rows.some(other=>other!==row&&other.netRecoveredValue>=row.netRecoveredValue&&other.customerAnnoyanceScore<=row.customerAnnoyanceScore&&(other.netRecoveredValue>row.netRecoveredValue||other.customerAnnoyanceScore<row.customerAnnoyanceScore))}));}
export function classifyDeployability(rows:Metrics[]){
 const classified=rows.map(row=>{const reasons:string[]=[];if(row.unsafeRetriesAttempted>deploymentSafetyConstraints.maximumUnsafeRetries)reasons.push(`${row.unsafeRetriesAttempted} unsafe retries exceeds the zero-unsafe-retry limit`);if(row.customerAnnoyanceScore>deploymentSafetyConstraints.maximumCustomerPressure)reasons.push(`Customer pressure ${row.customerAnnoyanceScore}/10 exceeds the 3/10 limit`);return {...row,deployable:reasons.length===0,safetyViolationReasons:reasons,bestDeployable:false};});
 const eligible=classified.filter(row=>row.deployable).sort((a,b)=>b.netRecoveredValue-a.netRecoveredValue||a.strategyName.localeCompare(b.strategyName));
 if(eligible[0])eligible[0].bestDeployable=true;
 return classified;
}
