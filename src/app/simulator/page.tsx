import {requireMerchant} from '@/lib/require-merchant';
import {simulationMetrics} from '@/domain/simulation/simulation-service';
import {SimulatorControls} from '@/components/simulator/simulator-controls';
import {FlaskConical} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function Simulator() {
  await requireMerchant();
  const data = await simulationMetrics();

  return (
    <div className="p-8 animate-fade-in">
      <div className="mb-8">
        <p className="page-eyebrow">Synthetic batch simulator</p>
        <h2 className="page-title">Compare recovery strategies.</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-500 leading-relaxed">
          Replay the current failed cases that have no execution. Outcomes are illustrative,
          deterministic and do not measure production performance.
        </p>
      </div>

      <SimulatorControls initial={data} />

      {/* Methodology — collapsible */}
      <details className="card card-static mt-6 group">
        <summary className="flex cursor-pointer select-none list-none items-center justify-between px-6 py-4 hover:bg-slate-50/50 transition-colors">
          <div className="flex items-center gap-2">
            <FlaskConical size={15} className="text-slate-400" />
            <span className="text-sm font-semibold text-slate-900">Methodology</span>
          </div>
          <svg
            className="h-4 w-4 text-slate-400 transition-transform duration-200 group-open:rotate-180"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
          </svg>
        </summary>
        <div className="px-6 pb-5">
          <p className="text-sm text-slate-600 leading-relaxed">
            All strategies use the same case-based draw and heuristic recovery score, with no
            strategy-specific probability bonus. Review and stopped actions recover nothing. The
            decision engine uses current customer contact history, merchant limits and approval
            state. Unsafe retries cannot recover. Scheduled retries are modeled over the replay
            horizon. Payment-link outcomes model a possible later customer payment. Contact
            pressure is a bounded synthetic index, not measured customer sentiment.
          </p>
        </div>
      </details>
    </div>
  );
}

