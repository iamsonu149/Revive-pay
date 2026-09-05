'use client';

import {useState} from 'react';
import {inr} from '@/lib/currency';
import type {Metrics} from '@/domain/simulation/baseline-strategies';
import {Play, Trophy, RotateCcw, AlertCircle} from 'lucide-react';
import {clsx} from 'clsx';

function MetricRow({label, value, highlight}: {label: string; value: string | number; highlight?: boolean}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={clsx('text-xs font-semibold tabular-nums', highlight ? 'text-emerald-700' : 'text-slate-800')}>
        {value}
      </span>
    </div>
  );
}

export function SimulatorControls({initial}: {initial: Metrics[]}) {
  const [data, setData] = useState(initial);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const best = Math.max(...data.map(x => x.recoveredAmount));

  const run = async () => {
    setRunning(true);
    setError('');
    try {
      const r = await fetch('/api/simulator/run', {method: 'POST'});
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      setData(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Replay failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      {error && (
        <div className="callout callout-danger mb-4 animate-slide-up" role="alert">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Control bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {data[0]?.totalPayments ?? 0}-failure deterministic replay
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Same data. Three strategies. One clear operating tradeoff.
          </p>
        </div>
        <button
          disabled={running}
          onClick={() => void run()}
          className="btn-primary"
        >
          {running ? (
            <>
              <RotateCcw size={14} className="animate-spin" />
              Replaying batch…
            </>
          ) : (
            <>
              <Play size={14} />
              Run deterministic replay
            </>
          )}
        </button>
      </div>

      {/* Strategy cards */}
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {data.map((x: Metrics) => {
          const winner = x.recoveredAmount === best;
          const annoyanceHigh = x.customerAnnoyanceScore > 6;

          return (
            <article
              key={x.strategyName}
              className={clsx(
                'card relative overflow-hidden transition-all duration-300',
                winner
                  ? 'border-emerald-300 shadow-glow-emerald'
                  : '',
                running && 'animate-pulse-slow opacity-60',
              )}
            >
              {/* Winner ribbon */}
              {winner && (
                <div className="absolute right-0 top-0 flex items-center gap-1 rounded-bl-xl bg-emerald-600 px-3 py-1.5">
                  <Trophy size={11} className="text-emerald-100" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-100">
                    Best synthetic
                  </span>
                </div>
              )}

              {/* Gradient accent strip */}
              <div
                className={clsx(
                  'absolute inset-x-0 top-0 h-0.5',
                  winner
                    ? 'bg-gradient-to-r from-emerald-400 to-emerald-600'
                    : 'bg-gradient-to-r from-slate-200 to-slate-300',
                )}
              />

              <div className="p-6 pt-7">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  {x.strategyName}
                </p>
                <p
                  className={clsx(
                    'mt-4 text-3xl font-bold tracking-tight tabular-nums',
                    winner ? 'text-emerald-600' : 'text-slate-900',
                  )}
                >
                  {inr(x.recoveredAmount)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Recovered revenue · {x.recoveredCount} payments
                </p>

                <div className="mt-5 divide-y divide-slate-100 border-t border-slate-100">
                  <MetricRow label="Retry attempts" value={x.retryAttempts} />
                  <MetricRow label="Messages sent" value={x.messagesSent} />
                  <MetricRow label="Bad retries avoided" value={x.avoidedBadRetries} highlight />
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-xs text-slate-500">Contact pressure</span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={clsx(
                            'h-full rounded-full',
                            annoyanceHigh ? 'bg-amber-500' : 'bg-emerald-500',
                          )}
                          style={{width: `${(x.customerAnnoyanceScore / 10) * 100}%`}}
                        />
                      </div>
                      <span
                        className={clsx(
                          'text-xs font-semibold tabular-nums',
                          annoyanceHigh ? 'text-amber-700' : 'text-emerald-700',
                        )}
                      >
                        {x.customerAnnoyanceScore}/10
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
