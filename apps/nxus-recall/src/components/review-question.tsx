import { Card, CardContent, CardHeader, CardTitle } from '@nxus/ui'
import { BloomsBadge } from './blooms-badge.js'
import type { GeneratedQuestion } from '../types/ai.js'
import type { RecallConcept } from '../types/recall.js'

interface ReviewQuestionProps {
  concept: RecallConcept
  question: GeneratedQuestion
}

export function ReviewQuestion({ concept, question }: ReviewQuestionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>{concept.topicName}</span>
          <span className="text-muted-foreground/40">/</span>
          <span className="text-foreground font-medium">{concept.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <BloomsBadge level={question.questionType} />
        </div>
      </CardHeader>
      <CardContent>
        <CardTitle className="text-lg font-medium leading-relaxed">
          {question.questionText}
        </CardTitle>
      </CardContent>
    </Card>
  )
}
