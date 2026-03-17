import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useLayoutStore } from '@/stores/layout'

describe('Layout Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('initializes with correct default state', () => {
    const store = useLayoutStore()
    expect(store.leftCollapsed).toBe(false)
    expect(store.rightCollapsed).toBe(false)
    expect(store.activeTab).toBe('form')
  })

  it('toggles left panel', () => {
    const store = useLayoutStore()
    expect(store.leftCollapsed).toBe(false)

    store.toggleLeft()
    expect(store.leftCollapsed).toBe(true)

    store.toggleLeft()
    expect(store.leftCollapsed).toBe(false)
  })

  it('toggles right panel', () => {
    const store = useLayoutStore()
    expect(store.rightCollapsed).toBe(false)

    store.toggleRight()
    expect(store.rightCollapsed).toBe(true)

    store.toggleRight()
    expect(store.rightCollapsed).toBe(false)
  })

  it('can change active tab', () => {
    const store = useLayoutStore()
    expect(store.activeTab).toBe('form')

    store.activeTab = 'dag'
    expect(store.activeTab).toBe('dag')
  })
})
