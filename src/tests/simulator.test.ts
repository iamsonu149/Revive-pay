import {it,expect} from 'vitest';
import {classifyDeployability,markPareto,simulate,strategies} from '../domain/simulation/simulator';
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
it('deducts configurable safety costs and keeps seeded replay reproducible',()=>{
 const rows=[{...base,unsafeRetry:true,predictedRecoveryProbability:100}];
 const assumptions={retryCost:5,contactCost:2,riskLoss:300,churnCost:100,seed:7};
 const costly=simulate(rows,'Naive Retry All',assumptions);
 expect(costly.expectedRiskLoss).toBe(300);expect(costly.netRecoveredValue).toBeLessThan(costly.recoveredAmount);expect(costly.replayId).toBe('seed-7');
 expect(simulate(rows,'Naive Retry All',assumptions)).toEqual(costly);
});
it('marks dominated net-value and pressure choices off the Pareto frontier',()=>{
 const rows=strategies.map(s=>simulate([base],s));rows[0].netRecoveredValue=10;rows[0].customerAnnoyanceScore=8;rows[1].netRecoveredValue=20;rows[1].customerAnnoyanceScore=5;
 const marked=markPareto(rows);expect(marked[0].paretoEfficient).toBe(false);expect(marked[1].paretoEfficient).toBe(true);
});
it('requires zero unsafe retries and customer pressure of three or less for deployment',()=>{
 const safe=simulate([{...base,recommendedAction:'STOP'}],'Revive Pay Decision Engine');safe.customerAnnoyanceScore=3;safe.unsafeRetriesAttempted=0;
 const unsafe={...safe,strategyName:'Unsafe',unsafeRetriesAttempted:1};
 const highPressure={...safe,strategyName:'High pressure',customerAnnoyanceScore:4};
 const result=classifyDeployability([safe,unsafe,highPressure]);
 expect(result[0]).toMatchObject({deployable:true,safetyViolationReasons:[]});
 expect(result[1].deployable).toBe(false);expect(result[1].safetyViolationReasons?.[0]).toContain('unsafe retries');
 expect(result[2].deployable).toBe(false);expect(result[2].safetyViolationReasons?.[0]).toContain('pressure');
});
it('selects the highest-net-value deployable strategy and never selects a violating strategy',()=>{
 const baseMetric=simulate([{...base,recommendedAction:'STOP'}],'Revive Pay Decision Engine');
 const low={...baseMetric,strategyName:'Safe low',netRecoveredValue:100,unsafeRetriesAttempted:0,customerAnnoyanceScore:2};
 const high={...baseMetric,strategyName:'Safe high',netRecoveredValue:200,unsafeRetriesAttempted:0,customerAnnoyanceScore:3};
 const violating={...baseMetric,strategyName:'Unsafe high',netRecoveredValue:1000,unsafeRetriesAttempted:1,customerAnnoyanceScore:1};
 const result=classifyDeployability([low,high,violating]);
 expect(result.find(row=>row.bestDeployable)?.strategyName).toBe('Safe high');
 expect(result.find(row=>row.strategyName==='Unsafe high')).toMatchObject({deployable:false,bestDeployable:false});
});
