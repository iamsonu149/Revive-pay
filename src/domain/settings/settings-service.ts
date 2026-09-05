import {PrismaClient,Setting} from '@prisma/client';
import {db} from '../../lib/db';
import {allowedActions,approvalRequired,hardStop,mandatoryNeverRetry,recoveryActions} from '../recovery/policy';
import {RecoveryError} from '../recovery/policy';
import {scoreRecovery} from '../recovery/recovery-scorer';

const numericLimits={
 autoRecoveryLimit:[0,10000],maxContacts:[0,2],maxRetries:[0,1],minRecoveryScore:[0,95],
 minPaymentAmount:[0,100000],approvalAmountThreshold:[0,10000],quietHoursStart:[0,23],quietHoursEnd:[0,23],retryDelayHours:[24,168],
} as const;
const knownReasons=['INSUFFICIENT_FUNDS','BANK_TECHNICAL','EXPIRED_CARD','EXPIRED_MANDATE','CUSTOMER_ABANDONMENT','CANCELLED_SUBSCRIPTION','SUSPECTED_CHARGEBACK','UNKNOWN_FAILURE','REFUND','CHARGEBACK'];

export type SettingsInput={
 autoRecoveryLimit?:number;maxContacts?:number;killSwitch?:boolean;maxRetries?:number;minRecoveryScore?:number;
 minPaymentAmount?:number;approvalAmountThreshold?:number;quietHoursStart?:number;quietHoursEnd?:number;
 retryDelayHours?:number;allowedRecoveryActions?:string[];neverRetryFailureReasons?:string[];
};

export function validateSettings(input:unknown) {
 if(!input || typeof input!=='object' || Array.isArray(input)) throw new RecoveryError('Settings must be an object',422);
 const body=input as Record<string,unknown>;
 const allowedKeys=[...Object.keys(numericLimits),'killSwitch','allowedRecoveryActions','neverRetryFailureReasons'];
 if(Object.keys(body).some(key=>!allowedKeys.includes(key))) throw new RecoveryError('Unknown setting',422);
 const data:Record<string,number|boolean|string>={};
 for(const [key,[min,max]] of Object.entries(numericLimits))if(key in body){
   const value=body[key];if(typeof value!=='number'||!Number.isInteger(value)||value<min||value>max)throw new RecoveryError(`${key} must be an integer between ${min} and ${max}`,422);data[key]=value;
 }
 if('killSwitch' in body){if(typeof body.killSwitch!=='boolean')throw new RecoveryError('killSwitch must be a boolean',422);data.killSwitch=body.killSwitch;}
 if('allowedRecoveryActions' in body){
   if(!Array.isArray(body.allowedRecoveryActions)||body.allowedRecoveryActions.length<1||body.allowedRecoveryActions.some(value=>typeof value!=='string'||!recoveryActions.includes(value as typeof recoveryActions[number])))throw new RecoveryError('Select at least one supported recovery action',422);
   data.allowedRecoveryActions=JSON.stringify([...new Set(body.allowedRecoveryActions)]);
 }
 if('neverRetryFailureReasons' in body){
   if(!Array.isArray(body.neverRetryFailureReasons)||body.neverRetryFailureReasons.some(value=>typeof value!=='string'||!knownReasons.includes(value)))throw new RecoveryError('Unknown never-retry failure reason',422);
   data.neverRetryFailureReasons=JSON.stringify([...new Set([...mandatoryNeverRetry,...body.neverRetryFailureReasons])]);
 }
 return data as SettingsInput & {allowedRecoveryActions?:never;neverRetryFailureReasons?:never} & Record<string,number|boolean|string>;
}

export function settingsView(row:Setting) {
 let neverRetryFailureReasons:string[];try{neverRetryFailureReasons=JSON.parse(row.neverRetryFailureReasons);}catch{neverRetryFailureReasons=[...mandatoryNeverRetry];}
 return {...row,allowedRecoveryActions:allowedActions(row),neverRetryFailureReasons};
}

export class SettingsService {
 constructor(private client:PrismaClient=db) {}
 get(){return this.client.setting.upsert({where:{id:'merchant'},update:{},create:{id:'merchant'}});}
 async update(input:unknown,actor:string) {
   const data=validateSettings(input);
   return this.client.$transaction(async tx=>{
     const before=await tx.setting.findUnique({where:{id:'merchant'}});
     const after=await tx.setting.upsert({where:{id:'merchant'},update:data,create:{id:'merchant',...data}});
     await tx.auditEvent.create({data:{eventType:'SETTINGS_UPDATED',actor,payload:JSON.stringify({before:before&&settingsView(before),after:settingsView(after)})}});
     return after;
   });
 }
 async impact(input:unknown={}) {
   const current=await this.get();const data=validateSettings(input);
   const candidate={...current,...data} as Setting;
   const now=new Date();
   const cases=await this.client.recoveryCase.findMany({where:{execution:null,status:{notIn:['RECOVERED','FAILED','REJECTED']}},include:{paymentAttempt:{include:{subscription:true,customer:{include:{contacts:{where:{createdAt:{gt:new Date(now.getTime()-7*86400000)}}}}}}}}});
   let automated=0,blocked=0,approval=0;
   for(const c of cases){
     const signals={...c.paymentAttempt,paymentStatus:c.paymentAttempt.status,subscriptionStatus:c.paymentAttempt.subscription.status,contactCountLast7Days:c.paymentAttempt.customer.contacts.length};
     const decision=scoreRecovery(signals,now,candidate);
     if(candidate.killSwitch||hardStop(signals,candidate)||decision.recommendation==='STOP'){blocked++;continue;}
     if(approvalRequired(signals.amount,candidate)||c.requiresHumanApproval||decision.recommendation==='NEEDS_REVIEW'){approval++;continue;}
     automated++;
   }
   return {total:cases.length,automated,blocked,approval,calculatedAt:now.toISOString()};
 }
}
