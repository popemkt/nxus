import type { z } from 'zod'

export interface NxusAction<TIn, TOut> {
  readonly name: string
  readonly description: string
  readonly input: z.ZodType<TIn>
  readonly output: z.ZodType<TOut>
  readonly handler: (input: unknown) => Promise<TOut>
}

export interface DefineActionOptions<TIn, TOut> {
  readonly name: string
  readonly description: string
  readonly input: z.ZodType<TIn>
  readonly output: z.ZodType<TOut>
  readonly handler: (input: TIn) => Promise<TOut>
}

export function defineAction<TIn, TOut>(
  options: DefineActionOptions<TIn, TOut>,
): NxusAction<TIn, TOut> {
  return {
    name: options.name,
    description: options.description,
    input: options.input,
    output: options.output,
    handler: async (input: unknown) => {
      const parsedInput = options.input.parse(input)
      return options.output.parse(await options.handler(parsedInput))
    },
  }
}
