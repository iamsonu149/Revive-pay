import {SettingsService} from '@/domain/settings/settings-service';
import {merchantRequest} from '@/lib/api';
export const dynamic='force-dynamic';
export function GET(request:Request) {return merchantRequest(request,()=>new SettingsService().get());}
export function PATCH(request:Request) {return merchantRequest(request,async actor=>new SettingsService().update(await request.json(),actor));}
