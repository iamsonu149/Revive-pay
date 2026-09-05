'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import type {AnalystState, AnalystView} from '@/domain/analyst/view';
import {evidenceLabels} from '@/domain/analyst/evidence';
import {fallbackMessages} from '@/domain/analyst/fallback';
import {label} from '@/lib/utils';
import {Sparkles, ChevronDown, AlertTriangle, Info, FileText, Ban, Clock} from 'lucide-react';
import {clsx} from 'clsx';

/* ── Source badge styling ──────────────────────────────────────────────── */
function SourceBadge({src, stale}: {src: string; stale: boolean}) {
  const isGemini = src.toLowerCase().includes('gemini');
  const isFallback = src.toLowerCase().includes('fallback') || src.toLowerCase().includes('deterministic');
  const cls = isGemini
    ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
    : isFallback
    ? 'bg-amber-50 border-amber-200 text-amber-700'
    : 'bg-slate-50 border-slate-200 text-slate-600';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={clsx('badge', cls)}>
        {isGemini && <Sparkles size={10} />}
        {src}
      </span>
      {stale && (
        <span className="badge bg-amber-50 border-amber-200 text-amber-700">
          <AlertTriangle size={10} />
          Stale — evidence has changed
        </span>
      )}
    </div>
  );
}

/* ── Disclosure section ────────────────────────────────────────────────── */
function Disclosure({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      open={open}
      onToggle={e => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className="group"
    >
      <summary className="flex cursor-pointer select-none list-none items-center justify-between py-3 text-sm font-semibold text-slate-900 hover:text-emerald-700 transition-colors">
        {title}
        <ChevronDown
          size={14}
          className={clsx('text-slate-400 transition-transform duration-200', open && 'rotate-180')}
        />
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  );
}

export function AIAnalystPanel({id, caseVersion}: {id: string; caseVersion: string}) {
  const [state, setState] = useState<AnalystState | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const requestId = useRef<string | null>(null);
  const mounted = useRef(true);
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    const sequence = ++loadSequence.current;
    try {
      const response = await fetch(`/api/recoveries/${id}/analysis`, {cache: 'no-store'});
      const body = await response.json();
      if (!response.ok) throw Error(body.error || 'Could not load saved analysis.');
      if (mounted.current && !inFlight.current && sequence === loadSequence.current) {
        setState(body);
        if (!body.pending) requestId.current = null;
      }
    } catch {
      if (mounted.current && !inFlight.current && sequence === loadSequence.current)
        setError('Could not load saved analysis. Existing recovery controls remain available.');
    }
  }, [id]);

  useEffect(() => {
    mounted.current = true;
    void load(); // Reads saved metadata only. Never calls Gemini.
    const timer = setInterval(() => void load(), 30000);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [load, caseVersion]);

  async function analyze() {
    if (inFlight.current || state?.pending) return;
    inFlight.current = true;
    loadSequence.current++;
    setPending(true);
    setError('');
    requestId.current ??= crypto.randomUUID();
    try {
      const response = await fetch(`/api/recoveries/${id}/analysis`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({requestId: requestId.current}),
      });
      const body = await response.json();
      if (response.status < 500 && response.status !== 409) requestId.current = null;
      if (!response.ok)
        throw Error(body.error || 'Analysis could not be confirmed. Refresh the saved result before retrying.');
      const analysis = body as AnalystView;
      if (mounted.current)
        setState(previous => ({
          ...previous,
          configured: previous?.configured ?? false,
          analysis,
          pending: false,
          retryAt: null,
        }));
    } catch (caught) {
      if (mounted.current)
        setError(caught instanceof Error ? caught.message : 'Analysis could not be confirmed.');
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setPending(false);
        void load();
      }
    }
  }

  const result = state?.analysis;
  const working = pending || state?.pending;

  return (
    <section
      className="mt-5 overflow-hidden rounded-xl border border-indigo-100 bg-white shadow-card"
      aria-labelledby="ai-analyst-heading"
    >
      {/* Gradient header */}
      <div className="bg-gradient-to-r from-indigo-950 via-indigo-900 to-slate-900 px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-700/50 text-indigo-200">
              <Sparkles size={17} />
            </span>
            <div>
              <h3
                id="ai-analyst-heading"
                className="text-sm font-bold text-white"
              >
                AI Recovery Analyst
              </h3>
              <p className="mt-0.5 max-w-xl text-xs text-indigo-200/80 leading-relaxed">
                Advisory analysis only. Policy, approval controls, and safety rules remain authoritative.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={!!working}
            onClick={() => void analyze()}
            className={clsx(
              'shrink-0 flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all duration-150',
              working
                ? 'bg-indigo-800 text-indigo-300 cursor-not-allowed opacity-70'
                : 'bg-indigo-500 text-white hover:bg-indigo-400 active:scale-95',
            )}
          >
            {working && <span className="spinner h-3 w-3" />}
            {working ? 'Analyzing…' : 'Analyze case'}
          </button>
        </div>
        <p className="mt-3 text-[11px] text-indigo-300/60">
          Only allowlisted payment signals and policy limits are sent. Names, contact details, and identifiers are excluded. Drafts are never sent.
        </p>
      </div>

      {/* Body */}
      <div className="px-6 py-5">
        {/* Status banners */}
        {!state && !error && (
          <div className="flex items-center gap-2 text-sm text-slate-500" role="status">
            <span className="spinner" />
            Loading saved analysis…
          </div>
        )}

        {state && !state.configured && (
          <div className="callout callout-warning mb-4">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <p className="text-xs">Gemini is not configured. Analyze case will provide a clearly labeled deterministic fallback.</p>
          </div>
        )}

        {working && (
          <div className="callout callout-info mb-4" role="status">
            <Info size={15} className="shrink-0 mt-0.5" />
            <p className="text-xs">Analysis is in progress. No payment or approval action is being taken.</p>
          </div>
        )}

        {error && (
          <div className="callout callout-danger mb-4" role="alert">
            <Ban size={15} className="shrink-0 mt-0.5" />
            <p className="text-xs">{error}</p>
          </div>
        )}

        {state && !result && !working && (
          <div className="callout callout-muted">
            <Clock size={15} className="shrink-0 mt-0.5" />
            <p className="text-xs">No saved analysis yet. Gemini runs only when you select Analyze case.</p>
          </div>
        )}

        {result && (
          <div className="animate-fade-in">
            {/* Source + meta */}
            <SourceBadge src={result.sourceLabel} stale={!!result.stale} />
            <p className="mt-2 text-[11px] text-slate-400">
              Model: {result.model ?? 'Deterministic rules'}
              {!result.model && result.requestedModel
                ? ` (requested: ${result.requestedModel})`
                : ''}{' '}
              · {new Date(result.analyzedAt).toLocaleString('en-IN')} · {result.promptVersion}
            </p>

            {/* Stale warning */}
            {result.stale && (
              <div className="callout callout-warning mt-4">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <p className="text-xs">
                  This diagnosis uses an older snapshot. The policy result below uses current evidence.
                  Generate a new analysis before relying on its diagnosis.
                </p>
              </div>
            )}

            {/* Fallback reason */}
            {result.fallbackReason && (
              <div className="callout callout-warning mt-4">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <p className="text-xs">{fallbackMessages[result.fallbackReason]}</p>
              </div>
            )}

            <div className="mt-5 divide-y divide-slate-100 border-t border-slate-100">

              {/* Diagnosis — open by default */}
              <Disclosure title="Diagnosis" defaultOpen>
                <p className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">
                  {result.analysis.diagnosis}
                </p>
              </Disclosure>

              {/* Evidence refs */}
              <Disclosure title="Supporting evidence from analyzed snapshot" defaultOpen>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  {result.analysis.evidenceRefs.map(ref => (
                    <div key={ref} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                      <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        {evidenceLabels[ref]}
                      </dt>
                      <dd className="mt-1 font-medium text-slate-800">
                        {String(result.evidence[ref])}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Disclosure>

              {/* Proposed action */}
              <Disclosure title={`Proposed action: ${label(result.analysis.proposedAction)}`} defaultOpen>
                <p className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">
                  {result.analysis.actionRationale}
                </p>
              </Disclosure>

              {/* Policy result */}
              <div className="py-4">
                <div
                  className={clsx(
                    'rounded-xl border p-4',
                    result.policy.status === 'REJECTED'
                      ? 'border-red-200 bg-red-50'
                      : 'border-amber-200 bg-amber-50',
                  )}
                >
                  <div className="flex items-center gap-2">
                    {result.policy.status === 'REJECTED'
                      ? <Ban size={15} className="text-red-600 shrink-0" />
                      : <AlertTriangle size={15} className="text-amber-600 shrink-0" />}
                    <h4 className={clsx('text-sm font-bold', result.policy.status === 'REJECTED' ? 'text-red-800' : 'text-amber-800')}>
                      Current policy result: {label(result.policy.status)}
                    </h4>
                  </div>
                  <ul className="mt-2 space-y-1 pl-5 list-disc text-xs">
                    {result.policy.reasons.map(reason => (
                      <li key={reason} className={result.policy.status === 'REJECTED' ? 'text-red-700' : 'text-amber-700'}>
                        {reason}
                      </li>
                    ))}
                  </ul>
                  {result.policy.differsFromSavedAction && (
                    <p className="mt-2 text-xs font-semibold text-amber-800">
                      The saved recovery action is unchanged.
                    </p>
                  )}
                </div>
              </div>

              {/* Uncertainties */}
              <Disclosure title="Missing information and uncertainty">
                <ul className="space-y-1.5 pl-4 list-disc text-sm text-slate-600">
                  {result.analysis.uncertainties.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
                {result.analysis.escalationReason && (
                  <div className="callout callout-warning mt-4">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <p className="text-xs"><strong>Escalation:</strong> {result.analysis.escalationReason}</p>
                  </div>
                )}
              </Disclosure>

              {/* Customer message draft */}
              {result.analysis.customerMessageDraft && (
                <div className="py-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText size={14} className="text-slate-400" />
                    <h4 className="text-sm font-semibold text-slate-900">
                      Customer-message draft
                    </h4>
                    <span className="badge badge-danger ml-auto">NOT SENT · NOT APPROVED</span>
                  </div>
                  <pre className="mt-2 overflow-auto rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 font-sans whitespace-pre-wrap leading-relaxed">
                    {result.analysis.customerMessageDraft}
                  </pre>
                </div>
              )}

              {result.policy.status === 'REJECTED' && (
                <div className="callout callout-danger mt-2">
                  <Ban size={14} className="shrink-0 mt-0.5" />
                  <p className="text-xs">No customer-message draft is available while the proposal is blocked.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
