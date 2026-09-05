export default function Loading() {
  return (
    <div className="p-8" role="status" aria-live="polite" aria-label="Loading Revive Pay…">
      {/* Page header skeleton */}
      <div className="mb-8 space-y-2">
        <div className="skeleton h-3 w-40" />
        <div className="skeleton h-8 w-72" />
      </div>

      {/* Metric cards skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="card p-6 space-y-3">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton h-8 w-32" />
            <div className="skeleton h-3 w-40" />
          </div>
        ))}
      </div>

      {/* Main content skeleton */}
      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="card col-span-1 xl:col-span-2 p-6 space-y-4">
          <div className="skeleton h-4 w-48" />
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex justify-between py-2">
              <div className="skeleton h-4 w-36" />
              <div className="skeleton h-4 w-20" />
            </div>
          ))}
        </div>
        <div className="card p-6 space-y-4">
          <div className="skeleton h-4 w-36" />
          {[1, 2, 3].map(i => (
            <div key={i} className="space-y-1.5">
              <div className="flex justify-between">
                <div className="skeleton h-3 w-28" />
                <div className="skeleton h-3 w-8" />
              </div>
              <div className="skeleton h-2 w-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Table skeleton */}
      <div className="card card-static mt-5 overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4">
          <div className="skeleton h-4 w-48" />
        </div>
        <div className="divide-y divide-slate-100">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex items-center gap-6 px-6 py-4">
              <div className="skeleton h-7 w-7 rounded-full shrink-0" />
              <div className="skeleton h-4 flex-1 max-w-[160px]" />
              <div className="skeleton h-4 w-24 ml-auto" />
              <div className="skeleton h-5 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

