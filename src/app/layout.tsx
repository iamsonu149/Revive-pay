import './globals.css';
import {headers} from 'next/headers';
import {authenticate} from '@/lib/auth';
import {AppSidebar} from '@/components/layout/app-sidebar';
import {Topbar} from '@/components/layout/topbar';
import {paymentProviderInfo} from '@/integrations/razorpay/provider';
export const dynamic='force-dynamic';
export const metadata={title:'Revive Pay',description:'Guardrailed revenue recovery operations'};
export default async function Layout({children}:{children:React.ReactNode}) {
  // Authorize here as well as middleware; middleware is not the security boundary.
  const actor=await authenticate(new Headers(headers()));
  const provider=paymentProviderInfo();
  return <html lang="en" className="font-sans antialiased"><body>{actor ? <><AppSidebar providerName={provider.displayName} providerMode={provider.activeMode}/><main className="ml-64 min-h-screen"><Topbar providerName={provider.displayName} providerMode={provider.activeMode}/>{children}</main></> : <main className="flex min-h-screen items-center justify-center bg-slate-50 relative overflow-hidden"><div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-500/10 blur-[100px] rounded-full pointer-events-none" /><div className="card p-10 text-center max-w-sm relative z-10 shadow-xl border-slate-200"><div className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white font-bold text-2xl shadow-glow-brand">R</div><h1 className="text-2xl font-bold text-slate-900 tracking-tight">Revive Pay</h1><p className="mt-3 text-sm text-slate-500">Merchant authentication required. Sign in using the configured merchant credentials.</p></div></main>}</body></html>;
}
