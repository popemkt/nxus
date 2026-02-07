export interface MiniApp {
  id: string
  name: string
  description: string
  icon: 'cube' | 'graph' | 'calendar'
  path: string
  port: number
}

export const miniApps: MiniApp[] = [
  {
    id: 'nxus-core',
    name: 'nXus Core',
    description:
      'Central hub for managing applications, dependencies, and system configuration.',
    icon: 'cube',
    path: '/core',
    port: 3000,
  },
  {
    id: 'nxus-workbench',
    name: 'nXus Workbench',
    description:
      'Visual node editor for building and exploring graph-based workflows.',
    icon: 'graph',
    path: '/workbench',
    port: 3002,
  },
]
