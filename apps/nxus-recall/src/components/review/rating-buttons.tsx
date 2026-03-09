import { formatInterval } from '@/lib/format'

const RATING_LABELS: Record<1 | 2 | 3 | 4, { label: string; color: string }> = {
  1: { label: 'Again', color: 'bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20' },
  2: { label: 'Hard', color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 hover:bg-orange-500/20' },
  3: { label: 'Good', color: 'bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20' },
  4: { label: 'Easy', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20' },
}

interface RatingButtonsProps {
  intervals: Record<1 | 2 | 3 | 4, number> | null
  onRate: (rating: 1 | 2 | 3 | 4) => void
  disabled?: boolean
}

export function RatingButtons({ intervals, onRate, disabled }: RatingButtonsProps) {
  return (
    <div>
      <p className="mb-3 text-sm font-medium flex items-center gap-2">
        How well did you know this?
        <span className="text-[10px] text-muted-foreground">
          Press <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">1</kbd>-<kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">4</kbd>
        </span>
      </p>
      <div className="grid grid-cols-4 gap-3">
        {([1, 2, 3, 4] as const).map((rating) => {
          const info = RATING_LABELS[rating]
          const interval = intervals?.[rating]
          return (
            <button
              key={rating}
              onClick={() => onRate(rating)}
              disabled={disabled}
              className={`rounded-xl border border-border p-4 text-center transition-all ${info.color} disabled:opacity-50`}
            >
              <div className="text-sm font-semibold">{info.label}</div>
              <div className="mt-0.5 text-[10px] opacity-50">{rating}</div>
              {interval !== undefined ? (
                <div className="mt-1 text-[10px] opacity-70">
                  {formatInterval(interval)}
                </div>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
