'use client';

import {useEffect, useState} from 'react';
import {Shield, Users, Zap, Save, AlertTriangle, CheckCircle2} from 'lucide-react';
import {clsx} from 'clsx';

type Settings = {autoRecoveryLimit: number; maxContacts: number; killSwitch: boolean};

function SettingRow({
  icon: Icon,
  label,
  description,
  children,
}: {
  icon: React.ElementType;
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-slate-100 py-5 last:border-0 sm:flex-row sm:items-start sm:gap-8">
      <div className="flex items-start gap-3 sm:w-64 shrink-0">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
          <Icon size={15} />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900">{label}</p>
          <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">{description}</p>
        </div>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/settings', {cache: 'no-store'})
      .then(async r => {
        const b = await r.json();
        if (!r.ok) throw Error(b.error);
        if (active)
          setSettings({
            autoRecoveryLimit: b.autoRecoveryLimit,
            maxContacts: b.maxContacts,
            killSwitch: b.killSwitch,
          });
      })
      .catch(e => {
        if (active) {
          setIsError(true);
          setMessage(String(e));
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function save() {
    if (!settings) return;
    setPending(true);
    setMessage('');
    setIsError(false);
    try {
      const r = await fetch('/api/settings', {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(settings),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      setSettings({
        autoRecoveryLimit: b.autoRecoveryLimit,
        maxContacts: b.maxContacts,
        killSwitch: b.killSwitch,
      });
      setMessage('Settings saved successfully.');
    } catch (e) {
      setIsError(true);
      setMessage(e instanceof Error ? e.message : 'Could not save settings.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="p-8 animate-fade-in">
      <div className="mb-8">
        <p className="page-eyebrow">Merchant configuration</p>
        <h2 className="page-title">Settings</h2>
      </div>

      {!settings ? (
        <div className="card max-w-2xl p-6 space-y-5">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex gap-4">
              <div className="skeleton h-8 w-8 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-40" />
                <div className="skeleton h-3 w-64" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <form
          onSubmit={e => {
            e.preventDefault();
            void save();
          }}
          className="card max-w-2xl"
        >
          <div className="border-b border-slate-100 px-6 py-4">
            <h3 className="section-title">Recovery limits</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Limits can be tightened. Approval above ₹10,000 and the maximum of two contacts remain mandatory.
            </p>
          </div>

          <div className="px-6">
            <SettingRow
              icon={Zap}
              label="Auto-recovery amount limit"
              description="Cases above this limit require manual approval before execution. Hard cap: ₹10,000."
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-slate-600">₹</span>
                <input
                  type="number"
                  min={0}
                  max={10000}
                  step={1}
                  required
                  value={settings.autoRecoveryLimit}
                  onChange={e =>
                    setSettings({...settings, autoRecoveryLimit: e.target.valueAsNumber})
                  }
                  className="input max-w-[160px]"
                  aria-label="Auto-recovery amount limit in INR"
                />
                <span className="text-xs text-slate-400">INR · max ₹10,000</span>
              </div>
            </SettingRow>

            <SettingRow
              icon={Users}
              label="Maximum contacts in seven days"
              description="Per-customer contact limit across the rolling 7-day window. Hard cap: 2."
            >
              <input
                type="number"
                min={0}
                max={2}
                step={1}
                required
                value={settings.maxContacts}
                onChange={e =>
                  setSettings({...settings, maxContacts: e.target.valueAsNumber})
                }
                className="input max-w-[100px]"
                aria-label="Maximum contacts in seven days"
              />
            </SettingRow>

            <SettingRow
              icon={Shield}
              label="Merchant kill switch"
              description="When enabled, all automated payment execution is blocked immediately. Use in emergencies."
            >
              <label className="flex cursor-pointer items-center gap-3">
                {/* Toggle switch — pure CSS + checkbox */}
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={settings.killSwitch}
                    onChange={e => setSettings({...settings, killSwitch: e.target.checked})}
                    className="peer sr-only"
                    aria-label="Enable merchant kill switch"
                  />
                  <div className="h-5 w-9 rounded-full bg-slate-200 peer-checked:bg-red-500 transition-colors duration-200" />
                  <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 peer-checked:translate-x-4" />
                </div>
                <span
                  className={clsx(
                    'text-sm font-semibold transition-colors',
                    settings.killSwitch ? 'text-red-600' : 'text-slate-500',
                  )}
                >
                  {settings.killSwitch ? 'Kill switch enabled — execution blocked' : 'Kill switch off'}
                </span>
              </label>
              {settings.killSwitch && (
                <div className="callout callout-danger mt-3">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <p className="text-xs">All automated payment execution is currently blocked.</p>
                </div>
              )}
            </SettingRow>
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
            <p className="text-xs text-slate-400">Provider: Mock Razorpay</p>
            <button disabled={pending} type="submit" className="btn-primary">
              {pending ? <span className="spinner" /> : <Save size={14} />}
              {pending ? 'Saving…' : 'Save settings'}
            </button>
          </div>

          {message && (
            <div className={clsx('callout mx-6 mb-4 animate-slide-up text-xs', isError ? 'callout-danger' : 'callout-success')}>
              {isError
                ? <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                : <CheckCircle2 size={14} className="shrink-0 mt-0.5" />}
              {message}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
