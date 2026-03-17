import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ErrorBoundary from '@/components/ErrorBoundary.vue'

// Stub Element Plus components
const globalStubs = {
  'el-result': {
    template: '<div class="el-result"><slot /><slot name="extra" /></div>',
  },
  'el-button': {
    template: '<button class="el-button"><slot /></button>',
  },
  'el-icon': {
    template: '<span class="el-icon"><slot /></span>',
  },
  'el-divider': {
    template: '<div class="el-divider" />',
  },
  'el-tag': {
    template: '<span class="el-tag"><slot /></span>',
  },
  'el-collapse-transition': {
    template: '<div class="el-collapse-transition"><slot /></div>',
  },
}

// Mock router
const mockRouter = {
  push: () => Promise.resolve(),
}

describe('ErrorBoundary', () => {
  it('renders slot content when no error', () => {
    const wrapper = mount(ErrorBoundary, {
      slots: {
        default: '<div class="content">Normal Content</div>',
      },
      global: {
        stubs: globalStubs,
        mocks: {
          $router: mockRouter,
        },
      },
    })
    expect(wrapper.find('.content').exists()).toBe(true)
    expect(wrapper.find('.error-boundary').exists()).toBe(false)
  })

  it('shows error UI when error captured', async () => {
    const wrapper = mount(ErrorBoundary, {
      slots: {
        default: '<div class="content">Normal Content</div>',
      },
      global: {
        stubs: globalStubs,
        mocks: {
          $router: mockRouter,
        },
      },
    })

    // Simulate an error
    const error = new Error('Test error')
    ;(wrapper.vm as any).error = error
    await nextTick()

    expect(wrapper.find('.error-boundary').exists()).toBe(true)
    expect(wrapper.find('.el-result').exists()).toBe(true)
  })

  it('has retry and home buttons', async () => {
    const wrapper = mount(ErrorBoundary, {
      global: {
        stubs: globalStubs,
        mocks: {
          $router: mockRouter,
        },
      },
    })
    ;(wrapper.vm as any).error = new Error('Test')
    await nextTick()

    const buttons = wrapper.findAll('.el-button')
    expect(buttons.length).toBeGreaterThanOrEqual(2)
  })

  it('shows report button when showReport is true', async () => {
    const wrapper = mount(ErrorBoundary, {
      props: {
        showReport: true,
      },
      global: {
        stubs: globalStubs,
        mocks: {
          $router: mockRouter,
        },
      },
    })
    ;(wrapper.vm as any).error = new Error('Test')
    await nextTick()

    const buttons = wrapper.findAll('.el-button')
    expect(buttons.length).toBeGreaterThanOrEqual(3)
  })

  it('can toggle error details', async () => {
    const wrapper = mount(ErrorBoundary, {
      props: {
        showReport: true,
      },
      global: {
        stubs: globalStubs,
        mocks: {
          $router: mockRouter,
        },
      },
    })

    const error = new Error('Test error with stack')
    error.stack = 'Error: Test\n    at test.ts:1:1'
    ;(wrapper.vm as any).error = error
    await nextTick()

    expect((wrapper.vm as any).showDetails).toBe(false)

    // Toggle details
    await wrapper.find('.error-summary').trigger('click')
    expect((wrapper.vm as any).showDetails).toBe(true)
  })

  it('clears error when retry is called', async () => {
    const wrapper = mount(ErrorBoundary, {
      global: {
        stubs: globalStubs,
        mocks: {
          $router: mockRouter,
        },
      },
    })

    ;(wrapper.vm as any).error = new Error('Test')
    await nextTick()
    expect(wrapper.find('.error-boundary').exists()).toBe(true)

    // Call retry method
    ;(wrapper.vm as any).retry()
    await nextTick()
    expect(wrapper.find('.error-boundary').exists()).toBe(false)
  })
})
