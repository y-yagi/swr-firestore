import { describe, expect, it, vi } from 'vitest'

import { shouldMerge } from '../helpers/set-options.js'

describe('shouldMerge', () => {
  it('defaults to false, like firestore', () => {
    expect(shouldMerge()).toBe(false)
    expect(shouldMerge({})).toBe(false)
  })

  it('reads merge off the options', () => {
    expect(shouldMerge({ merge: true })).toBe(true)
    expect(shouldMerge({ merge: false })).toBe(false)
  })

  it('is false for the mergeFields branch of the union', () => {
    expect(shouldMerge({ mergeFields: ['name'] })).toBe(false)
  })
})

describe('isDev', () => {
  it('falls back to dev when process.env cannot be read', async () => {
    // Deleting `process` outright breaks vitest itself, so instead make the
    // read throw the same way it does in a browser with no `process` at all.
    const descriptor = Object.getOwnPropertyDescriptor(process, 'env')!
    vi.resetModules()
    Object.defineProperty(process, 'env', {
      configurable: true,
      get() {
        throw new ReferenceError('process is not defined')
      },
    })
    let isDev: boolean
    try {
      ;({ isDev } = await import('../helpers/is-dev.js'))
    } finally {
      Object.defineProperty(process, 'env', descriptor)
      vi.resetModules()
    }
    // swallowing the dev warnings silently is worse than showing them
    expect(isDev).toBe(true)
  })

  it('is false in production', async () => {
    const original = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    vi.resetModules()
    try {
      const { isDev } = await import('../helpers/is-dev.js')
      expect(isDev).toBe(false)
    } finally {
      process.env.NODE_ENV = original
      vi.resetModules()
    }
  })

  it('is true outside production', async () => {
    const original = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    vi.resetModules()
    try {
      const { isDev } = await import('../helpers/is-dev.js')
      expect(isDev).toBe(true)
    } finally {
      process.env.NODE_ENV = original
      vi.resetModules()
    }
  })
})
