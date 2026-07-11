import { z } from 'zod'

/**
 * Checkbox/todo state — three states total: a node with NO todoState
 * property is not a todo at all; 'todo' renders an unchecked box; 'done'
 * renders checked. Mirrors Tana's todoState (TIF v0.1 'todo' | 'done').
 */
export const TodoStateSchema = z.enum(['todo', 'done'])

export type TodoState = z.infer<typeof TodoStateSchema>

export const TODO_STATES = TodoStateSchema.options
