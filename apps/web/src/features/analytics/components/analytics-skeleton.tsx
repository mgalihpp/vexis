import type { CSSProperties, ReactNode } from "react";

function Block({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-muted ${className}`} style={style} />;
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[10px] border bg-card p-3 ${className}`}>{children}</div>;
}

function StatSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      <Block className={`h-3 ${wide ? "w-20" : "w-16"}`} />
      <Block className={`h-4 ${wide ? "w-24" : "w-14"}`} />
      {wide && <Block className="h-3 w-20" />}
    </div>
  );
}

function PoolHeaderSkeleton() {
  return (
    <Panel className="flex flex-col gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex shrink-0 -space-x-1.5">
          <Block className="size-7 rounded-full ring-2 ring-card" />
          <Block className="size-7 rounded-full ring-2 ring-card" />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <Block className="h-4 w-28 max-w-full" />
          <Block className="h-3 w-36 max-w-full" />
        </div>
        <Block className="size-4 shrink-0 rounded-full" />
        <Block className="size-4 shrink-0 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Block className="h-3 w-24" />
          <Block className="h-4 w-28 max-w-full" />
        </div>
        <div className="space-y-1.5">
          <Block className="h-3 w-20" />
          <Block className="h-4 w-16" />
        </div>
      </div>
    </Panel>
  );
}

function TokensSkeleton() {
  return (
    <Panel className="flex flex-col gap-3">
      {["token-x", "token-y"].map((row) => (
        <div key={row} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Block className="size-5 rounded-full" />
            <Block className="h-3.5 w-16" />
            <Block className="ml-auto h-3.5 w-20" />
          </div>
          <Block className="h-1 w-full rounded-full" />
        </div>
      ))}
    </Panel>
  );
}

function LiquiditySkeleton() {
  return (
    <Panel className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Block className="h-3.5 w-32" />
        <div className="flex gap-2">
          <Block className="size-4 rounded" />
          <Block className="size-4 rounded" />
        </div>
      </div>
      <div className="flex gap-3">
        <Block className="h-3 w-12" />
        <Block className="h-3 w-12" />
      </div>
      <div className="mt-6 flex h-28 items-end gap-1">
        {[24, 39, 57, 44, 68, 54, 86, 61, 72, 46, 63, 34, 52, 28, 41, 22].map((height) => (
          <Block key={height} className="flex-1 rounded-t-sm" style={{ height: `${height}%` }} />
        ))}
      </div>
      <div className="flex justify-between">
        {[0, 1, 2, 3].map((tick) => (
          <Block key={tick} className="h-2.5 w-10" />
        ))}
      </div>
    </Panel>
  );
}

function RowsSkeleton({ title, rows }: { title: string; rows: number }) {
  return (
    <Panel className="flex flex-col gap-3">
      <Block className="h-3.5 w-28" />
      {Array.from({ length: rows }, (_, i) => ({ id: `${title}-${i}`, wide: i % 3 === 0 })).map((row) => (
        <div key={row.id} className="flex items-center justify-between gap-3">
          <Block className={`h-3 ${row.wide ? "w-24" : "w-28"}`} />
          <Block className="h-3 w-12" />
        </div>
      ))}
    </Panel>
  );
}

function VolumeStatsSkeleton() {
  return (
    <Panel className="flex min-h-[5.25rem] flex-row items-center gap-4 overflow-hidden px-4 py-3">
      <StatSkeleton wide />
      {["volume-24h", "volume-7d", "ratio", "buy", "sell"].map((name, i) => (
        <div key={name} className="flex shrink-0 items-center gap-4">
          <div className="h-7 w-px bg-border" />
          <StatSkeleton wide={i > 2} />
        </div>
      ))}
    </Panel>
  );
}

function ChartSkeleton() {
  return (
    <Panel className="flex h-[min(620px,72vh)] min-h-[340px] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Block className="h-4 w-24" />
        <div className="h-4 w-px bg-border" />
        <Block className="h-7 w-28 rounded-md" />
        <Block className="h-7 w-40 rounded-md" />
        <Block className="ml-auto h-7 w-24 rounded-md" />
      </div>
      <div className="flex min-h-0 flex-1 gap-2">
        <div className="flex min-w-0 flex-1 flex-col justify-between py-2">
          <div className="relative flex min-h-0 flex-1 flex-col justify-end gap-1 overflow-hidden rounded-md">
            <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
              {["top", "upper", "middle", "lower", "bottom"].map((line) => (
                <div key={line} className="border-t border-border/60" />
              ))}
            </div>
            <svg className="relative h-full w-full" viewBox="0 0 600 300" preserveAspectRatio="none" aria-hidden="true">
              <path
                d="M0 188 C48 179 64 210 110 190 S174 166 210 179 S278 144 318 158 S380 126 420 149 S490 116 520 132 S566 102 600 112"
                fill="none"
                className="stroke-muted-foreground/30"
                strokeWidth="2"
              />
              <path
                d="M0 188 C48 179 64 210 110 190 S174 166 210 179 S278 144 318 158 S380 126 420 149 S490 116 520 132 S566 102 600 112 L600 300 L0 300Z"
                className="fill-muted/40"
              />
              {Array.from({ length: 32 }, (_, i) => {
                const x = 12 + i * 18;
                const y = 55 + ((i * 37) % 105);
                const height = 12 + ((i * 13) % 24);
                return (
                  <g key={x} className="stroke-muted-foreground/25 fill-muted-foreground/25">
                    <line x1={x + 3} x2={x + 3} y1={y - 9} y2={y + height + 8} />
                    <rect x={x} y={y} width="6" height={height} rx="1" />
                  </g>
                );
              })}
            </svg>
            <div className="absolute inset-x-0 bottom-0 flex h-[24%] items-end gap-1 border-t border-border/50 px-1">
              {[
                38, 62, 44, 75, 51, 84, 47, 67, 33, 58, 79, 40, 64, 49, 72, 36, 56, 81, 45, 60, 31, 69, 52, 76, 42, 63,
                35, 71,
              ].map((h) => (
                <Block key={h} className="flex-1 rounded-t-[2px] opacity-60" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
          <div className="flex justify-between pt-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Block key={i} className="h-2.5 w-9" />
            ))}
          </div>
        </div>
        <div className="flex w-12 shrink-0 flex-col justify-between py-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Block key={i} className="h-2.5 w-10" />
          ))}
        </div>
      </div>
    </Panel>
  );
}

function SparklineSkeleton() {
  return (
    <Panel className="flex flex-col gap-2">
      <Block className="h-3 w-20" />
      <Block className="h-6 w-24" />
      <div className="flex h-[76px] items-end gap-1">
        {[42, 55, 36, 70, 47, 62, 38, 78, 49, 65, 43, 58, 82, 45, 69, 52, 74, 40, 61, 48].map((h) => (
          <Block key={h} className="flex-1 rounded-t-sm opacity-55" style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="flex justify-between">
        {[0, 1, 2, 3].map((i) => (
          <Block key={i} className="h-2.5 w-8" />
        ))}
      </div>
    </Panel>
  );
}

function TvlSkeleton() {
  return (
    <Panel className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Block className="h-3.5 w-24" />
        <div className="flex gap-2">
          <Block className="h-3 w-8" />
          <Block className="h-3 w-8" />
        </div>
      </div>
      <Block className="h-2.5 w-full rounded-full" />
      <div className="flex justify-between">
        <Block className="h-3 w-20" />
        <Block className="h-3 w-20" />
      </div>
    </Panel>
  );
}

function TokenInfoSkeleton() {
  return (
    <Panel className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Block className="h-3.5 w-16" />
        <Block className="h-7 w-24 rounded-md" />
      </div>
      <div className="grid grid-cols-3 gap-x-2 gap-y-3">
        {["age", "market-cap", "fdv", "holders", "top-holders", "dev-mints", "freeze-auth", "mint-auth", "supply"].map(
          (field) => (
            <StatSkeleton key={field} />
          ),
        )}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <Block key={i} className="h-10 rounded-md" />
        ))}
      </div>
    </Panel>
  );
}

export function AnalyticsSkeleton() {
  return (
    <div
      aria-label="Loading analytics"
      aria-busy="true"
      role="status"
      className="grid grid-cols-[minmax(0,1fr)] gap-2 p-2 xl:h-full xl:grid-cols-[312px_minmax(0,1fr)_300px] xl:grid-rows-[minmax(0,1fr)] xl:overflow-hidden"
    >
      <div className="flex flex-col gap-2 max-xl:contents xl:min-h-0 xl:overflow-y-auto">
        <div className="max-xl:order-1">
          <PoolHeaderSkeleton />
        </div>
        <div className="max-xl:order-5">
          <TokensSkeleton />
        </div>
        <div className="max-xl:order-6">
          <LiquiditySkeleton />
        </div>
        <div className="max-xl:order-7">
          <RowsSkeleton title="metrics" rows={14} />
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-2 max-xl:contents xl:min-h-0 xl:overflow-y-auto">
        <div className="min-w-0 max-xl:order-2">
          <VolumeStatsSkeleton />
        </div>
        <div className="max-xl:order-3">
          <ChartSkeleton />
        </div>
      </div>
      <div className="flex flex-col gap-2 max-xl:contents xl:min-h-0 xl:overflow-y-auto">
        <div className="max-xl:order-8">
          <SparklineSkeleton />
        </div>
        <div className="max-xl:order-9">
          <TvlSkeleton />
        </div>
        <div className="max-xl:order-10">
          <TokenInfoSkeleton />
        </div>
        <div className="max-xl:order-11">
          <RowsSkeleton title="fees" rows={7} />
        </div>
        <div className="max-xl:order-12">
          <Panel>
            <div className="flex gap-2">
              <Block className="h-8 flex-1 rounded-md" />
              <Block className="h-8 flex-1 rounded-md" />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
