import { beforeEach, describe, expect, it } from 'vitest'

import { useLayoutStore } from './layout.store'

describe('Layout Store', () => {
  beforeEach(() => {
    // Reset store to defaults before each test
    useLayoutStore.setState({
      listSupertag: null,
      listInspector: null,
      queryInspector: null,
      graphInspector: null,
    })
  })

  describe('Initial State', () => {
    it('should initialize all panel sizes to null', () => {
      const state = useLayoutStore.getState()
      expect(state.listSupertag).toBeNull()
      expect(state.listInspector).toBeNull()
      expect(state.queryInspector).toBeNull()
      expect(state.graphInspector).toBeNull()
    })
  })

  describe('setPanelSize', () => {
    it('should set listSupertag panel size', () => {
      useLayoutStore.getState().setPanelSize('listSupertag', 250)

      expect(useLayoutStore.getState().listSupertag).toBe(250)
    })

    it('should set listInspector panel size', () => {
      useLayoutStore.getState().setPanelSize('listInspector', 400)

      expect(useLayoutStore.getState().listInspector).toBe(400)
    })

    it('should set queryInspector panel size', () => {
      useLayoutStore.getState().setPanelSize('queryInspector', 350)

      expect(useLayoutStore.getState().queryInspector).toBe(350)
    })

    it('should set graphInspector panel size', () => {
      useLayoutStore.getState().setPanelSize('graphInspector', 500)

      expect(useLayoutStore.getState().graphInspector).toBe(500)
    })

    it('should round fractional sizes to integers', () => {
      useLayoutStore.getState().setPanelSize('listSupertag', 250.7)

      expect(useLayoutStore.getState().listSupertag).toBe(251)
    })

    it('should round down fractional sizes below .5', () => {
      useLayoutStore.getState().setPanelSize('listSupertag', 250.3)

      expect(useLayoutStore.getState().listSupertag).toBe(250)
    })

    it('should not affect other panel sizes when setting one', () => {
      useLayoutStore.getState().setPanelSize('listSupertag', 200)
      useLayoutStore.getState().setPanelSize('graphInspector', 500)

      const state = useLayoutStore.getState()
      expect(state.listSupertag).toBe(200)
      expect(state.listInspector).toBeNull()
      expect(state.queryInspector).toBeNull()
      expect(state.graphInspector).toBe(500)
    })

    it('should overwrite a previously set size', () => {
      useLayoutStore.getState().setPanelSize('listSupertag', 200)
      useLayoutStore.getState().setPanelSize('listSupertag', 300)

      expect(useLayoutStore.getState().listSupertag).toBe(300)
    })
  })
})
