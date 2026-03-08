import { createFileRoute } from '@tanstack/react-router'
import { OutlineEditor } from '@/components/outline/outline-editor'

export const Route = createFileRoute('/')({
  component: EditorPage,
})

function EditorPage() {
  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Top bar */}
      <header className="flex h-11 shrink-0 items-center border-b border-foreground/[0.06] px-4">
        <span className="text-[13px] font-medium text-foreground/50">
          nXus Editor
        </span>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        <div className="mx-auto h-full max-w-3xl px-4">
          <OutlineEditor />
        </div>
      </main>
    </div>
  )
}
