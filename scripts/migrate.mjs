import {existsSync,mkdirSync,closeSync,openSync} from 'node:fs';
import {resolve,isAbsolute,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
if(existsSync('.env'))process.loadEnvFile('.env');
const url=process.env.DATABASE_URL;
if(!url?.startsWith('file:'))throw Error('Configure DATABASE_URL as a local SQLite file in .env');
const name=url.slice(5).split('?')[0];
const path=isAbsolute(name)?name:resolve('prisma',name);
mkdirSync(dirname(path),{recursive:true});
// Prisma 5 on Windows may fail migrate deploy when the SQLite file is absent.
closeSync(openSync(path,'a'));
const result=spawnSync(process.execPath,[resolve('node_modules/prisma/build/index.js'),'migrate','deploy'],{stdio:'inherit',env:process.env});
process.exitCode=result.status??1;
