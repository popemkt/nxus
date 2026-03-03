import { Card, CardContent } from '@nxus/ui'
import { ChatCircleDotsIcon } from '@phosphor-icons/react'
import { FSRS_RATING_LABELS, type FsrsRating } from '../types/recall.js'

const SUGGESTED_RATING_COLORS: Record<FsrsRating, string> = {
  1: 'border-red-500/30 bg-red-500/5',
  2: 'border-orange-500/30 bg-orange-500/5',
  3: 'border-green-500/30 bg-green-500/5',
  4: 'border-blue-500/30 bg-blue-500/5',
}

interface ReviewFeedbackProps {
  feedback: string
  suggestedRating: FsrsRating
}

export function ReviewFeedback({ feedback, suggestedRating }: ReviewFeedbackProps) {
  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <ChatCircleDotsIcon className="size-5 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground mb-1.5">AI Feedback</p>
              <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{feedback}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div
        className={`rounded-lg border px-3 py-2 ${SUGGESTED_RATING_COLORS[suggestedRating]}`}
      >
        <p className="text-xs text-muted-foreground">
          Suggested rating:{' '}
          <strong className="text-foreground">{FSRS_RATING_LABELS[suggestedRating]}</strong>
        </p>
      </div>
    </div>
  )
}
