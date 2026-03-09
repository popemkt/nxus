import { useMutation } from '@tanstack/react-query'
import { SpinnerGap, Lightbulb } from '@phosphor-icons/react'
import { explainFurtherServerFn } from '@/services/explain-further.server'

interface ExplainFurtherProps {
  conceptTitle: string
  questionText: string
  modelAnswer: string
  keyInsightsMissed: string[]
  userAnswer: string
}

export function ExplainFurther({
  conceptTitle,
  questionText,
  modelAnswer,
  keyInsightsMissed,
  userAnswer,
}: ExplainFurtherProps) {
  const explainMutation = useMutation({
    mutationFn: async () => {
      const result = await explainFurtherServerFn({
        data: {
          conceptTitle,
          questionText,
          modelAnswer,
          keyInsightsMissed,
          userAnswer,
        },
      })
      if (result.success) {
        return result.explanation
      }
      throw new Error(result.error)
    },
  })

  return (
    <div className="mb-6">
      <button
        onClick={() => explainMutation.mutate()}
        disabled={explainMutation.isPending || explainMutation.isSuccess}
        className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
      >
        {explainMutation.isPending ? (
          <SpinnerGap size={16} className="animate-spin" />
        ) : (
          <Lightbulb size={16} />
        )}
        Explain Further
      </button>
      {explainMutation.isSuccess && explainMutation.data ? (
        <div className="mt-3 rounded-xl border border-border bg-muted/50 p-4">
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {explainMutation.data}
          </p>
        </div>
      ) : null}
      {explainMutation.isError ? (
        <p className="mt-2 text-xs text-red-500">
          Failed to generate explanation. Try again.
        </p>
      ) : null}
    </div>
  )
}
