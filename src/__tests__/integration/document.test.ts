import { doc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { fuego } from '../../context/index.js'
import { getDocument } from '../../hooks/use-swr-document.js'
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

const seedDoc = async (data: Record<string, unknown>) => {
  const path = `${uniquePath()}/fernando`
  await setDoc(doc(fuego.db, path), data)
  return path
}

describe('getDocument', () => {
  it('projects the snapshot onto the document', async () => {
    const path = await seedDoc({ name: 'Fernando' })

    const data = await getDocument(path)

    expect(data).toMatchObject({
      id: 'fernando',
      name: 'Fernando',
      exists: true,
      hasPendingWrites: false,
    })
  })

  it('reports a missing document as not existing', async () => {
    const path = `${uniquePath()}/nobody`

    const data = await getDocument(path)

    // exists() is a method on the modular SDK - reading it as a property would
    // have made this truthy for every document, including this one
    expect(data.exists).toBe(false)
    expect(data.id).toBe('nobody')
  })

  it('strips __snapshot by default and keeps it on request', async () => {
    const path = await seedDoc({ name: 'Fernando' })

    expect((await getDocument(path)).__snapshot).toBeUndefined()

    const withSnapshot = await getDocument(path, {
      ignoreFirestoreDocumentSnapshotField: false,
    })
    expect(withSnapshot.__snapshot?.ref.path).toBe(path)
  })

  it('parses top level and nested timestamps into Dates', async () => {
    const createdAt = new Date('2020-01-02T03:04:05.000Z')
    const updatedAt = new Date('2021-06-07T08:09:10.000Z')
    const path = await seedDoc({
      createdAt: Timestamp.fromDate(createdAt),
      user: { updatedAt: Timestamp.fromDate(updatedAt), name: 'Fernando' },
    })

    const data = await getDocument<
      { createdAt: Date; user: { updatedAt: Date; name: string } } & {
        id: string
      }
    >(path, { parseDates: ['createdAt', 'user.updatedAt'] })

    expect(data.createdAt).toBeInstanceOf(Date)
    expect(data.createdAt).toEqual(createdAt)
    expect(data.user.updatedAt).toBeInstanceOf(Date)
    expect(data.user.updatedAt).toEqual(updatedAt)
    // the sibling field survives the nested clone
    expect(data.user.name).toBe('Fernando')
  })

  it('round-trips a serverTimestamp', async () => {
    const before = Date.now()
    const path = await seedDoc({ createdAt: serverTimestamp() })

    const data = await getDocument<{ createdAt: Date } & { id: string }>(path, {
      parseDates: ['createdAt'],
    })

    expect(data.createdAt).toBeInstanceOf(Date)
    expect(data.createdAt.getTime()).toBeGreaterThanOrEqual(before - 60_000)
  })

  it('leaves a field alone when it is not a timestamp', async () => {
    const path = await seedDoc({ createdAt: 'yesterday' })

    const data = await getDocument<{ createdAt: string } & { id: string }>(
      path,
      { parseDates: ['createdAt'] },
    )

    expect(data.createdAt).toBe('yesterday')
  })
})
