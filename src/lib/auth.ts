export type AuthConfig={user?:string;password?:string};
export async function authenticate(headers:Headers, config:AuthConfig={user:process.env.MERCHANT_USER,password:process.env.MERCHANT_PASSWORD}) {
 if(!config.user || !config.password || config.password.length<16) return null;
 const value=headers.get('authorization');
 if(!value?.startsWith('Basic ')) return null;
 let credentials:string;
 try {credentials=atob(value.slice(6));} catch {return null;}
 const digest=async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
 const [actual,expected]=await Promise.all([digest(credentials),digest(`${config.user}:${config.password}`)]);
 let diff=0; for(let i=0;i<actual.length;i++) diff|=actual[i]^expected[i];
 return diff===0?config.user:null;
}
export function sameOrigin(request:Request) {
 const origin=request.headers.get('origin');
 // Next may normalize request.url to localhost; the browser addresses the Host header.
 const target=new URL(request.url);
 const host=request.headers.get('host');
 if(host)target.host=host;
 return request.headers.get('sec-fetch-site')!=='cross-site' && (!origin || origin===target.origin);
}
