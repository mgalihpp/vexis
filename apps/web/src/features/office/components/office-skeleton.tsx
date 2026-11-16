import { Skeleton } from "@/components/ui/skeleton";

/** Shown while the office loads, in the page's layout: the bar, the floor with its roster, and the side tabs. */
export function OfficeSkeleton() {
  return (
    <div className="flex flex-col lg:h-full">
      <div className="flex shrink-0 items-center justify-between gap-2.5 border-b px-2 py-1.5">
        <Skeleton className="h-7 w-24" />
        <div className="flex gap-1.5">
          <Skeleton className="size-7" />
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-7 w-24" />
        </div>
      </div>
      <div className="grid gap-3 p-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-2 rounded-xl bg-card p-2.5 ring-1 ring-foreground/10">
          <div className="flex gap-1.5">
            <Skeleton className="h-6 w-14" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-24" />
          </div>
          <Skeleton className="aspect-[5/3] w-full rounded-md lg:aspect-auto lg:flex-1" />
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex gap-4 border-b pb-2">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-10" />
          </div>
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
