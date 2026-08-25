import {
  doc,
  documentId,
  setDoc,
  Timestamp,
  writeBatch,
} from 'firebase/firestore'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { fuego } from '../../context/index.js'
import { getCollection } from '../../hooks/use-swr-collection.js'
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

type Seed = Record<string, Record<string, unknown>>

const seed = async (path: string, docs: Seed) => {
  const batch = writeBatch(fuego.db)
  Object.entries(docs).forEach(([id, data]) => {
    batch.set(doc(fuego.db, `${path}/${id}`), data)
  })
  await batch.commit()
  return path
}

const ids = (docs: { id: string }[]) => docs.map(({ id }) => id)

describe('getCollection', () => {
  it('reads every document when no query is given', async () => {
    const path = await seed(uniquePath(), {
      a: { name: 'A' },
      b: { name: 'B' },
    })

    const docs = await getCollection(path)

    expect(ids(docs).sort()).toEqual(['a', 'b'])
    expect(docs[0]).toMatchObject({ exists: true, hasPendingWrites: false })
  })

  it('includes __snapshot unless asked not to', async () => {
    const path = await seed(uniquePath(), { a: { name: 'A' } })

    // note the default differs from the hook's: getCollection keeps __snapshot
    const [withSnapshot] = await getCollection(path)
    expect(withSnapshot.__snapshot?.ref.path).toBe(`${path}/a`)

    const [without] = await getCollection(
      path,
      {},
      {
        ignoreFirestoreDocumentSnapshotField: true,
      },
    )
    expect(without.__snapshot).toBeUndefined()
  })

  it('applies a single where clause', async () => {
    const path = await seed(uniquePath(), {
      a: { name: 'fernando' },
      b: { name: 'nando' },
    })

    const docs = await getCollection(path, {
      where: ['name', '==', 'fernando'],
    })

    expect(ids(docs)).toEqual(['a'])
  })

  it('applies a single where clause keyed by a FieldPath', async () => {
    const path = await seed(uniquePath(), {
      a: { name: 'A' },
      b: { name: 'B' },
    })

    // regression: a FieldPath used to match neither branch of the where
    // handling, so no constraint was added and the whole collection came back
    const docs = await getCollection(path, {
      where: [documentId(), '==', 'b'],
    })

    expect(ids(docs)).toEqual(['b'])
  })

  it('applies multiple where clauses', async () => {
    const path = await seed(uniquePath(), {
      a: { name: 'fernando', age: 30 },
      b: { name: 'fernando', age: 10 },
      c: { name: 'nando', age: 30 },
    })

    const docs = await getCollection(path, {
      where: [
        ['name', '==', 'fernando'],
        ['age', '>', 18],
      ],
    })

    expect(ids(docs)).toEqual(['a'])
  })

  it('orders by a string, a tuple, and multiple fields', async () => {
    const path = await seed(uniquePath(), {
      a: { group: 1, n: 2 },
      b: { group: 1, n: 1 },
      c: { group: 0, n: 3 },
    })

    expect(ids(await getCollection(path, { orderBy: 'n' }))).toEqual([
      'b',
      'a',
      'c',
    ])
    expect(ids(await getCollection(path, { orderBy: ['n', 'desc'] }))).toEqual([
      'c',
      'a',
      'b',
    ])
    expect(
      ids(
        await getCollection(path, {
          orderBy: [
            ['group', 'asc'],
            ['n', 'desc'],
          ],
        }),
      ),
    ).toEqual(['c', 'a', 'b'])
  })

  it('applies a limit', async () => {
    const path = await seed(uniquePath(), {
      a: { n: 0 },
      b: { n: 1 },
      c: { n: 2 },
    })

    const docs = await getCollection(path, { orderBy: 'n', limit: 2 })

    expect(ids(docs)).toEqual(['a', 'b'])
  })

  it('applies numeric cursors of 0', async () => {
    const path = await seed(uniquePath(), {
      a: { n: 0 },
      b: { n: 1 },
      c: { n: 2 },
    })
    const query = { orderBy: 'n' as const }

    // regression: these were gated on truthiness, so a cursor of 0 was dropped
    // and the query silently returned the whole collection
    expect(ids(await getCollection(path, { ...query, startAt: 0 }))).toEqual([
      'a',
      'b',
      'c',
    ])
    expect(ids(await getCollection(path, { ...query, endAt: 0 }))).toEqual([
      'a',
    ])
    expect(ids(await getCollection(path, { ...query, startAfter: 0 }))).toEqual(
      ['b', 'c'],
    )
    expect(ids(await getCollection(path, { ...query, endBefore: 0 }))).toEqual(
      [],
    )
  })

  it('surfaces the firestore error for limit: 0', async () => {
    const path = await seed(uniquePath(), { a: { n: 0 } })

    // firestore rejects limit(0) outright. Swallowing it would mean quietly
    // fetching the entire collection instead - exactly what a mock cannot catch.
    await expect(getCollection(path, { limit: 0 })).rejects.toThrow(
      /positive number/,
    )
  })

  it('queries a collection group across parents', async () => {
    // the group name has to be unique: a collection group query reaches across
    // the whole database, including documents other tests wrote
    const group = `pages-${crypto.randomUUID()}`
    const root = uniquePath()
    await setDoc(doc(fuego.db, `${root}/one/${group}/x`), { name: 'X' })
    await setDoc(doc(fuego.db, `${root}/two/${group}/y`), { name: 'Y' })

    const docs = await getCollection(group, { isCollectionGroup: true })

    expect(ids(docs).sort()).toEqual(['x', 'y'])
  })

  it('parses dates on every document', async () => {
    const date = new Date('2020-01-02T03:04:05.000Z')
    const path = await seed(uniquePath(), {
      a: { createdAt: Timestamp.fromDate(date) },
      b: { createdAt: Timestamp.fromDate(date) },
    })

    const docs = await getCollection<{ createdAt: Date } & { id: string }>(
      path,
      {},
      { parseDates: ['createdAt'] },
    )

    docs.forEach(document => {
      expect(document.createdAt).toBeInstanceOf(Date)
      expect(document.createdAt).toEqual(date)
    })
  })
})
