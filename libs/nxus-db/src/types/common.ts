import { z } from 'zod'

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const JsonPrimitiveSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
])
export type JsonPrimitive = z.infer<typeof JsonPrimitiveSchema>

export type JsonValue =
  | JsonPrimitive
  | { [key: string]: JsonValue }
  | JsonValue[]

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([JsonPrimitiveSchema, z.array(JsonValueSchema), JsonObjectSchema]),
)

export const JsonObjectSchema: z.ZodType<Record<string, JsonValue>> = z.lazy(() =>
  z.record(z.string(), JsonValueSchema),
)
export type JsonObject = z.infer<typeof JsonObjectSchema>
