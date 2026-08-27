import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { fuego } from '../../context/index.js'
import { getCollection } from '../../hooks/use-swr-collection.js'
import { getDocument } from '../../hooks/use-swr-document.js'
import { deleteDocument, set, update } from '../../hooks/static-mutations.js'
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

const read = async (path: string) => (await getDoc(doc(fuego.db, path))).data()

describe('set', () => {
  it('replaces the document without merge', async () => {
    const path = `${uniquePath()}/fernando`
    await setDoc(doc(fuego.db, path), { name: 'Fernando', age: 30 })

    await set(path, { name: 'Nando' })

    expect(await read(path)).toEqual({ name: 'Nando' })
  })

  it('merges when asked to', async () => {
    const path = `${uniquePath()}/fernando`
    await setDoc(doc(fuego.db, path), { name: 'Fernando', age: 30 })

    await set(path, { name: 'Nando' }, { merge: true })

    expect(await read(path)).toEqual({ name: 'Nando', age: 30 })
  })

  it('creates a document that does not exist yet', async () => {
    const path = `${uniquePath()}/new`

    await set(path, { name: 'Fernando' })

    expect(await read(path)).toEqual({ name: 'Fernando' })
  })

  it('throws on a path that is not a document', async () => {
    expect(() => set(uniquePath(), { name: 'Fernando' })).toThrow(
      /not a valid document path/,
    )
  })

  it('returns null for a null path', () => {
    expect(set(null, { name: 'Fernando' })).toBeNull()
  })
})

describe('update', () => {
  it('updates only the given fields', async () => {
    const path = `${uniquePath()}/fernando`
    await setDoc(doc(fuego.db, path), { name: 'Fernando', age: 30 })

    await update(path, { age: 31 })

    expect(await read(path)).toEqual({ name: 'Fernando', age: 31 })
  })

  it('supports dot notation paths and field values', async () => {
    const path = `${uniquePath()}/fernando`
    await setDoc(doc(fuego.db, path), {
      user: { name: 'Fernando', city: 'Lisbon' },
    })

    await update(path, {
      'user.name': 'Nando',
      updatedAt: serverTimestamp(),
    })

    const data = await read(path)
    expect(data?.user).toEqual({ name: 'Nando', city: 'Lisbon' })
    expect(data?.updatedAt).toBeDefined()
  })

  it('rejects when the document does not exist', async () => {
    await expect(
      update(`${uniquePath()}/nobody`, { name: 'Fernando' }),
    ).rejects.toThrow()
  })

  it('throws on a path that is not a document', async () => {
    expect(() => update(uniquePath(), { name: 'Fernando' })).toThrow(
      /not a valid document path/,
    )
  })
})

describe('deleteDocument', () => {
  it('deletes the document', async () => {
    const collection = uniquePath()
    const path = `${collection}/fernando`
    await setDoc(doc(fuego.db, path), { name: 'Fernando' })

    await deleteDocument(path)

    expect((await getDocument(path)).exists).toBe(false)
    expect(await getCollection(collection)).toEqual([])
  })

  it('throws on a path that is not a document', async () => {
    expect(() => deleteDocument(uniquePath())).toThrow(
      /not a valid document path/,
    )
  })
})

describe('read back through the library', () => {
  it('sees writes made through set and update', async () => {
    const collection = uniquePath()
    const path = `${collection}/fernando`

    await set(path, { name: 'Fernando' })
    await update(path, { age: 30 })

    expect(await getDocument(path)).toMatchObject({
      id: 'fernando',
      name: 'Fernando',
      age: 30,
      exists: true,
    })
    expect(await getCollection(collection)).toMatchObject([
      { id: 'fernando', name: 'Fernando', age: 30 },
    ])
  })
})
