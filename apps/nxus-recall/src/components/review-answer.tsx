import { useState, useCallback } from 'react'
import { PaperPlaneRightIcon } from '@phosphor-icons/react'
import { Button, Textarea } from '@nxus/ui'

interface ReviewAnswerProps {
  onSubmit: (answer: string) => void
  isSubmitting: boolean
}

export function ReviewAnswer({ onSubmit, isSubmitting }: ReviewAnswerProps) {
  const [answer, setAnswer] = useState('')

  const canSubmit = answer.trim().length > 0 && !isSubmitting

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return
    onSubmit(answer.trim())
  }, [answer, canSubmit, onSubmit])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && e.metaKey && canSubmit) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [canSubmit, handleSubmit],
  )

  return (
    <div className="space-y-3">
      <Textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type your answer..."
        rows={5}
        autoFocus
        disabled={isSubmitting}
        className="resize-y"
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Press ⌘+Enter to submit
        </p>
        <Button onClick={handleSubmit} disabled={!canSubmit}>
          <PaperPlaneRightIcon data-icon="inline-start" />
          {isSubmitting ? 'Evaluating...' : 'Submit Answer'}
        </Button>
      </div>
    </div>
  )
}
