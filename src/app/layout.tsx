import './globals.css';
import {headers} from 'next/headers';
import {authenticate} from '@/lib/auth';
import {AppSidebar} from '@/components/layout/app-sidebar';
import {Topbar} from '@/components/layout/topbar';
export const dynamic='force-dynamic';
export const metadata={title:'Revive Pay',description:'Guardrailed revenue recovery operations'};
export default async function Layout({children}:{children:React.ReactNode}) {
  // Authorize here as well as middleware; middleware is not the security boundary.
  const actor=await authenticate(new Headers(headers()));
  return <html lang="en" className="font-sans antialiased"><body>{actor ? <><AppSidebar/><main className="ml-64 min-h-screen"><Topbar/>{children}</main></> : <main className="flex min-h-screen items-center justify-center bg-slate-950"><div className="card p-10 text-center max-w-sm"><div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-emerald-600 text-white font-bold text-lg">R</div><h1 className="text-lg font-semibold text-slate-900">Revive Pay</h1><p className="mt-2 text-sm text-slate-500">Merchant authentication required. Sign in using the configured merchant credentials.</p></div></main>}</body></html>;
}
