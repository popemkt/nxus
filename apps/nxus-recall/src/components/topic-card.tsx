import { Card, CardHeader, CardTitle, CardContent, Badge } from '@nxus/ui'
import { BooksIcon, ClockCountdownIcon } from '@phosphor-icons/react'
import type { RecallTopic } from '../types/recall.js'

interface TopicCardProps {
  topic: RecallTopic
}

export function TopicCard({ topic }: TopicCardProps) {
  return (
    <a
      href={`/recall/topics/${topic.id}`}
      className="no-underline"
    >
      <Card className="hover:ring-foreground/20 transition-all cursor-pointer">
        <CardHeader>
          <CardTitle>{topic.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <BooksIcon className="size-3.5" />
              <span>
                {topic.conceptCount}{' '}
                {topic.conceptCount === 1 ? 'concept' : 'concepts'}
              </span>
            </span>
            {topic.dueCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <ClockCountdownIcon className="size-2.5" data-icon="inline-start" />
                {topic.dueCount} due
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </a>
  )
}
