import { z } from 'zod'

export const BaseTypeSchema = z.enum(['task', 'person', 'event', 'day', 'flashcard'])

export type BaseType = z.infer<typeof BaseTypeSchema>

export const BASE_TYPES = BaseTypeSchema.options
