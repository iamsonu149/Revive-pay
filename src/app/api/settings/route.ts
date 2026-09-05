import {SettingsService,settingsView} from '@/domain/settings/settings-service';
import {merchantRequest} from '@/lib/api';
import {paymentProviderInfo} from '@/integrations/razorpay/provider';
export const dynamic='force-dynamic';
const status=()=>({provider:paymentProviderInfo(),webhookConfigured:!!process.env.RAZORPAY_WEBHOOK_SECRET,ai:{configured:!!process.env.GEMINI_API_KEY,model:process.env.GEMINI_MODEL??'gemini-3.8-flash',fallbackActive:!process.env.GEMINI_API_KEY}});
export function GET(request:Request) {return merchantRequest(request,async()=>({...settingsView(await new SettingsService().get()),...status()}));}
export function PATCH(request:Request) {return merchantRequest(request,async actor=>({...settingsView(await new SettingsService().update(await request.json(),actor)),...status()}));}
