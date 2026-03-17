import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LoadingState from '@/components/LoadingState.vue'

// Stub Element Plus components
const globalStubs = {
  'el-skeleton': {
    template: '<div class="el-skeleton"><slot /></div>',
  },
  'el-skeleton-item': {
    template: '<div class="el-skeleton-item" />',
  },
  'el-empty': {
    template: '<div class="el-empty"><slot /></div>',
  },
  'el-icon': {
    template: '<div class="el-icon"><slot /></div>',
  },
  'el-progress': {
    template: '<div class="el-progress"><slot /></div>',
  },
  'Loading': {
    template: '<span>Loading Icon</span>',
  },
}

describe('LoadingState', () => {
  it('renders spinner by default', () => {
    const wrapper = mount(LoadingState, {
      global: { stubs: globalStubs },
    })
    expect(wrapper.find('.loading-state').exists()).toBe(true)
    expect(wrapper.find('.spinner-mode').exists()).toBe(true)
    expect(wrapper.find('.spinner-container').exists()).toBe(true)
  })

  it('renders skeleton when type is skeleton', () => {
    const wrapper = mount(LoadingState, {
      props: {
        type: 'skeleton',
      },
      global: { stubs: globalStubs },
    })
    expect(wrapper.find('.el-skeleton').exists()).toBe(true)
    expect(wrapper.find('.skeleton-mode').exists()).toBe(true)
  })

  it('renders spinner when type is spinner', () => {
    const wrapper = mount(LoadingState, {
      props: {
        type: 'spinner',
      },
      global: { stubs: globalStubs },
    })
    expect(wrapper.find('.spinner-mode').exists()).toBe(true)
    expect(wrapper.find('.spinner-container').exists()).toBe(true)
  })

  it('accepts custom rows count for skeleton', () => {
    const wrapper = mount(LoadingState, {
      props: {
        type: 'skeleton',
        rows: 10,
      },
      global: { stubs: globalStubs },
    })
    expect(wrapper.find('.el-skeleton').exists()).toBe(true)
  })

  it('renders dots mode', () => {
    const wrapper = mount(LoadingState, {
      props: {
        type: 'dots',
      },
      global: { stubs: globalStubs },
    })
    expect(wrapper.find('.dots-mode').exists()).toBe(true)
    expect(wrapper.findAll('.dot').length).toBe(3)
  })

  it('renders circle mode', () => {
    const wrapper = mount(LoadingState, {
      props: {
        type: 'circle',
      },
      global: { stubs: globalStubs },
    })
    expect(wrapper.find('.circle-mode').exists()).toBe(true)
    expect(wrapper.find('.circle-spinner').exists()).toBe(true)
  })

  it('renders progress mode', () => {
    const wrapper = mount(LoadingState, {
      props: {
        type: 'progress',
        percentage: 50,
      },
      global: { stubs: globalStubs },
    })
    expect(wrapper.find('.progress-mode').exists()).toBe(true)
    expect(wrapper.find('.el-progress').exists()).toBe(true)
  })

  it('renders mask mode', () => {
    const wrapper = mount(LoadingState, {
      props: {
        type: 'mask',
        visible: true,
      },
      global: { stubs: globalStubs },
    })
    expect(wrapper.find('.loading-mask').exists()).toBe(true)
    expect(wrapper.find('.loading-mask').classes()).toContain('visible')
  })

  it('displays custom text', () => {
    const wrapper = mount(LoadingState, {
      props: {
        type: 'spinner',
        text: 'Custom loading text',
      },
      global: { stubs: globalStubs },
    })
    expect(wrapper.find('.loading-text').text()).toBe('Custom loading text')
  })

  it('supports fullscreen mode', () => {
    const wrapper = mount(LoadingState, {
      props: {
        type: 'spinner',
        fullscreen: true,
      },
      global: { stubs: globalStubs },
    })
    expect(wrapper.find('.loading-state').classes()).toContain('fullscreen')
  })
})
