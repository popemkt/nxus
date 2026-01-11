/**
 * PTY Server Functions
 *
 * TanStack Start server functions for interactive terminal communication.
 * These provide HTTP-based bidirectional communication with PTY sessions.
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  createPtySession,
  getPtySession,
  writePtySession,
  resizePtySession,
  closePtySession,
  getPtySessionBuffer,
} from './pty-session-manager.server'

// ============================================================================
// Types
// ============================================================================

export type PtyOutputChunk =
  | { type: 'data'; data: string }
  | { type: 'exit'; exitCode: number }
  | { type: 'error'; message: string }
  | { type: 'empty' }

// ============================================================================
// Create PTY Session
// ============================================================================

const CreatePtySessionInputSchema = z.object({
  cwd: z.string().optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  /** Full command to execute in shell (shell handles parsing) */
  shellCommand: z.string().optional(),
  cols: z.number().optional(),
  rows: z.number().optional(),
})

export const createPtySessionServerFn = createServerFn({ method: 'POST' })
  .inputValidator(CreatePtySessionInputSchema)
  .handler(async (ctx) => {
    console.log('[createPtySessionServerFn] Input:', ctx.data)
    try {
      const session = createPtySession(ctx.data)
      console.log('[createPtySessionServerFn] Success:', session.id)
      return {
        success: true as const,
        sessionId: session.id,
        shell: session.shell,
        cwd: session.cwd,
      }
    } catch (error) {
      console.error('[createPtySessionServerFn] Failed:', error)
      return {
        success: false as const,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to create PTY session',
      }
    }
  })

// ============================================================================
// Write to PTY Session
// ============================================================================

const WritePtySessionInputSchema = z.object({
  sessionId: z.string(),
  data: z.string(),
})

export const writePtySessionServerFn = createServerFn({ method: 'POST' })
  .inputValidator(WritePtySessionInputSchema)
  .handler(async (ctx) => {
    const { sessionId, data } = ctx.data
    const success = writePtySession(sessionId, data)
    if (!success) console.warn('[writePtySessionServerFn] Failed:', sessionId)
    return { success }
  })

// ============================================================================
// Poll PTY Output (replaces streaming - TanStack doesn't support true streaming)
// ============================================================================

const PollPtyOutputInputSchema = z.object({
  sessionId: z.string(),
  /** Cursor position - returns data after this index */
  cursor: z.number().optional(),
})

/**
 * Poll for PTY output.
 * Returns buffered output since the last cursor position.
 * Client should poll this repeatedly.
 */
export const pollPtyOutputServerFn = createServerFn({ method: 'POST' })
  .inputValidator(PollPtyOutputInputSchema)
  .handler(
    async (
      ctx,
    ): Promise<{
      chunks: PtyOutputChunk[]
      cursor: number
      isAlive: boolean
    }> => {
      const { sessionId, cursor = 0 } = ctx.data

      const session = getPtySession(sessionId)
      if (!session) {
        return {
          chunks: [{ type: 'error', message: 'Session not found' }],
          cursor: 0,
          isAlive: false,
        }
      }

      // Get all buffered output
      const buffer = getPtySessionBuffer(sessionId) || ''

      // Return only new data since cursor
      const newData = buffer.slice(cursor)
      const newCursor = buffer.length

      const chunks: PtyOutputChunk[] = []

      if (newData.length > 0) {
        chunks.push({ type: 'data', data: newData })
      }

      // If session ended, include exit info
      if (!session.isAlive) {
        chunks.push({ type: 'exit', exitCode: 0 }) // TODO: capture actual exit code
      }

      return {
        chunks,
        cursor: newCursor,
        isAlive: session.isAlive,
      }
    },
  )

// Keep the old function for backwards compatibility but mark deprecated
/** @deprecated Use pollPtyOutputServerFn instead */
export const streamPtyOutputServerFn = pollPtyOutputServerFn

// ============================================================================
// Resize PTY Session
// ============================================================================

const ResizePtySessionInputSchema = z.object({
  sessionId: z.string(),
  cols: z.number(),
  rows: z.number(),
})

export const resizePtySessionServerFn = createServerFn({ method: 'POST' })
  .inputValidator(ResizePtySessionInputSchema)
  .handler(async (ctx) => {
    console.log('[resizePtySessionServerFn] Input:', ctx.data)
    const { sessionId, cols, rows } = ctx.data
    const success = resizePtySession(sessionId, cols, rows)
    return { success }
  })

// ============================================================================
// Close PTY Session
// ============================================================================

const ClosePtySessionInputSchema = z.object({
  sessionId: z.string(),
})

export const closePtySessionServerFn = createServerFn({ method: 'POST' })
  .inputValidator(ClosePtySessionInputSchema)
  .handler(async (ctx) => {
    console.log('[closePtySessionServerFn] Input:', ctx.data)
    const { sessionId } = ctx.data
    const success = closePtySession(sessionId)
    return { success }
  })

// ============================================================================
// Get Session Status
// ============================================================================

const GetPtySessionStatusInputSchema = z.object({
  sessionId: z.string(),
})

export const getPtySessionStatusServerFn = createServerFn({ method: 'POST' })
  .inputValidator(GetPtySessionStatusInputSchema)
  .handler(async (ctx) => {
    const session = getPtySession(ctx.data.sessionId)
    if (!session) {
      return { exists: false as const }
    }
    return {
      exists: true as const,
      isAlive: session.isAlive,
      shell: session.shell,
      cwd: session.cwd,
    }
  })
