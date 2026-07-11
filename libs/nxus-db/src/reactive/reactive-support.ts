export const REACTIVE_UNSUPPORTED_GRAPH_MESSAGE =
  'Reactive layer is SQLite-only; unsupported under ARCHITECTURE_TYPE=graph (see spec/tech/persistence.md §5 DRIFT)'

export class ReactiveUnsupportedArchitectureError extends Error {
  constructor() {
    super(REACTIVE_UNSUPPORTED_GRAPH_MESSAGE)
    this.name = 'ReactiveUnsupportedArchitectureError'
  }
}

export function assertReactiveSupported(): void {
  if (process.env.ARCHITECTURE_TYPE === 'graph') {
    throw new ReactiveUnsupportedArchitectureError()
  }
}
