import {afterEach,expect,it,vi} from 'vitest';
import {createPaymentProvider,paymentProviderInfo} from '../integrations/razorpay/provider';
import {MockRazorpayAdapter} from '../integrations/razorpay/mock-razorpay-adapter';
import {RazorpayTestAdapter} from '../integrations/razorpay/razorpay-test-adapter';
import {verifyRazorpayWebhook} from '../integrations/razorpay/webhook';
import {createHmac} from 'node:crypto';

afterEach(()=>vi.unstubAllEnvs());

it('validates the exact raw webhook body with HMAC SHA-256',()=>{
 const raw='{"event":"payment.failed","payload":{"amount":100}}',secret='webhook-test-secret';
 const signature=createHmac('sha256',secret).update(raw).digest('hex');
 expect(verifyRazorpayWebhook(raw,signature,secret)).toBe(true);
 expect(verifyRazorpayWebhook(`${raw} `,signature,secret)).toBe(false);
 expect(verifyRazorpayWebhook(raw,'not-hex',secret)).toBe(false);
});

it('uses mock by default and falls back safely when test credentials are absent',()=>{
 vi.stubEnv('PAYMENT_PROVIDER','mock');
 expect(createPaymentProvider()).toBeInstanceOf(MockRazorpayAdapter);
 expect(paymentProviderInfo()).toMatchObject({requestedMode:'mock',activeMode:'mock',configured:true});
 vi.stubEnv('PAYMENT_PROVIDER','razorpay_test');vi.stubEnv('RAZORPAY_KEY_ID','');vi.stubEnv('RAZORPAY_KEY_SECRET','');
 expect(createPaymentProvider()).toBeInstanceOf(MockRazorpayAdapter);
 expect(paymentProviderInfo()).toMatchObject({activeMode:'mock',configured:false,fallbackReason:'MISSING_TEST_CREDENTIALS'});
});

it('enables only Razorpay test keys and rejects live-key activation',()=>{
 vi.stubEnv('PAYMENT_PROVIDER','razorpay_test');vi.stubEnv('RAZORPAY_KEY_ID','rzp_live_forbidden');vi.stubEnv('RAZORPAY_KEY_SECRET','secret');
 expect(createPaymentProvider()).toBeInstanceOf(MockRazorpayAdapter);
 expect(paymentProviderInfo().fallbackReason).toBe('LIVE_KEYS_REJECTED');
 vi.stubEnv('RAZORPAY_KEY_ID','rzp_test_example');
 expect(createPaymentProvider()).toBeInstanceOf(RazorpayTestAdapter);
 expect(paymentProviderInfo()).toMatchObject({activeMode:'razorpay_test',configured:true,fallbackReason:null});
});
