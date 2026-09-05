'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {CheckCircle2, Play, RefreshCw, Lock, XCircle, Clock} from 'lucide-react';
import {clsx} from 'clsx';

/* ── inline mini-toast (no provider needed here) ─────────────────────── */
function StatusMessage({message, isError}: {message: string; isError: boolean}) {
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={clsx(
        'callout mt-4 animate-slide-up text-xs',
        isError ? 'callout-danger' : 'callout-success',
      )}
    >
      {isError ? <XCircle size={14} className="shrink-0 mt-0.5" /> : <CheckCircle2 size={14} className="shrink-0 mt-0.5" />}
      {message}
    </div>
  );
}

export function ApprovalPanel({
  id,
  status,
  required,
  action,
  scheduledFor,
  hasExecution = false,
}: {
  id: string;
  status: string;
  required: boolean;
  action: string;
  scheduledFor?: string | null;
  hasExecution?: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [pending, setPending] = useState(false);
  const [decision, setDecision] = useState('SEND_PAYMENT_UPDATE_LINK');

  async function call(kind: string) {
    if (pending) return;
    setPending(true);
    setMessage('');
    setIsError(false);
    try {
      const r = await fetch(`/api/recoveries/${id}/${kind}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(kind === 'approve' && action === 'NEEDS_REVIEW' ? {action: decision} : {}),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      setMessage(
        b.status === 'RECOVERED'
          ? 'Payment confirmed by the mock provider.'
          : b.status === 'EXECUTED'
          ? 'Payment link sent; awaiting payment confirmation.'
          : b.status === 'APPROVED'
          ? 'Decision approved.'
          : `Case status: ${b.status}`,
      );
    } catch (e) {
      setIsError(true);
      setMessage(
        e instanceof Error ? e.message : 'Result could not be confirmed. Reconcile before trying another action.',
      );
    } finally {
      setPending(false);
      router.refresh();
    }
  }

  const terminal = ['RECOVERED', 'FAILED'].includes(status);
  const needsApproval = required || action === 'NEEDS_REVIEW' || status === 'NEEDS_REVIEW';
  const future =
    action === 'RETRY_LATER' && !!scheduledFor && new Date(scheduledFor).getTime() > Date.now();

  if (terminal) {
    return (
      <div>
        <div
          className={clsx(
            'callout',
            status === 'RECOVERED' ? 'callout-success' : 'callout-danger',
          )}
        >
          {status === 'RECOVERED'
            ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
            : <XCircle size={16} className="shrink-0 mt-0.5" />}
          <div>
            <p className="font-semibold">Case completed: {status.toLowerCase()}</p>
            <p className="text-xs mt-0.5 opacity-80">No further actions available.</p>
          </div>
        </div>
      </div>
    );
  }

  if (action === 'STOP') {
    return (
      <div>
        <div className="callout callout-danger">
          <XCircle size={16} className="shrink-0 mt-0.5" />
          <p className="font-semibold">Recovery stopped by policy.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {hasExecution ? (
        <div className="flex flex-wrap gap-3">
          <button
            disabled={pending}
            className="btn-primary"
            onClick={() => void call('reconcile')}
          >
            {pending ? <span className="spinner" /> : <RefreshCw size={14} />}
            Reconcile provider outcome
          </button>
          {status === 'EXECUTED' && action === 'SEND_PAYMENT_UPDATE_LINK' && (
            <button
              disabled={pending}
              className="btn-success"
              onClick={() => void call('confirm-mock')}
            >
              {pending ? <span className="spinner" /> : <CheckCircle2 size={14} />}
              Simulate customer payment (mock)
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {needsApproval && status !== 'APPROVED' && (
            <>
              {action === 'NEEDS_REVIEW' && (
                <select
                  aria-label="Review decision"
                  value={decision}
                  onChange={e => setDecision(e.target.value)}
                  className="select-input w-auto"
                >
                  <option value="SEND_PAYMENT_UPDATE_LINK">Send payment update link</option>
                  <option value="RETRY_LATER">Retry at scheduled time</option>
                </select>
              )}
              <button
                disabled={pending}
                onClick={() => void call('approve')}
                className="btn-warning"
              >
                {pending ? <span className="spinner" /> : <Lock size={14} />}
                Approve decision
              </button>
            </>
          )}
          <button
            disabled={pending || future || (needsApproval && status !== 'APPROVED')}
            onClick={() => void call('execute')}
            className="btn-success"
          >
            {pending ? <span className="spinner" /> : <Play size={14} />}
            {action === 'RETRY_LATER' ? 'Execute due retry' : 'Send payment link'}
          </button>
        </div>
      )}

      {future && (
        <div className="callout callout-info mt-4">
          <Clock size={14} className="shrink-0 mt-0.5" />
          <p className="text-xs">
            Retry scheduled for {new Date(scheduledFor!).toLocaleString('en-IN')}.
          </p>
        </div>
      )}

      <StatusMessage message={message} isError={isError} />
    </div>
  );
}
