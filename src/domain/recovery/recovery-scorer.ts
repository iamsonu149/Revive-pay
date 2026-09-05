import {AttemptSignals,Decision} from './types';
import {allowedActions,approvalRequired,defaultPolicy,RecoveryPolicy} from './policy';
import {stoppingRule} from './stopping-rules';

export function scoreRecovery(s:AttemptSignals,now=new Date(),input:RecoveryPolicy=defaultPolicy):Decision{
 const policy={...defaultPolicy,...input};
 const stop=stoppingRule(s,policy),ev:string[]=[];const approval=approvalRequired(s.amount,policy);
 if(stop)return {probability:0,recommendation:'STOP',confidence:'HIGH',evidence:[stop],requiresHumanApproval:approval,reasonSummary:stop};
 let score=35;
 if(s.failureReason==='BANK_TECHNICAL'){score+=25;ev.push('Temporary bank technical failure');}
 if(['EXPIRED_CARD','EXPIRED_MANDATE'].includes(s.failureReason)){score=58;ev.push('Payment credential requires an update');}
 if(s.failureReason==='INSUFFICIENT_FUNDS'){score+=8;ev.push('Funds may be available later');}
 if(s.failureReason==='CUSTOMER_ABANDONMENT')score-=12;
 if(s.bankHealthScore>=75){score+=12;ev.push('Bank health is strong');}else if(s.bankHealthScore<40){score-=18;ev.push('Bank health is weak');}
 if(s.recentSuccessfulPayments>=3){score+=12;ev.push(`${s.recentSuccessfulPayments} successful prior payments`);}
 if(s.customerEngagementScore>=70){score+=7;ev.push('Customer is engaged');}
 if(s.paymentMethodAgeDays>700)score-=8;if(s.retryCount===1)score-=10;
 if((now.getTime()-s.attemptedAt.getTime())/36e5>72)score-=7;score=Math.max(5,Math.min(95,score));
 let recommendation:Decision['recommendation']=s.failureReason==='BANK_TECHNICAL'?'RETRY_LATER':['EXPIRED_CARD','EXPIRED_MANDATE'].includes(s.failureReason)?'SEND_PAYMENT_UPDATE_LINK':score>=62?'RETRY_LATER':score>=35?'NEEDS_REVIEW':'STOP';
 if(s.failureReason==='UNKNOWN_FAILURE'&&(s.bankHealthScore<55||s.recentSuccessfulPayments<2))recommendation='NEEDS_REVIEW';
 const minimumScore=policy.minRecoveryScore??0;if(score<minimumScore){recommendation='STOP';ev.push(`Score is below the merchant minimum (${minimumScore})`);}
 if(['RETRY_LATER','SEND_PAYMENT_UPDATE_LINK'].includes(recommendation)&&!allowedActions(policy).includes(recommendation)){recommendation='NEEDS_REVIEW';ev.push('Recommended action is disabled by merchant policy');}
 const confidence=score>=70?'HIGH':score>=45?'MEDIUM':'LOW';
 const summary=recommendation==='RETRY_LATER'?`Retry once at the scheduled time (at least ${policy.retryDelayHours} hours after the failed payment).`:recommendation==='SEND_PAYMENT_UPDATE_LINK'?'Send one secure payment-update link.':recommendation==='STOP'?'Stop outreach to protect the customer experience.':'Request human review before acting.';
 return {probability:score,recommendation,confidence,evidence:ev.length?ev:['Mixed recovery signals'],requiresHumanApproval:approval,reasonSummary:summary};
}
