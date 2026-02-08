import { describe, it, expect } from 'vitest'
import { miniApps } from './mini-apps.js'
import type { MiniApp } from './mini-apps.js'

describe('miniApps configuration', () => {
  it('has the expected number of mini apps', () => {
    expect(miniApps).toHaveLength(3)
  })

  it('contains nxus-core', () => {
    const core = miniApps.find((app) => app.id === 'nxus-core')
    expect(core).toBeDefined()
    expect(core!.name).toBe('nXus Core')
    expect(core!.path).toBe('/core')
    expect(core!.icon).toBe('cube')
  })

  it('contains nxus-workbench', () => {
    const workbench = miniApps.find((app) => app.id === 'nxus-workbench')
    expect(workbench).toBeDefined()
    expect(workbench!.name).toBe('nXus Workbench')
    expect(workbench!.path).toBe('/workbench')
    expect(workbench!.icon).toBe('graph')
  })

  it('contains nxus-calendar', () => {
    const calendar = miniApps.find((app) => app.id === 'nxus-calendar')
    expect(calendar).toBeDefined()
    expect(calendar!.name).toBe('nXus Calendar')
    expect(calendar!.path).toBe('/calendar')
    expect(calendar!.icon).toBe('calendar')
  })

  it('all apps have unique IDs', () => {
    const ids = miniApps.map((app) => app.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all apps have unique paths', () => {
    const paths = miniApps.map((app) => app.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('all paths start with /', () => {
    for (const app of miniApps) {
      expect(app.path.startsWith('/')).toBe(true)
    }
  })

  it('all apps have non-empty names and descriptions', () => {
    for (const app of miniApps) {
      expect(app.name.length).toBeGreaterThan(0)
      expect(app.description.length).toBeGreaterThan(0)
    }
  })

  it('all icons are valid', () => {
    const validIcons = ['cube', 'graph', 'calendar']
    for (const app of miniApps) {
      expect(validIcons).toContain(app.icon)
    }
  })
})
