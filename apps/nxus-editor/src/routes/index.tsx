import { createFileRoute } from '@tanstack/react-router'
import { useCallback } from 'react'
import { OutlineEditor } from '@/components/outline/outline-editor'
import {
  getNodeTreeServerFn,
  getOrCreateDayNodeServerFn,
} from '@/services/outline.server'
import { useNavigateToNode } from '@/hooks/use-navigate-to-node'
import { useOutlineStore } from '@/stores/outline.store'
import { WORKSPACE_ROOT_ID, type OutlineNode } from '@/types/outline'

export const Route = createFileRoute('/')({
  component: EditorPage,
  validateSearch: (search: Record<string, unknown>): { node?: string } => ({
    node: typeof search.node === 'string' ? search.node : undefined,
  }),
})

function EditorPage() {
  const navigateToNode = useNavigateToNode()

  // Daily note: zoom to today's #Day node, creating it on first visit.
  // The outline store loads the workspace tree ONCE on mount, so a node
  // created server-side after that is invisible to zoom until its subtree
  // is fetched and merged into the store — do that before navigating.
  const goToToday = useCallback(async () => {
    try {
      const now = new Date()
      const yyyy = now.getFullYear()
      const mm = String(now.getMonth() + 1).padStart(2, '0')
      const dd = String(now.getDate()).padStart(2, '0')
      const result = await getOrCreateDayNodeServerFn({
        data: { date: `${yyyy}-${mm}-${dd}` },
      })
      if (!result.success) return

      const tree = await getNodeTreeServerFn({ data: { nodeId: result.nodeId } })
      if ('success' in tree && tree.success) {
        useOutlineStore.setState((state) => {
          const next = new Map(state.nodes)
          for (const n of tree.nodes as OutlineNode[]) {
            next.set(n.id, {
              id: n.id,
              content: n.content,
              parentId: n.parentId,
              children: n.children,
              order: n.order,
              createdAt: n.createdAt,
              collapsed: n.collapsed,
              supertags: n.supertags,
              fields: n.fields ?? [],
            })
          }
          // Day nodes are top-level: attach under the virtual workspace root
          const root = next.get(WORKSPACE_ROOT_ID)
          if (root && !root.children.includes(result.nodeId)) {
            next.set(WORKSPACE_ROOT_ID, {
              ...root,
              children: [...root.children, result.nodeId],
            })
          }
          return { nodes: next }
        })
      }
      navigateToNode(result.nodeId)
    } catch (err) {
      console.error('[today] Failed to open daily note:', err)
    }
  }, [navigateToNode])

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Top bar */}
      <header className="flex h-11 shrink-0 items-center border-b border-foreground/[0.06] px-4">
        <span className="text-[13px] font-medium text-foreground/50">
          nXus Editor
        </span>
        <button
          type="button"
          onClick={goToToday}
          data-testid="today-button"
          className="ml-auto rounded-md px-2 py-1 text-[13px] font-medium text-foreground/60 transition-colors hover:bg-foreground/[0.06] hover:text-foreground cursor-pointer"
        >
          Today
        </button>
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
