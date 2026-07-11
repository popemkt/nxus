import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createNxusMcpServer } from './index.ts'

export async function handleNxusMcpHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const server = createNxusMcpServer()
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  })

  try {
    await server.connect(transport)
    await transport.handleRequest(req, res)
  } finally {
    await server.close()
  }
}
