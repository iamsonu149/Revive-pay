import {NextRequest,NextResponse} from 'next/server';
import {authenticate,sameOrigin} from './lib/auth';
export async function middleware(request:NextRequest) {
 if(!await authenticate(request.headers)) return new NextResponse('Sign in with the merchant credentials configured in .env.',{status:401,headers:{'WWW-Authenticate':'Basic realm="Revive Pay", charset="UTF-8"','Cache-Control':'no-store'}});
 if(!['GET','HEAD'].includes(request.method) && !sameOrigin(request)) return new NextResponse('Cross-origin action denied',{status:403});
 const response=NextResponse.next();
 response.headers.set('Cache-Control','no-store');
 response.headers.set('X-Frame-Options','DENY');
 return response;
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico|logo-mark.svg).*)']};
