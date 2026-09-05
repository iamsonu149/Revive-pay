export function Topbar() {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 backdrop-blur-md px-8 gap-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-600 leading-none">Revenue recovery control center</p>
        <h1 className="text-sm font-semibold text-slate-900 mt-1">Merchant workspace</h1>
      </div>
      <div className="flex items-center gap-3 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
        </span>
        <span className="text-[11px] font-medium text-slate-600 tracking-wide">Mock provider · synthetic outcomes</span>
      </div>
    </header>
  );
}

