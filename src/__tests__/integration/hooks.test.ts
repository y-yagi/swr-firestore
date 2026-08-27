// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import { doc, setDoc } from 'firebase/firestore'
import { createElement, type ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { fuego } from '../../context/index.js'
import { useCollection } from '../../hooks/use-swr-collection.js'
import { useDocument } from '../../hooks/use-swr-document.js'
import {
  clearFirestore,
  connectToEmulator,
  resetCollectionCache,
  uniquePath,
} from './setup.js'

beforeAll(async () => {
  connectToEmulator()
  await clearFirestore()
})

beforeEach(() => {
  resetCollectionCache()
})

// NOTE: no custom `provider` here. The listeners push updates through swr's
// GLOBAL mutate, so a scoped cache would never see them. Tests isolate
// themselves by using a unique path instead.
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(SWRConfig, { value: { dedupingInterval: 0 } }, children)

describe('useDocument against the emulator', () => {
  it('fetches a document', async () => {
    const path = `${uniquePath()}/fernando`
    await setDoc(doc(fuego.db, path), { name: 'Fernando' })

    const { result } = renderHook(() => useDocument(path), { wrapper })

    await waitFor(() => expect(result.current.data).toBeTruthy())
    expect(result.current.data).toMatchObject({
      id: 'fernando',
      name: 'Fernando',
      exists: true,
    })
  })

  it('receives live updates through onSnapshot', async () => {
    const path = `${uniquePath()}/fernando`
    await setDoc(doc(fuego.db, path), { name: 'Fernando' })

    const { result, unmount } = renderHook(
      () => useDocument<{ name: string }>(path, { listen: true }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.data?.name).toBe('Fernando'))

    await setDoc(doc(fuego.db, path), { name: 'Nando' })
    await waitFor(() => expect(result.current.data?.name).toBe('Nando'))

    unmount()
  })
})

describe('useCollection against the emulator', () => {
  it('adds documents with locally generated ids', async () => {
    const path = uniquePath()

    const { result } = renderHook(() => useCollection<{ name: string }>(path), {
      wrapper,
    })
    await waitFor(() => expect(result.current.data).toBeTruthy())

    const id = await result.current.add({ name: 'Fernando' })

    expect(typeof id).toBe('string')
    const snapshot = await import('firebase/firestore').then(({ getDoc }) =>
      getDoc(doc(fuego.db, `${path}/${id}`)),
    )
    expect(snapshot.data()).toEqual({ name: 'Fernando' })
  })

  it('receives live collection updates', async () => {
    const path = uniquePath()
    await setDoc(doc(fuego.db, `${path}/a`), { name: 'A' })

    const { result, unmount } = renderHook(
      () => useCollection<{ name: string }>(path, { listen: true }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.data).toHaveLength(1))

    await setDoc(doc(fuego.db, `${path}/b`), { name: 'B' })
    await waitFor(() => expect(result.current.data).toHaveLength(2))

    unmount()
  })
})
