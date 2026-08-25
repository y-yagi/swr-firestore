import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const firestore = vi.hoisted(() => ({
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  doc: vi.fn((_db: unknown, path?: string) => ({
    path,
    id: path ?? 'auto-id',
  })),
  collection: vi.fn((_db: unknown, path: string) => ({
    type: 'collection',
    path,
  })),
  collectionGroup: vi.fn((_db: unknown, path: string) => ({
    type: 'collectionGroup',
    path,
  })),
  query: vi.fn((ref: unknown, ...constraints: unknown[]) => ({
    ref,
    constraints,
  })),
  where: vi.fn((...args: unknown[]) => ({ type: 'where', args })),
  orderBy: vi.fn((...args: unknown[]) => ({ type: 'orderBy', args })),
  limit: vi.fn((...args: unknown[]) => ({ type: 'limit', args })),
  startAt: vi.fn(() => ({ type: 'startAt' })),
  endAt: vi.fn(() => ({ type: 'endAt' })),
  startAfter: vi.fn(() => ({ type: 'startAfter' })),
  endBefore: vi.fn(() => ({ type: 'endBefore' })),
  setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    commit: vi.fn(() => Promise.resolve()),
  })),
  getFirestore: vi.fn(() => ({ mock: 'db' })),
}))

vi.mock('firebase/firestore', () => firestore)
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({ name: 'test', options: {} })),
  getApps: vi.fn(() => []),
  getApp: vi.fn(() => ({ name: 'test', options: {} })),
}))

const { Fuego } = await import('../classes/Fuego.js')
const { setFuego } = await import('../context/index.js')
const { useCollection } = await import('../hooks/use-swr-collection.js')
const { useDocument } = await import('../hooks/use-swr-document.js')

const snapshot = (id: string, data: Record<string, unknown>) => ({
  id,
  exists: () => true,
  metadata: { hasPendingWrites: false },
  data: () => data,
  ref: { path: `users/${id}` },
})

// each test gets a fresh SWR cache so keys don't leak between them
const wrapper = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
    {children}
  </SWRConfig>
)

const applyDefaultMocks = () => {
  firestore.doc.mockImplementation((_db: unknown, path?: string) => ({
    path,
    id: path ?? 'auto-id',
  }))
  firestore.collection.mockImplementation((_db: unknown, path: string) => ({
    type: 'collection',
    path,
  }))
  firestore.collectionGroup.mockImplementation(
    (_db: unknown, path: string) => ({
      type: 'collectionGroup',
      path,
    }),
  )
  firestore.query.mockImplementation(
    (ref: unknown, ...constraints: unknown[]) => ({
      ref,
      constraints,
    }),
  )
  firestore.where.mockImplementation((...args: unknown[]) => ({
    type: 'where',
    args,
  }))
  firestore.orderBy.mockImplementation((...args: unknown[]) => ({
    type: 'orderBy',
    args,
  }))
  firestore.limit.mockImplementation((...args: unknown[]) => ({
    type: 'limit',
    args,
  }))
  firestore.setDoc.mockResolvedValue(undefined)
  firestore.updateDoc.mockResolvedValue(undefined)
  firestore.deleteDoc.mockResolvedValue(undefined)
  firestore.getFirestore.mockReturnValue({ mock: 'db' })
  firestore.writeBatch.mockReturnValue({
    set: vi.fn(),
    commit: vi.fn(() => Promise.resolve()),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  applyDefaultMocks()
  setFuego(new Fuego({ projectId: 'test' }))
})

describe('useDocument', () => {
  it('builds a document from the snapshot', async () => {
    firestore.getDoc.mockResolvedValue(
      snapshot('fernando', { name: 'Fernando' }),
    )

    const { result } = renderHook(() => useDocument('users/fernando'), {
      wrapper,
    })

    await waitFor(() => expect(result.current.data).toBeTruthy())
    expect(result.current.data).toMatchObject({
      id: 'fernando',
      name: 'Fernando',
      exists: true,
      hasPendingWrites: false,
    })
    // __snapshot is stripped by default so the doc stays JSON serializable
    expect(result.current.data?.__snapshot).toBeUndefined()
    expect(result.current.isLoading).toBe(false)
    expect(firestore.doc).toHaveBeenCalledWith(
      expect.anything(),
      'users/fernando',
    )
  })

  it('keeps the snapshot when asked to', async () => {
    firestore.getDoc.mockResolvedValue(
      snapshot('fernando', { name: 'Fernando' }),
    )

    const { result } = renderHook(
      () =>
        useDocument('users/fernando', {
          ignoreFirestoreDocumentSnapshotField: false,
        }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.data).toBeTruthy())
    expect(result.current.data?.__snapshot).toBeDefined()
  })

  it('does not fetch when the path is null', () => {
    renderHook(() => useDocument(null), { wrapper })
    expect(firestore.getDoc).not.toHaveBeenCalled()
  })

  it('subscribes when listening and unsubscribes on unmount', async () => {
    const unsubscribe = vi.fn()
    firestore.onSnapshot.mockImplementation((_ref: unknown, onNext: any) => {
      // firestore never calls back synchronously, and the library depends on it
      queueMicrotask(() => onNext(snapshot('fernando', { name: 'Fernando' })))
      return unsubscribe
    })

    const { result, unmount } = renderHook(
      () => useDocument('users/fernando', { listen: true }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.data).toBeTruthy())
    expect(firestore.getDoc).not.toHaveBeenCalled()
    expect(result.current.data).toMatchObject({ id: 'fernando' })

    unmount()
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('writes through set and update', async () => {
    firestore.getDoc.mockResolvedValue(
      snapshot('fernando', { name: 'Fernando' }),
    )

    const { result } = renderHook(() => useDocument('users/fernando'), {
      wrapper,
    })
    await waitFor(() => expect(result.current.data).toBeTruthy())

    await result.current.set({ name: 'Nando' } as never, { merge: true })
    expect(firestore.setDoc).toHaveBeenCalledWith(
      expect.anything(),
      { name: 'Nando' },
      { merge: true },
    )

    await result.current.update({ name: 'Rojo' } as never)
    expect(firestore.updateDoc).toHaveBeenCalledWith(expect.anything(), {
      name: 'Rojo',
    })
  })
})

describe('useCollection', () => {
  const querySnapshot = (docs: ReturnType<typeof snapshot>[]) => ({
    forEach: (cb: (d: ReturnType<typeof snapshot>) => void) => docs.forEach(cb),
  })

  it('builds an array of documents', async () => {
    firestore.getDocs.mockResolvedValue(
      querySnapshot([
        snapshot('a', { name: 'A' }),
        snapshot('b', { name: 'B' }),
      ]),
    )

    const { result } = renderHook(() => useCollection('users'), { wrapper })

    await waitFor(() => expect(result.current.data).toBeTruthy())
    expect(result.current.data).toMatchObject([
      { id: 'a', name: 'A', exists: true },
      { id: 'b', name: 'B', exists: true },
    ])
    expect(firestore.collection).toHaveBeenCalledWith(
      expect.anything(),
      'users',
    )
  })

  it('translates the query into firestore constraints', async () => {
    firestore.getDocs.mockResolvedValue(querySnapshot([]))

    const { result } = renderHook(
      () =>
        useCollection('users', {
          where: ['name', '==', 'fernando'],
          orderBy: ['name', 'desc'],
          limit: 10,
        }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.data).toBeTruthy())
    expect(firestore.where).toHaveBeenCalledWith('name', '==', 'fernando')
    expect(firestore.orderBy).toHaveBeenCalledWith('name', 'desc')
    expect(firestore.limit).toHaveBeenCalledWith(10)
    expect(firestore.query).toHaveBeenCalledOnce()
  })

  it('keeps numeric cursors that are 0', async () => {
    firestore.getDocs.mockResolvedValue(querySnapshot([]))

    const { result } = renderHook(
      () =>
        useCollection('users', {
          orderBy: 'age',
          startAt: 0,
          endAt: 0,
          startAfter: 0,
          endBefore: 0,
          limit: 0,
        }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.data).toBeTruthy())
    // 0 is a legitimate cursor value; a truthy check would drop these and
    // silently return the whole collection
    expect(firestore.startAt).toHaveBeenCalledWith(0)
    expect(firestore.endAt).toHaveBeenCalledWith(0)
    expect(firestore.startAfter).toHaveBeenCalledWith(0)
    expect(firestore.endBefore).toHaveBeenCalledWith(0)
    expect(firestore.limit).toHaveBeenCalledWith(0)
  })

  it('keeps a single where clause that uses a FieldPath', async () => {
    firestore.getDocs.mockResolvedValue(querySnapshot([]))
    const fieldPath = { _internalPath: '__name__' }

    const { result } = renderHook(
      () =>
        useCollection('users', {
          where: [fieldPath as never, '==', 'fernando'],
        }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.data).toBeTruthy())
    expect(firestore.where).toHaveBeenCalledWith(fieldPath, '==', 'fernando')
  })

  it('ignores a malformed where clause', async () => {
    firestore.getDocs.mockResolvedValue(querySnapshot([]))

    const { result } = renderHook(
      () => useCollection('users', { where: [] as never }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.data).toBeTruthy())
    expect(firestore.where).not.toHaveBeenCalled()
  })

  it('accepts multiple where clauses', async () => {
    firestore.getDocs.mockResolvedValue(querySnapshot([]))

    const { result } = renderHook(
      () =>
        useCollection('users', {
          where: [
            ['name', '==', 'fernando'],
            ['age', '>', 18],
          ],
        }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.data).toBeTruthy())
    expect(firestore.where).toHaveBeenCalledTimes(2)
  })

  it('uses collectionGroup for group queries', async () => {
    firestore.getDocs.mockResolvedValue(querySnapshot([]))

    const { result } = renderHook(
      () => useCollection('pages', { isCollectionGroup: true }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.data).toBeTruthy())
    expect(firestore.collectionGroup).toHaveBeenCalledWith(
      expect.anything(),
      'pages',
    )
    expect(firestore.collection).not.toHaveBeenCalled()
  })

  it('unsubscribes the listener on unmount', async () => {
    const unsubscribe = vi.fn()
    firestore.onSnapshot.mockImplementation(
      (_ref: unknown, _options: unknown, onNext: any) => {
        queueMicrotask(() =>
          onNext(querySnapshot([snapshot('a', { name: 'A' })])),
        )
        return unsubscribe
      },
    )

    const { result, unmount } = renderHook(
      () => useCollection('users', { listen: true }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.data).toBeTruthy())
    expect(firestore.getDocs).not.toHaveBeenCalled()

    unmount()
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('generates ids locally and commits a batch on add', async () => {
    firestore.getDocs.mockResolvedValue(querySnapshot([]))
    const set = vi.fn()
    const commit = vi.fn(() => Promise.resolve())
    firestore.writeBatch.mockReturnValue({ set, commit })
    firestore.doc.mockReturnValue({
      id: 'generated-id',
      path: 'users/generated-id',
    })

    const { result } = renderHook(
      () => useCollection<{ name: string }>('users'),
      {
        wrapper,
      },
    )
    await waitFor(() => expect(result.current.data).toBeTruthy())

    const id = await result.current.add({ name: 'Fernando' })

    expect(id).toBe('generated-id')
    expect(set).toHaveBeenCalledOnce()
    expect(commit).toHaveBeenCalledOnce()
  })
})
