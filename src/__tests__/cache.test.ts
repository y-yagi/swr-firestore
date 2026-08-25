import { afterEach, describe, expect, it, vi } from 'vitest'

import { collectionCache } from '../classes/Cache.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('collectionCache', () => {
  it('returns an empty array for an unknown path', () => {
    expect(collectionCache.getSWRKeysFromCollectionPath('unknown')).toEqual([])
  })

  it('stores one key per path + query string pair', () => {
    collectionCache.addCollectionToCache('users', '{"limit":1}')
    collectionCache.addCollectionToCache('users', '{"limit":1}')
    collectionCache.addCollectionToCache('users', '{"limit":2}')

    expect(collectionCache.getSWRKeysFromCollectionPath('users')).toEqual([
      ['users', '{"limit":1}'],
      ['users', '{"limit":2}'],
    ])
  })

  it('drops an undefined query string from the key', () => {
    collectionCache.addCollectionToCache('posts')

    expect(collectionCache.getSWRKeysFromCollectionPath('posts')).toEqual([
      ['posts'],
    ])
  })

  it('warns when handed a document path instead of a collection path', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    collectionCache.getSWRKeysFromCollectionPath('users/fernando')

    expect(error).toHaveBeenCalledOnce()
  })
})
