import {AnalystService} from '../domain/analyst/analyst-service';
import {RecoveryError} from '../domain/recovery/policy';
import {merchantRequest} from './api';
import {boundedBody} from './bounded-body';

export function getAnalyst(request: Request, id: string, service = new AnalystService()) {
  return merchantRequest(request, () => service.latest(id));
}
export function postAnalyst(request: Request, id: string, service = new AnalystService()) {
  return merchantRequest(request, async actor => {
    let text: string;
    try {text = await boundedBody(request.body, 1024);} catch {throw new RecoveryError('Analysis request is too large', 422);}
    const body: unknown = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !('requestId' in body) || typeof body.requestId !== 'string') throw new RecoveryError('Only an analysis requestId is accepted; evidence is loaded on the server.', 422);
    return service.analyze(id, body.requestId, actor);
  });
}
