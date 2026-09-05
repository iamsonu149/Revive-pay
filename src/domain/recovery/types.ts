export type Action='RETRY_LATER'|'SEND_PAYMENT_UPDATE_LINK'|'NEEDS_REVIEW'|'STOP'; export type Confidence='LOW'|'MEDIUM'|'HIGH';
export type AttemptSignals={failureReason:string;amount:number;retryCount:number;bankHealthScore:number;recentSuccessfulPayments:number;paymentMethodAgeDays:number;customerEngagementScore:number;contactCountLast7Days:number;attemptedAt:Date;paymentStatus?:string;subscriptionStatus?:string};
export type Decision={probability:number;recommendation:Action;confidence:Confidence;evidence:string[];requiresHumanApproval:boolean;reasonSummary:string};
