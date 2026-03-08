import { cn } from '@nxus/ui'

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded bg-muted', className)}
      {...props}
    />
  )
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="mb-2 flex items-center gap-2">
        <Skeleton className="h-5 w-5 rounded" />
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="h-8 w-12" />
    </div>
  )
}

export function TopicCardSkeleton() {
  return (
    <div className="rounded-xl border border-border p-5">
      <Skeleton className="mb-3 h-5 w-3/4" />
      <Skeleton className="mb-2 h-3 w-full" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  )
}

export function ConceptRowSkeleton() {
  return (
    <div className="rounded-xl border border-border p-5">
      <Skeleton className="mb-3 h-5 w-2/3" />
      <Skeleton className="mb-2 h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  )
}
