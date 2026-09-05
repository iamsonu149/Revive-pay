'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {CheckCircle2, Play, RefreshCw, Lock, XCircle, Clock, ExternalLink} from 'lucide-react';
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
  providerMode,
  recoveryUrl,
}: {
  id: string;
  status: string;
  required: boolean;
  action: string;
  scheduledFor?: string | null;
  hasExecution?: boolean;
  providerMode:'mock'|'razorpay_test';
  recoveryUrl?:string|null;
}) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [pending, setPending] = useState(false);
  const [decision, setDecision] = useState('SEND_PAYMENT_UPDATE_LINK');
  const [confirmation,setConfirmation]=useState<string|null>(null);
  const [rejectionReason,setRejectionReason]=useState('Not suitable for recovery');

  async function call(kind: string) {
    if (pending) return;
    setPending(true);
    setMessage('');
    setIsError(false);
    try {
      const r = await fetch(`/api/recoveries/${id}/${kind}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(kind==='reject'?{reason:rejectionReason}:kind==='approve'?{action:action==='NEEDS_REVIEW'?decision:action}:{}),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      setMessage(
        b.status === 'RECOVERED'
          ? 'Payment confirmed by the provider.'
          : b.status === 'EXECUTED'
          ? 'Payment link created; awaiting a verified payment confirmation.'
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
      setConfirmation(null);
      router.refresh();
    }
  }

  const terminal = ['RECOVERED', 'FAILED','REJECTED'].includes(status);
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
            providerMode==='mock' ? <button disabled={pending} className="btn-success" onClick={() => setConfirmation('confirm-mock')}>
              {pending ? <span className="spinner" /> : <CheckCircle2 size={14} />} Simulate customer payment (mock)
            </button> : recoveryUrl ? <a className="btn-success" href={recoveryUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14}/> Open secure payment page
            </a> : null
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
                onClick={() => setConfirmation('approve')}
                className="btn-warning"
              >
                {pending ? <span className="spinner" /> : <Lock size={14} />}
                Approve decision
              </button>
              <button disabled={pending} onClick={()=>setConfirmation('reject')} className="btn-ghost text-red-700"><XCircle size={14}/>Reject case</button>
            </>
          )}
          <button
            disabled={pending || future || (needsApproval && status !== 'APPROVED')}
            onClick={() => setConfirmation('execute')}
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

      {confirmation&&<div className="callout callout-warning mt-4 items-start"><Lock size={15} className="mt-0.5 shrink-0"/><div className="flex-1"><p className="font-semibold">Confirm {confirmation==='execute'?'provider execution':confirmation==='approve'?'approval':confirmation==='reject'?'rejection':'mock payment confirmation'}</p><p className="mt-1 text-xs">Safeguards will be checked again by the server and the decision will be audited.</p>{confirmation==='reject'&&<input className="input mt-3" value={rejectionReason} onChange={event=>setRejectionReason(event.target.value)} aria-label="Rejection reason"/>}<div className="mt-3 flex gap-2"><button className={confirmation==='reject'?'btn-danger':'btn-warning'} disabled={pending||confirmation==='reject'&&rejectionReason.trim().length<3} onClick={()=>void call(confirmation)}>{pending?'Working…':'Confirm'}</button><button className="btn-ghost" disabled={pending} onClick={()=>setConfirmation(null)}>Cancel</button></div></div></div>}

      <StatusMessage message={message} isError={isError} />
    </div>
  );
}
