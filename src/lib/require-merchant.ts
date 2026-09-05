import {headers} from 'next/headers';
import {notFound} from 'next/navigation';
import {authenticate} from './auth';

// Page loaders authorize before reading data, independently of layout/middleware.
export async function requireMerchant() {
 const actor=await authenticate(new Headers(headers()));
 if(!actor)notFound();
 return actor;
}
