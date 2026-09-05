import {randomBytes} from 'node:crypto';
import {readFileSync,appendFileSync,existsSync,copyFileSync} from 'node:fs';
if(!existsSync('.env'))copyFileSync('.env.example','.env');
const content=readFileSync('.env','utf8');
if(!/^MERCHANT_USER=.+$/m.test(content))appendFileSync('.env','\nMERCHANT_USER=merchant\n');
if(!/^MERCHANT_PASSWORD=.{16,}$/m.test(content))appendFileSync('.env',`MERCHANT_PASSWORD=${randomBytes(24).toString('hex')}\n`);
console.log('Merchant credentials configured in .env. Password was not printed.');
