import {PrismaClient} from '@prisma/client';
import {db} from '../../lib/db';
import {MockRazorpayAdapter} from './mock-razorpay-adapter';
import {ProviderMode, RazorpayAdapter} from './razorpay-adapter';
import {RazorpayTestAdapter} from './razorpay-test-adapter';

export type ProviderInfo={
 requestedMode:ProviderMode;
 activeMode:ProviderMode;
 displayName:string;
 configured:boolean;
 fallbackReason:null|'MISSING_TEST_CREDENTIALS'|'LIVE_KEYS_REJECTED';
 capabilities:{retry:boolean;paymentLinks:boolean};
};

function requestedMode(value=process.env.PAYMENT_PROVIDER):ProviderMode {
 return value==='razorpay_test'?'razorpay_test':'mock';
}

export function paymentProviderInfo():ProviderInfo {
 const requested=requestedMode();
 const keyId=process.env.RAZORPAY_KEY_ID??'';
 const keySecret=process.env.RAZORPAY_KEY_SECRET??'';
 if(requested==='razorpay_test'&&keyId.startsWith('rzp_test_')&&keySecret) {
   return {requestedMode:requested,activeMode:'razorpay_test',displayName:'Razorpay Test Mode',configured:true,fallbackReason:null,capabilities:{retry:false,paymentLinks:true}};
 }
 const fallbackReason=requested==='razorpay_test'?(keyId&&!keyId.startsWith('rzp_test_')?'LIVE_KEYS_REJECTED':'MISSING_TEST_CREDENTIALS'):null;
 return {requestedMode:requested,activeMode:'mock',displayName:'Mock Razorpay',configured:requested==='mock',fallbackReason,capabilities:{retry:true,paymentLinks:true}};
}

export function createPaymentProvider(client:PrismaClient=db):RazorpayAdapter {
 const info=paymentProviderInfo();
 if(info.activeMode==='razorpay_test') return new RazorpayTestAdapter(client,{keyId:process.env.RAZORPAY_KEY_ID!,keySecret:process.env.RAZORPAY_KEY_SECRET!});
 return new MockRazorpayAdapter(client);
}
