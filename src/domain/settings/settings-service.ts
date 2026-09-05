import {PrismaClient} from '@prisma/client';
import {db} from '../../lib/db';
import {RecoveryError} from '../recovery/policy';
export function validateSettings(input:unknown) {
 if(!input || typeof input!=='object' || Array.isArray(input)) throw new RecoveryError('Settings must be an object',422);
 const b=input as Record<string,unknown>;
 if(Object.keys(b).some(k=>!['autoRecoveryLimit','maxContacts','killSwitch'].includes(k))) throw new RecoveryError('Unknown setting',422);
 const data:{autoRecoveryLimit?:number;maxContacts?:number;killSwitch?:boolean}={};
 for(const [key,max] of [['autoRecoveryLimit',10000],['maxContacts',2]] as const) {
   if(key in b) {
     if(typeof b[key]!=='number' || !Number.isInteger(b[key]) || b[key]<0 || b[key]>max) throw new RecoveryError(`${key} must be an integer between 0 and ${max}`,422);
     data[key]=b[key];
   }
 }
 if('killSwitch' in b) {if(typeof b.killSwitch!=='boolean') throw new RecoveryError('killSwitch must be a boolean',422);data.killSwitch=b.killSwitch;}
 return data;
}
export class SettingsService {
 constructor(private client:PrismaClient=db) {}
 get(){return this.client.setting.upsert({where:{id:'merchant'},update:{},create:{id:'merchant'}});}
 async update(input:unknown,actor:string) {
   const data=validateSettings(input);
   return this.client.$transaction(async tx=>{
     const before=await tx.setting.findUnique({where:{id:'merchant'}});
     const after=await tx.setting.upsert({where:{id:'merchant'},update:data,create:{id:'merchant',...data}});
     await tx.auditEvent.create({data:{eventType:'SETTINGS_UPDATED',actor,payload:JSON.stringify({before,after})}});
     return after;
   });
 }
}
