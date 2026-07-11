import { getAction, nxusActions } from '@nxus/actions'

export interface NxusRestRequest {
  method: string
  path: string
  body?: unknown
}

export interface NxusRestSuccess {
  success: true
  data: unknown
}

export interface NxusRestFailure {
  success: false
  error: string
}

export interface NxusRestResult {
  status: number
  body: NxusRestSuccess | NxusRestFailure
}

interface NxusRestActionDescription {
  name: string
  description: string
  inputSchema: object
}

function failure(status: number, error: string): NxusRestResult {
  return { status, body: { success: false, error } }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function executionStatus(message: string): number {
  return /^(?:Node|Supertag) not found:/.test(message) ? 404 : 422
}

function getActionId(path: string): string | undefined {
  const match = /^\/actions\/([^/]+)$/.exec(path)
  if (!match) return undefined
  try {
    return decodeURIComponent(match[1])
  } catch {
    // Malformed percent-encoding ("/actions/%") — not a route, not a crash.
    return undefined
  }
}

function listActions(): NxusRestActionDescription[] {
  return nxusActions.map((action) => ({
    name: action.name,
    description: action.description,
    inputSchema: action.input.toJSONSchema(),
  }))
}

/**
 * Maps the REST transport contract onto the action registry without adding
 * action-specific routing or business logic.
 */
export async function dispatchNxusRestRequest(request: NxusRestRequest): Promise<NxusRestResult> {
  if (request.method === 'GET' && request.path === '/actions') {
    return { status: 200, body: { success: true, data: { actions: listActions() } } }
  }

  const actionId = getActionId(request.path)
  if (!actionId) {
    return failure(404, 'Route not found')
  }

  if (request.method !== 'POST') {
    return failure(405, 'Method not allowed')
  }

  const action = getAction(actionId)
  if (!action) {
    return failure(404, `Action not found: ${actionId}`)
  }

  const parsedInput = action.input.safeParse(request.body)
  if (!parsedInput.success) {
    return failure(400, parsedInput.error.message)
  }

  try {
    return { status: 200, body: { success: true, data: await action.handler(parsedInput.data) } }
  } catch (error) {
    const message = errorMessage(error)
    return failure(executionStatus(message), message)
  }
}

function jsonResponse(result: NxusRestResult): Response {
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

/** Fetch-style handler suitable for mounting in any HTTP host. */
export async function handleNxusRestRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)

  if (request.method === 'POST' && /^\/actions\/[^/]+$/.test(url.pathname)) {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return jsonResponse(failure(400, 'Malformed JSON body'))
    }
    return jsonResponse(await dispatchNxusRestRequest({
      method: request.method,
      path: url.pathname,
      body,
    }))
  }

  return jsonResponse(await dispatchNxusRestRequest({
    method: request.method,
    path: url.pathname,
  }))
}
