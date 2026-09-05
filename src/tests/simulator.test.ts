import {it,expect} from 'vitest';
import {simulate,strategies} from '../domain/simulation/simulator';
const base={id:'case-1',amount:1000,recommendedAction:'RETRY_LATER',predictedRecoveryProbability:80,status:'PENDING_APPROVAL'};
it('is deterministic and independent of row ordering',()=>{
 const rows=[base,{...base,id:'case-2',amount:2000}];
 expect(simulate(rows,'Revive Pay Decision Engine')).toEqual(simulate([...rows].reverse(),'Revive Pay Decision Engine'));
});
it.each(['NEEDS_REVIEW','STOP'])('does not recover money from %s',recommendedAction=>{
 const result=simulate([{...base,recommendedAction,predictedRecoveryProbability:100}],'Revive Pay Decision Engine');
 expect(result.recoveredAmount).toBe(0);expect(result.retryAttempts).toBe(0);expect(result.messagesSent).toBe(0);
});
it('uses the same recovery outcome across strategies for the same action',()=>{
 const results=strategies.map(s=>simulate([base],s).recoveredAmount);expect(new Set(results).size).toBe(1);
});
it('counts unsafe retries avoided and bounds the contact pressure index',()=>{
 const rows=[{...base,recommendedAction:'STOP',unsafeRetry:true}];
 expect(simulate(rows,'Revive Pay Decision Engine').avoidedBadRetries).toBe(1);
 expect(simulate(rows,'Naive Retry All').recoveredAmount).toBe(0);
 expect(simulate(rows,'Naive Retry All').customerAnnoyanceScore).toBeLessThanOrEqual(10);
 expect(simulate([],'Revive Pay Decision Engine').customerAnnoyanceScore).toBe(0);
});
