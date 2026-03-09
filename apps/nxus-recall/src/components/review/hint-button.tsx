import { useState } from 'react'

interface HintButtonProps {
  hints: string[]
  onReveal?: () => void
}

export function HintButton({ hints, onReveal }: HintButtonProps) {
  const [revealedCount, setRevealedCount] = useState(0)

  return (
    <div>
      {revealedCount > 0 ? (
        <div className="mb-2 space-y-1">
          {hints.slice(0, revealedCount).map((hint, i) => (
            <p key={i} className="text-xs text-muted-foreground italic">
              Hint {i + 1}: {hint}
            </p>
          ))}
        </div>
      ) : null}
      {revealedCount < hints.length ? (
        <button
          onClick={() => {
            setRevealedCount((c) => c + 1)
            onReveal?.()
          }}
          className="text-xs text-primary hover:underline"
        >
          Show hint ({revealedCount + 1}/{hints.length})
        </button>
      ) : null}
    </div>
  )
}
