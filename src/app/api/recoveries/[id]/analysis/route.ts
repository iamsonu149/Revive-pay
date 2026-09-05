import {getAnalyst, postAnalyst} from '@/lib/analyst-api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(request: Request, {params}: {params: {id: string}}) {
  return getAnalyst(request, params.id);
}
export function POST(request: Request, {params}: {params: {id: string}}) {
  return postAnalyst(request, params.id);
}
