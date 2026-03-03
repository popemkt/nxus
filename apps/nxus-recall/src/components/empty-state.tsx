import { Button } from '@nxus/ui'
import { CompassIcon, BrainIcon } from '@phosphor-icons/react'

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 mb-6">
        <BrainIcon className="size-8 text-primary" />
      </div>
      <h2 className="text-lg font-semibold text-foreground mb-2">
        No topics yet
      </h2>
      <p className="text-sm text-muted-foreground max-w-sm mb-8">
        Start by exploring a topic. The AI will generate key concepts for you to
        learn through spaced repetition.
      </p>
      <a href="/recall/explore" className="no-underline">
        <Button size="lg">
          <CompassIcon data-icon="inline-start" />
          Explore a Topic
        </Button>
      </a>
    </div>
  )
}
