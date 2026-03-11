import { useEffect, useRef, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import { Extension } from '@tiptap/core'
import { cn } from '@nxus/ui'

/**
 * Callbacks for outline-level operations triggered by keyboard shortcuts
 * inside the Tiptap editor. These are handled by node-block.tsx.
 */
export interface OutlineKeyboardCallbacks {
  onEnter: (contentBefore: string, contentAfter: string) => void
  onBackspaceAtStart: (currentContent: string) => void
  onBackspaceEmpty: () => void
  onTab: () => void
  onShiftTab: () => void
  onArrowUpAtStart: () => void
  onArrowDownAtEnd: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onCollapseToggle: (direction: 'up' | 'down') => void
  onUndo: () => void
  onRedo: () => void
}

/**
 * Custom Tiptap extension that intercepts outline-specific keyboard shortcuts
 * and delegates them to the parent NodeBlock via callbacks.
 */
function createOutlineKeymapExtension(callbacksRef: React.RefObject<OutlineKeyboardCallbacks>) {
  return Extension.create({
    name: 'outlineKeymap',

    addKeyboardShortcuts() {
      return {
        'Enter': ({ editor }) => {
          const { from } = editor.state.selection
          // Get text content before/after cursor for node splitting
          const fullText = editor.getText()
          const doc = editor.state.doc
          // Calculate offset within text content (excluding tags)
          let textOffset = 0
          let found = false
          doc.descendants((node, pos) => {
            if (found) return false
            if (node.isText) {
              const nodeEnd = pos + node.nodeSize
              if (from <= nodeEnd) {
                textOffset += from - pos
                found = true
                return false
              }
              textOffset += node.nodeSize
            }
            return true
          })
          if (!found) textOffset = fullText.length

          const beforeText = fullText.slice(0, textOffset)
          const afterText = fullText.slice(textOffset)

          callbacksRef.current.onEnter(beforeText, afterText)
          return true
        },

        'Shift-Enter': () => {
          // Allow Shift+Enter for line breaks within a node
          return false
        },

        'Tab': () => {
          callbacksRef.current.onTab()
          return true
        },

        'Shift-Tab': () => {
          callbacksRef.current.onShiftTab()
          return true
        },

        'Backspace': ({ editor }) => {
          const { from, empty } = editor.state.selection
          const text = editor.getText()

          if (text === '' && empty) {
            callbacksRef.current.onBackspaceEmpty()
            return true
          }

          if (from <= 1 && empty) {
            callbacksRef.current.onBackspaceAtStart(text)
            return true
          }

          return false // Let Tiptap handle normal backspace
        },

        'ArrowUp': ({ editor }) => {
          // Only intercept when cursor is at the start of the document
          const { from } = editor.state.selection
          if (from <= 1) {
            callbacksRef.current.onArrowUpAtStart()
            return true
          }
          return false
        },

        'ArrowDown': ({ editor }) => {
          const { from } = editor.state.selection
          const docSize = editor.state.doc.content.size
          // At end of document (accounting for paragraph wrapping)
          if (from >= docSize - 1) {
            callbacksRef.current.onArrowDownAtEnd()
            return true
          }
          return false
        },

        'Mod-Shift-ArrowUp': () => {
          callbacksRef.current.onMoveUp()
          return true
        },

        'Mod-Shift-ArrowDown': () => {
          callbacksRef.current.onMoveDown()
          return true
        },

        'Mod-ArrowUp': () => {
          callbacksRef.current.onCollapseToggle('up')
          return true
        },

        'Mod-ArrowDown': () => {
          callbacksRef.current.onCollapseToggle('down')
          return true
        },

        'Mod-z': ({ editor }) => {
          // Let Tiptap handle text undo if it has history
          if (editor.can().undo()) {
            return false
          }
          // Otherwise, trigger structural undo
          callbacksRef.current.onUndo()
          return true
        },

        'Mod-Shift-z': ({ editor }) => {
          // Let Tiptap handle text redo if it has history
          if (editor.can().redo()) {
            return false
          }
          // Otherwise, trigger structural redo
          callbacksRef.current.onRedo()
          return true
        },
      }
    },
  })
}

interface TiptapNodeEditorProps {
  content: string
  isActive: boolean
  cursorPosition: number
  outlineCallbacks: OutlineKeyboardCallbacks
  onChange: (content: string) => void
  onActivate: (cursorPos?: number) => void
  /** Called when '#' is pressed — opens the supertag menu */
  onHashKey?: () => void
  /** Called when '>' is pressed — opens the field menu */
  onAngleBracketKey?: () => void
  /** When true, all keyboard events are forwarded to onMenuKeyDown instead of being handled by Tiptap */
  menuOpen?: boolean
  /** Receives keyboard events when menuOpen is true */
  onMenuKeyDown?: (e: KeyboardEvent) => void
  className?: string
}

/**
 * Tiptap editor instance for a single outline node.
 *
 * When active: fully editable with rich text formatting.
 * When inactive: read-only display of content.
 *
 * Preserves the unified plane UX — no visual distinction between
 * editable and non-editable state.
 */
export function TiptapNodeEditor({
  content,
  isActive,
  cursorPosition,
  outlineCallbacks,
  onChange,
  onActivate,
  onHashKey,
  onAngleBracketKey,
  menuOpen,
  onMenuKeyDown,
  className,
}: TiptapNodeEditorProps) {
  const callbacksRef = useRef<OutlineKeyboardCallbacks>(outlineCallbacks)
  callbacksRef.current = outlineCallbacks

  const menuOpenRef = useRef(menuOpen ?? false)
  menuOpenRef.current = menuOpen ?? false

  const onMenuKeyDownRef = useRef(onMenuKeyDown)
  onMenuKeyDownRef.current = onMenuKeyDown

  const onHashKeyRef = useRef(onHashKey)
  onHashKeyRef.current = onHashKey

  const onAngleBracketKeyRef = useRef(onAngleBracketKey)
  onAngleBracketKeyRef.current = onAngleBracketKey

  const wasActive = useRef(false)
  const isSettingContent = useRef(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable heading — outline nodes don't use headings
        heading: false,
        // Single paragraph per node — no multi-block content
        // Horizontal rule, blockquote, codeBlock disabled for outline simplicity
        horizontalRule: false,
        blockquote: false,
        codeBlock: false,
        // Keep: bold, italic, strike, code (inline), paragraph, text, hardBreak, history
      }),
      Underline,
      Placeholder.configure({
        placeholder: '',
        showOnlyWhenEditable: false,
      }),
      createOutlineKeymapExtension(callbacksRef),
    ],
    content: contentToTiptap(content),
    editable: isActive,
    editorProps: {
      attributes: {
        class: cn(
          'outline-none',
          'text-[14.5px] leading-[1.6]',
          'text-foreground/85',
          'caret-foreground/70',
          '[&_p]:m-0',
          '[&_strong]:font-semibold',
          '[&_code]:rounded [&_code]:bg-foreground/8 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[13px] [&_code]:font-mono',
        ),
      },
      /**
       * Intercepts key events before ProseMirror's keymap plugin.
       * Used for:
       * 1. Forwarding all keys to the menu handler when a menu is open
       * 2. Triggering '#' and '>' menus
       */
      handleKeyDown: (_view, event) => {
        // When a menu is open, forward all key events to the menu handler
        if (menuOpenRef.current && onMenuKeyDownRef.current) {
          onMenuKeyDownRef.current(event)
          return true
        }

        // Trigger supertag menu on '#'
        if (event.key === '#' && !event.metaKey && !event.ctrlKey && !event.altKey) {
          onHashKeyRef.current?.()
          return true
        }

        // Trigger field menu on '>'
        if (event.key === '>' && !event.metaKey && !event.ctrlKey && !event.altKey) {
          onAngleBracketKeyRef.current?.()
          return true
        }

        return false
      },
    },
    onUpdate: ({ editor }) => {
      if (isSettingContent.current) return
      const text = editor.getText()
      onChange(text)
    },
    // Prevent Tiptap from managing its own undo when we have outline-level undo planned
    immediatelyRender: false,
  })

  // Sync editable state
  useEffect(() => {
    if (!editor) return
    editor.setEditable(isActive)
  }, [editor, isActive])

  // Handle activation: set content and focus with cursor position
  useEffect(() => {
    if (!editor) return

    if (isActive) {
      if (!wasActive.current) {
        // First becoming active — sync content from store
        isSettingContent.current = true
        editor.commands.setContent(contentToTiptap(content))
        isSettingContent.current = false
      }
      wasActive.current = true

      // Focus and set cursor position
      editor.commands.focus()
      const docSize = editor.state.doc.content.size
      // Convert plain text offset to Tiptap position (add 1 for paragraph opening)
      const pos = Math.min(cursorPosition + 1, docSize - 1)
      if (pos > 0) {
        editor.commands.setTextSelection(pos)
      }
    } else {
      if (wasActive.current) {
        // Becoming inactive — update content from store (may have changed via merge)
        isSettingContent.current = true
        editor.commands.setContent(contentToTiptap(content))
        isSettingContent.current = false
      }
      wasActive.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, isActive, cursorPosition])

  // Sync content from store when not active (e.g., after merge from another node)
  useEffect(() => {
    if (!editor || isActive) return
    isSettingContent.current = true
    editor.commands.setContent(contentToTiptap(content))
    isSettingContent.current = false
  }, [editor, content, isActive])

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isActive) {
        // Delay to let browser set selection
        requestAnimationFrame(() => {
          if (editor) {
            const sel = window.getSelection()
            if (sel && sel.rangeCount > 0) {
              onActivate(sel.focusOffset)
            } else {
              onActivate(content.length)
            }
          } else {
            onActivate(content.length)
          }
        })
      }
      e.stopPropagation()
    },
    [isActive, editor, onActivate, content.length],
  )

  if (!editor) return null

  return (
    <div
      className={cn('flex-1 min-w-0', className)}
      onClick={handleClick}
    >
      <EditorContent
        editor={editor}
        className={cn(
          !content && !isActive && '[&_.tiptap]:text-foreground/25',
        )}
      />
    </div>
  )
}

/**
 * Convert stored content string to Tiptap-compatible format.
 * Plain text → wrapped in paragraph tags.
 * HTML content → passed through.
 */
function contentToTiptap(content: string): string {
  if (!content) return '<p></p>'
  // If content looks like HTML, pass through
  if (content.startsWith('<')) return content
  // Plain text — wrap in paragraph
  return `<p>${escapeHtml(content)}</p>`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
