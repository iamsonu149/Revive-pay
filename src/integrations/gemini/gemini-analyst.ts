import {boundedBody} from '../../lib/bounded-body';
import {AnalystAnalysis, AnalystProviderError, analysisGenerateContentSchema, analystSystemInstruction, validateAnalysis} from '../../domain/analyst/analysis';
import {AnalystEvidence} from '../../domain/analyst/evidence';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
export const GEMINI_TIMEOUT_MS = 15000;
export type GeminiConfig = {apiKey?: string; model?: string};
export function geminiConfig(): GeminiConfig {
  return {apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL};
}
export function requestedModel(config: GeminiConfig): string | null {
  const model = config.model?.trim() || DEFAULT_GEMINI_MODEL;
  return /^gemini-[a-z0-9.-]{1,80}$/.test(model) ? model : null;
}
export interface AnalystProvider {
  analyze(evidence: AnalystEvidence, config: GeminiConfig): Promise<AnalystAnalysis>;
}

/** Server-only REST adapter. No SDK logs, retries, tool calls, or credential-bearing URLs. */
export class GeminiAnalyst implements AnalystProvider {
  constructor(private fetcher: typeof fetch = fetch, private timeoutMs = GEMINI_TIMEOUT_MS) {}

  async analyze(evidence: AnalystEvidence, config: GeminiConfig): Promise<AnalystAnalysis> {
    const model = requestedModel(config);
    if (!model) throw new AnalystProviderError('INVALID_MODEL_CONFIG');
    if (!config.apiKey?.trim()) throw new AnalystProviderError('MISSING_CREDENTIALS');
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {controller.abort(); reject(new AnalystProviderError('TIMEOUT'));}, this.timeoutMs);
    });
    try {
      return await Promise.race([this.generate(evidence, config.apiKey.trim(), model, controller.signal), deadline]);
    } catch (error) {
      if (controller.signal.aborted) throw new AnalystProviderError('TIMEOUT');
      if (error instanceof AnalystProviderError) throw error;
      // Never expose SDK/network error strings or raw provider responses.
      throw new AnalystProviderError('PROVIDER_FAILURE');
    } finally {if (timer) clearTimeout(timer);}
  }

  private async generate(evidence: AnalystEvidence, key: string, model: string, signal: AbortSignal) {
    const response = await this.fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', signal, cache: 'no-store', redirect: 'error',
      headers: {'Content-Type': 'application/json', 'x-goog-api-key': key},
      body: JSON.stringify({
        systemInstruction: {parts: [{text: analystSystemInstruction}]},
        contents: [{role: 'user', parts: [{text: JSON.stringify({evidence})}]}],
        generationConfig: {
          candidateCount: 1, maxOutputTokens: 3072,
          // generateContent uses the legacy structured-output fields. responseFormat
          // belongs to the newer Interactions API and is rejected by this endpoint.
          responseMimeType: 'application/json',
          responseSchema: analysisGenerateContentSchema,
        },
      }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new AnalystProviderError(response.status === 429 ? 'RATE_LIMIT' : 'PROVIDER_FAILURE');
    }
    try {
      const raw = await boundedBody(response.body, 64000);
      const envelope = JSON.parse(raw);
      const candidate = envelope?.candidates?.[0];
      if (candidate?.finishReason !== 'STOP' || !Array.isArray(candidate?.content?.parts)) throw new Error();
      const parts = candidate.content.parts.filter((part: {thought?: boolean}) => !part.thought);
      if (!parts.length || parts.some((part: {text?: unknown}) => typeof part.text !== 'string')) throw new Error();
      const text = parts.map((part: {text: string}) => part.text).join('');
      if (text.length > 12000) throw new Error();
      return validateAnalysis(JSON.parse(text), evidence);
    } catch {throw new AnalystProviderError('INVALID_RESPONSE');}
  }
}
