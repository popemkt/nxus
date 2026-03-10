import type { GeneratedQuestion } from '@nxus/mastra'

interface QuestionInputProps {
  question: GeneratedQuestion
  value: string
  onChange: (v: string) => void
  onAutoSubmit?: () => void
}

export function QuestionInput({ question, value, onChange, onAutoSubmit }: QuestionInputProps) {
  const handleChange = (v: string) => {
    onChange(v)
    if (onAutoSubmit) {
      const isAutoSubmit =
        question.questionType === 'multiple-choice' ||
        question.questionType === 'true-false'
      if (isAutoSubmit && v.trim()) {
        setTimeout(onAutoSubmit, 150)
      }
    }
  }

  switch (question.questionType) {
    case 'multiple-choice':
      return (
        <div className="space-y-2">
          {question.choices.map((choice: string, i: number) => (
            <button
              key={i}
              onClick={() => handleChange(String(i))}
              className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
                value === String(i)
                  ? 'border-primary bg-primary/5 text-foreground'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/50'
              }`}
            >
              <span className="mr-2 font-medium">{String.fromCharCode(65 + i)}.</span>
              {choice}
            </button>
          ))}
        </div>
      )

    case 'true-false':
      return (
        <div className="flex gap-3">
          {(['true', 'false'] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => handleChange(opt)}
              className={`flex-1 rounded-lg border p-4 text-center text-sm font-medium transition-colors ${
                value === opt
                  ? 'border-primary bg-primary/5 text-foreground'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/50'
              }`}
            >
              {opt === 'true' ? 'True' : 'False'}
            </button>
          ))}
        </div>
      )

    case 'fill-blank':
      return (
        <input
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Fill in the blank..."
          className="w-full rounded-lg border border-input bg-background p-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          autoFocus
        />
      )

    case 'free-response':
    default:
      return (
        <textarea
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Type your answer..."
          rows={6}
          className="w-full rounded-lg border border-input bg-background p-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
          autoFocus
        />
      )
  }
}
