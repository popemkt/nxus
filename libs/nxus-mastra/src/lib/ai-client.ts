/**
 * AI Client Facade
 *
 * Abstracts the underlying AI SDK so agents don't depend on a specific provider.
 * Currently backed by @anthropic-ai/claude-agent-sdk (supports CLI OAuth auth).
 *
 * To swap providers, change the implementation in `createDefaultClient()`.
 */

import type { z } from 'zod'

export interface StructuredGenerationOptions<S extends z.ZodType> {
  /** Zod schema describing the expected output shape */
  schema: S
  /** System prompt guiding the AI's behavior */
  system: string
  /** User prompt with the specific request */
  prompt: string
  /** Model identifier (default: claude-haiku-4-5-20251001) */
  model?: string
  /** Effort level — controls thinking depth (default: low) */
  effort?: 'low' | 'medium' | 'high' | 'max'
}

export interface AiClient {
  generateStructured: <S extends z.ZodType>(
    options: StructuredGenerationOptions<S>,
  ) => Promise<z.infer<S>>
}

/** System vars the Claude CLI subprocess needs for basic operation */
const SYSTEM_ENV_VARS = [
  'PATH',
  'HOME',
  'SHELL',
  'TERM',
  'USER',
  'LANG',
  'LC_ALL',
  'TMPDIR',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_CACHE_HOME',
  'XDG_STATE_HOME',
]

/**
 * Build a clean env for the SDK subprocess.
 * Only passes system vars + auth — avoids leaking CLAUDECODE and other vars.
 * When no API key is set, the SDK uses CLI OAuth (Claude Code subscription) automatically.
 */
function buildCleanEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {}

  // Auth — pass through if explicitly set, otherwise SDK uses CLI OAuth
  if (process.env['ANTHROPIC_API_KEY']) {
    env['ANTHROPIC_API_KEY'] = process.env['ANTHROPIC_API_KEY']
  }
  if (process.env['ANTHROPIC_AUTH_TOKEN']) {
    env['ANTHROPIC_AUTH_TOKEN'] = process.env['ANTHROPIC_AUTH_TOKEN']
  }
  if (process.env['ANTHROPIC_BASE_URL']) {
    env['ANTHROPIC_BASE_URL'] = process.env['ANTHROPIC_BASE_URL']
  }

  // System vars
  for (const key of SYSTEM_ENV_VARS) {
    if (process.env[key]) {
      env[key] = process.env[key]
    }
  }

  return env
}

const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000
const REQUEST_TIMEOUT_MS = 120_000 // 2 minutes per attempt

/** Exponential backoff with jitter */
function backoffDelay(attempt: number): number {
  const delay = BASE_DELAY_MS * Math.pow(2, attempt)
  const jitter = delay * 0.2 * Math.random()
  return delay + jitter
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createClaudeAgentSdkClient(): AiClient {
  return {
    async generateStructured<S extends z.ZodType>(
      options: StructuredGenerationOptions<S>,
    ): Promise<z.infer<S>> {
      const { query } = await import('@anthropic-ai/claude-agent-sdk')
      const { zodToJsonSchema } = await import('zod-to-json-schema')

      const jsonSchema = zodToJsonSchema(options.schema, {
        $refStrategy: 'none',
      })

      const env = buildCleanEnv()

      let lastError: Error | null = null

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const abortController = new AbortController()
        const timeout = setTimeout(
          () => abortController.abort(),
          REQUEST_TIMEOUT_MS,
        )
        try {
          for await (const message of query({
            prompt: options.prompt,
            options: {
              systemPrompt: options.system,
              model: options.model ?? 'claude-haiku-4-5-20251001',
              effort: options.effort ?? 'low',
              outputFormat: {
                type: 'json_schema',
                schema: jsonSchema,
              },
              maxTurns: 3,
              disallowedTools: [
                'Bash',
                'Read',
                'Write',
                'Edit',
                'Glob',
                'Grep',
                'Agent',
                'WebFetch',
                'WebSearch',
                'NotebookEdit',
              ],
              permissionMode: 'bypassPermissions' as const,
              allowDangerouslySkipPermissions: true,
              abortController,
              env,
            },
          })) {
            if (message.type === 'result') {
              const result = message as Record<string, unknown>
              if (result.subtype !== 'success') {
                throw new Error(
                  `AI provider returned error: ${String(result.subtype)}`,
                )
              }
              if (result.structured_output) {
                return options.schema.parse(result.structured_output)
              }
              if (typeof result.result === 'string') {
                return options.schema.parse(JSON.parse(result.result))
              }
            }
          }

          throw new Error('No structured output received from AI provider')
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error))
          if (attempt < MAX_RETRIES - 1) {
            await sleep(backoffDelay(attempt))
          }
        } finally {
          clearTimeout(timeout)
        }
      }

      throw lastError ?? new Error('AI generation failed after retries')
    },
  }
}

let _client: AiClient | null = null

/** Get the current AI client (lazily creates a Claude Agent SDK client) */
export function getAiClient(): AiClient {
  if (!_client) {
    _client = createClaudeAgentSdkClient()
  }
  return _client
}

/** Override the AI client (useful for testing or swapping providers). Pass null to reset. */
export function setAiClient(client: AiClient | null): void {
  _client = client
}
