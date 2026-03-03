import { createFileRoute } from '@tanstack/react-router'
import { HouseIcon } from '@phosphor-icons/react'

export const Route = createFileRoute('/')({
  component: RecallDashboard,
})

function RecallDashboard() {
  return (
    <div className="relative min-h-screen bg-background">
      {/* Home button - navigates to gateway */}
      <a
        href="/"
        className="fixed top-4 left-4 z-50 flex size-9 items-center justify-center rounded-full bg-background/85 backdrop-blur-xl border border-foreground/10 text-muted-foreground hover:text-foreground hover:bg-background transition-colors shadow-sm no-underline"
        title="Home"
      >
        <HouseIcon className="size-4" />
      </a>

      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <h1 className="text-4xl font-bold text-foreground">Recall</h1>
        <p className="text-muted-foreground">Spaced repetition learning — coming soon</p>
      </div>
    </div>
  )
}
