import {afterEach,expect,it,vi} from 'vitest';
import {authenticate,sameOrigin} from '../lib/auth';
import {merchantRequest} from '../lib/api';
import {validateSettings} from '../domain/settings/settings-service';
afterEach(()=>vi.unstubAllEnvs());
it('fails closed when credentials are absent, invalid, or weak',async()=>{
 const headers=new Headers({authorization:`Basic ${btoa('merchant:long-test-password')}`});
 expect(await authenticate(headers,{})).toBeNull();expect(await authenticate(headers,{user:'merchant',password:'short'})).toBeNull();
 expect(await authenticate(headers,{user:'merchant',password:'different-password'})).toBeNull();
 expect(await authenticate(headers,{user:'merchant',password:'long-test-password'})).toBe('merchant');
});
it('checks authentication inside the API handler independently of middleware',async()=>{
 vi.stubEnv('MERCHANT_USER','merchant');vi.stubEnv('MERCHANT_PASSWORD','long-test-password');const run=vi.fn();
 const response=await merchantRequest(new Request('http://localhost/api/settings',{method:'PATCH',headers:{'x-middleware-subrequest':'middleware:middleware:middleware:middleware:middleware'}}),run);
 expect(response.status).toBe(401);expect(run).not.toHaveBeenCalled();
});
it('rejects cross-origin mutation even with valid merchant credentials',async()=>{
 vi.stubEnv('MERCHANT_USER','merchant');vi.stubEnv('MERCHANT_PASSWORD','long-test-password');const run=vi.fn();
 const response=await merchantRequest(new Request('http://localhost/api/settings',{method:'PATCH',headers:{authorization:`Basic ${btoa('merchant:long-test-password')}`,origin:'https://attacker.example'}}),run);
 expect(response.status).toBe(403);expect(run).not.toHaveBeenCalled();expect(sameOrigin(new Request('http://localhost',{headers:{origin:'null'}}))).toBe(false);
});
it('accepts the actual browser host when Next normalizes its internal URL',()=>{
 expect(sameOrigin(new Request('http://localhost:3000/api/settings',{headers:{host:'127.0.0.1:3000',origin:'http://127.0.0.1:3000'}}))).toBe(true);
 expect(sameOrigin(new Request('http://localhost:3000/api/settings',{headers:{host:'127.0.0.1:3000',origin:'https://attacker.example'}}))).toBe(false);
});
it.each([{autoRecoveryLimit:10001},{autoRecoveryLimit:-1},{maxContacts:3},{maxContacts:1.5},{killSwitch:'false'},{autoRecoveryLimit:'5000'},{unknown:true},null])('rejects invalid or weakened settings %j',value=>{
 expect(()=>validateSettings(value)).toThrow();
});
it.each([{maxRetries:2},{minRecoveryScore:101},{approvalAmountThreshold:10001},{retryDelayHours:23},{quietHoursStart:24},{allowedRecoveryActions:[]},{allowedRecoveryActions:['DELETE_PAYMENT']},{neverRetryFailureReasons:['UNKNOWN']}])('rejects unsafe merchant policy %j',value=>expect(()=>validateSettings(value)).toThrow());
