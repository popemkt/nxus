import { FSRS_RATING_LABELS, type FsrsRating, type IntervalsPreview } from '../types/recall.js'

const RATING_COLORS: Record<FsrsRating, string> = {
  1: 'bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/20',
  2: 'bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-500/20',
  3: 'bg-green-500/10 hover:bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/20',
  4: 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/20',
}

const SUGGESTED_RING: Record<FsrsRating, string> = {
  1: 'ring-2 ring-red-500/40',
  2: 'ring-2 ring-orange-500/40',
  3: 'ring-2 ring-green-500/40',
  4: 'ring-2 ring-blue-500/40',
}

function formatInterval(days: number): string {
  if (days < 1) {
    const minutes = Math.round(days * 24 * 60)
    if (minutes < 60) return `${minutes}m`
    return `${Math.round(minutes / 60)}h`
  }
  if (days < 30) return `${Math.round(days)}d`
  if (days < 365) return `${Math.round(days / 30)}mo`
  return `${(days / 365).toFixed(1)}y`
}

interface RatingButtonsProps {
  onRate: (rating: FsrsRating) => void
  intervals: IntervalsPreview | null
  suggestedRating: FsrsRating
  disabled?: boolean
}

const RATINGS: FsrsRating[] = [1, 2, 3, 4]

export function RatingButtons({ onRate, intervals, suggestedRating, disabled }: RatingButtonsProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground text-center">Rate your recall</p>
      <div className="grid grid-cols-4 gap-2">
        {RATINGS.map((rating) => {
          const isSuggested = rating === suggestedRating
          const intervalText = intervals
            ? formatInterval(intervals[rating].scheduledDays)
            : null

          return (
            <button
              key={rating}
              onClick={() => onRate(rating)}
              disabled={disabled}
              className={`
                flex flex-col items-center gap-1 rounded-lg border px-3 py-3
                transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed
                ${RATING_COLORS[rating]}
                ${isSuggested ? SUGGESTED_RING[rating] : ''}
              `}
            >
              <span className="text-sm font-medium">{FSRS_RATING_LABELS[rating]}</span>
              {intervalText && (
                <span className="text-xs opacity-70">{intervalText}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
