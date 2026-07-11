import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { nxusActions } from '@nxus/actions'

function ok(structuredContent: object): CallToolResult {
  const content: Record<string, unknown> = { ...structuredContent }
  return {
    structuredContent: content,
    content: [{ type: 'text', text: JSON.stringify(content) }],
  }
}

function toolError(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error)
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  }
}

async function runTool(
  handler: () => Promise<object>,
): Promise<CallToolResult> {
  try {
    return ok(await handler())
  } catch (error) {
    return toolError(error)
  }
}

export function createNxusMcpServer(): McpServer {
  const server = new McpServer(
    { name: 'nxus', version: '0.1.0' },
    { capabilities: { tools: {} } },
  )

  for (const action of nxusActions) {
    server.registerTool(
      action.name,
      {
        title: action.name,
        description: action.description,
        inputSchema: action.input,
      },
      (input: unknown) => runTool(async () => action.handler(input)),
    )
  }

  return server
}
