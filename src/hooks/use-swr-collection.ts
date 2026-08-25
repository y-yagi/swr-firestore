import {
  collection,
  collectionGroup,
  doc,
  endAt as endAtConstraint,
  endBefore as endBeforeConstraint,
  getDocs,
  limit as limitConstraint,
  onSnapshot,
  orderBy as orderByConstraint,
  query as buildQuery,
  startAfter as startAfterConstraint,
  startAt as startAtConstraint,
  where as whereConstraint,
  writeBatch,
  type DocumentData,
  type FieldPath,
  type OrderByDirection,
  type Query,
  type QueryConstraint,
  type Unsubscribe,
  type WhereFilterOp,
} from 'firebase/firestore'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import useSWR, { mutate as mutateStatic, type SWRConfiguration } from 'swr'

import { collectionCache } from '../classes/Cache.js'
import { fuego } from '../context/index.js'
import { withDocumentDatesParsed } from '../helpers/doc-date-parser.js'
import { empty } from '../helpers/empty.js'
import { isDev } from '../helpers/is-dev.js'
import type { Document } from '../types/index.js'

type KeyHack = string & {} // hack to also allow strings

// here we get the "key" from our data, to add intellisense for any "orderBy" in the queries and such.
type OrderByArray<Doc extends object = {}, Key = keyof Doc> = [
  Key | FieldPath | KeyHack,
  OrderByDirection,
]
type OrderByItem<Doc extends object = {}, Key = keyof Doc> =
  OrderByArray<Doc> | Key | KeyHack
type OrderByType<Doc extends object = {}> =
  OrderByItem<Doc> | OrderByArray<Doc>[]

type WhereItem<Doc extends object = {}, Key = keyof Doc> = [
  Key | FieldPath | KeyHack,
  WhereFilterOp,
  unknown,
]
type WhereArray<Doc extends object = {}> = WhereItem<Doc>[]
type WhereType<Doc extends object = {}> = WhereItem<Doc> | WhereArray<Doc>

export type CollectionQueryType<Doc extends object = {}> = {
  limit?: number
  orderBy?: OrderByType<Doc>
  where?: WhereType<Doc>
  isCollectionGroup?: boolean

  /**
   * For now, this can only be a number, since it has to be JSON serializable.
   *
   * **TODO** allow DocumentSnapshot here too. This will probably be used with a useStaticCollection hook in the future.
   */
  startAt?: number
  /**
   * For now, this can only be a number, since it has to be JSON serializable.
   *
   * **TODO** allow DocumentSnapshot here too. This will probably be used with a useStaticCollection hook in the future.
   */
  endAt?: number
  /**
   * For now, this can only be a number, since it has to be JSON serializable.
   *
   * **TODO** allow DocumentSnapshot here too. This will probably be used with a useStaticCollection hook in the future.
   */
  startAfter?: number
  /**
   * For now, this can only be a number, since it has to be JSON serializable.
   *
   * **TODO** allow DocumentSnapshot here too. This will probably be used with a useStaticCollection hook in the future.
   */
  endBefore?: number
}

export const getCollection = async <Doc extends Document = Document>(
  path: string,
  query: CollectionQueryType<Doc> = {},
  {
    parseDates,
    ignoreFirestoreDocumentSnapshotField,
  }: {
    parseDates?: (string | keyof Doc)[]
    /**
     * If `true`, docs returned in `data` will not include the firestore `__snapshot` field. If `false`, it will include a `__snapshot` field. This lets you access the document snapshot, but makes the document not JSON serializable.
     *
     * Default: `false`
     */
    ignoreFirestoreDocumentSnapshotField?: boolean
  } = empty.object,
) => {
  const ref = createFirestoreRef(path, query)
  const querySnapshot = await getDocs(ref)
  const data: Doc[] = []
  querySnapshot.forEach(document => {
    const docData =
      document.data({ serverTimestamps: 'estimate' }) ?? empty.object
    const docToAdd = withDocumentDatesParsed(
      {
        ...docData,
        id: document.id,
        exists: document.exists(),
        hasPendingWrites: document.metadata.hasPendingWrites,
        __snapshot: ignoreFirestoreDocumentSnapshotField ? undefined : document,
      } as any,
      parseDates,
    )
    // update individual docs in the cache
    mutateStatic(document.ref.path, docToAdd, { revalidate: false })
    if (
      isDev &&
      // @ts-ignore
      (docData.exists || docData.id || docData.hasPendingWrites)
    ) {
      console.warn(
        '[get-collection] warning: Your document, ',
        document.id,
        ' is using one of the following reserved fields: [exists, id, hasPendingWrites]. These fields are reserved. Please remove them from your documents.',
      )
    }
    data.push(docToAdd)
  })
  return data
}

const createFirestoreRef = <Doc extends object = {}>(
  path: string,
  {
    where,
    orderBy,
    limit,
    startAt,
    endAt,
    startAfter,
    endBefore,
    isCollectionGroup,
  }: CollectionQueryType<Doc>,
): Query<DocumentData> => {
  const baseRef: Query<DocumentData> = isCollectionGroup
    ? collectionGroup(fuego.db, path)
    : collection(fuego.db, path)

  const constraints: QueryConstraint[] = []

  if (where) {
    function multipleConditions(w: WhereType<Doc>): w is WhereArray<Doc> {
      return !!(w as WhereArray) && Array.isArray(w[0])
    }
    if (multipleConditions(where)) {
      where.forEach(w => {
        constraints.push(
          whereConstraint(w[0] as string | FieldPath, w[1], w[2]),
        )
      })
    } else if (where.length === 3) {
      // length check rather than `typeof where[0] === 'string'`, so that a
      // FieldPath (e.g. documentId()) in a single clause is not dropped
      constraints.push(
        whereConstraint(where[0] as string | FieldPath, where[1], where[2]),
      )
    }
  }

  if (orderBy) {
    if (typeof orderBy === 'string') {
      constraints.push(orderByConstraint(orderBy))
    } else if (Array.isArray(orderBy)) {
      function multipleOrderBy(o: OrderByType<Doc>): o is OrderByArray<Doc>[] {
        return Array.isArray((o as OrderByArray<Doc>[])[0])
      }
      if (multipleOrderBy(orderBy)) {
        orderBy.forEach(([order, direction]) => {
          constraints.push(
            orderByConstraint(order as string | FieldPath, direction),
          )
        })
      } else {
        const [order, direction] = orderBy
        constraints.push(
          orderByConstraint(order as string | FieldPath, direction),
        )
      }
    }
  }

  if (typeof startAt === 'number') {
    constraints.push(startAtConstraint(startAt))
  }

  if (typeof endAt === 'number') {
    constraints.push(endAtConstraint(endAt))
  }

  if (typeof startAfter === 'number') {
    constraints.push(startAfterConstraint(startAfter))
  }

  if (typeof endBefore === 'number') {
    constraints.push(endBeforeConstraint(endBefore))
  }

  if (typeof limit === 'number') {
    constraints.push(limitConstraint(limit))
  }

  return constraints.length ? buildQuery(baseRef, ...constraints) : baseRef
}

type ListenerReturnType<Doc extends Document = Document> = {
  initialData: Doc[] | null
  unsubscribe: Unsubscribe
}

const createListenerAsync = async <Doc extends Document = Document>(
  path: string,
  queryString: string,
  {
    parseDates,
    ignoreFirestoreDocumentSnapshotField = true,
  }: {
    parseDates?: (string | keyof Doc)[]
    /**
     * If `true`, docs returned in `data` will not include the firestore `__snapshot` field. If `false`, it will include a `__snapshot` field. This lets you access the document snapshot, but makes the document not JSON serializable.
     *
     * Default: `true`
     */
    ignoreFirestoreDocumentSnapshotField?: boolean
  },
): Promise<ListenerReturnType<Doc>> => {
  return new Promise(resolve => {
    const query: CollectionQueryType = JSON.parse(queryString) ?? {}
    const ref = createFirestoreRef(path, query)
    const unsubscribe = onSnapshot(
      ref,
      { includeMetadataChanges: true },
      querySnapshot => {
        const data: Doc[] = []
        querySnapshot.forEach(document => {
          const docData =
            document.data({ serverTimestamps: 'estimate' }) ?? empty.object
          const docToAdd = withDocumentDatesParsed(
            {
              ...docData,
              id: document.id,
              exists: document.exists(),
              hasPendingWrites: document.metadata.hasPendingWrites,
              __snapshot: ignoreFirestoreDocumentSnapshotField
                ? undefined
                : document,
            } as any,
            parseDates,
          )
          if (
            isDev &&
            // @ts-ignore
            (docData.exists || docData.id || docData.hasPendingWrites)
          ) {
            console.warn(
              '[use-collection] warning: Your document, ',
              document.id,
              ' is using one of the following reserved fields: [exists, id, hasPendingWrites]. These fields are reserved. Please remove them from your documents.',
            )
          }
          // update individual docs in the cache
          mutateStatic(document.ref.path, docToAdd, { revalidate: false })
          data.push(docToAdd)
        })
        // resolve initial data
        resolve({
          initialData: data,
          unsubscribe,
        })
        // update on listener fire
        mutateStatic([path, queryString], data, { revalidate: false })
      },
    )
  })
}

export type CollectionSWROptions<Doc extends Document = Document> =
  SWRConfiguration<Doc[] | null>

/**
 * Call a Firestore Collection
 * @template Doc
 * @param path String if the document is ready. If it's not ready yet, pass `null`, and the request won't start yet.
 * @param [query] - Dictionary with options to query the collection *AND* optionally accepts `listen`, `parseDates`, and `ignoreFirestoreDocumentSnapshotField` as well.
 * @param [options] - Dictionary of options to pass to the underlying useSWR library.
 */
export const useCollection = <
  Data extends object = {},
  Doc extends Document = Document<Data>,
>(
  path: string | null,
  query: CollectionQueryType<Data> & {
    /**
     * If `true`, sets up a real-time subscription to the Firestore backend.
     *
     * Default: `false`
     */
    listen?: boolean
    /**
     * An array of key strings that indicate where there will be dates in the document.
     *
     * Example: if your dates are in the `lastUpdated` and `user.createdAt` fields, then pass `{parseDates: ["lastUpdated", "user.createdAt"]}`.
     *
     * This will automatically turn all Firestore dates into JS Date objects, removing the need to do `.toDate()` on your dates.
     */
    parseDates?: (string | keyof Doc)[]
    /**
     * If `true`, docs returned in `data` will not include the firestore `__snapshot` field. If `false`, it will include a `__snapshot` field. This lets you access the document snapshot, but makes the document not JSON serializable.
     *
     * Default: `true`
     */
    ignoreFirestoreDocumentSnapshotField?: boolean
  } = empty.object,
  options: CollectionSWROptions<Doc> = empty.object,
) => {
  const unsubscribeRef = useRef<Unsubscribe | null>(null)

  const {
    where,
    endAt,
    endBefore,
    startAfter,
    startAt,
    orderBy,
    limit,
    listen = false,
    parseDates,
    isCollectionGroup,
    ignoreFirestoreDocumentSnapshotField = true,
  } = query

  // if we're listening, the firestore listener handles all revalidation
  const {
    refreshInterval = listen ? 0 : undefined,
    refreshWhenHidden = listen ? false : undefined,
    refreshWhenOffline = listen ? false : undefined,
    revalidateOnFocus = listen ? false : undefined,
    revalidateOnReconnect = listen ? false : undefined,
    dedupingInterval = listen ? 0 : undefined,
  } = options

  const swrOptions = {
    ...options,
    refreshInterval,
    refreshWhenHidden,
    refreshWhenOffline,
    revalidateOnFocus,
    revalidateOnReconnect,
    dedupingInterval,
  }

  // why not just put this into the ref directly?
  // so that we can use the useEffect down below that triggers revalidate()
  const memoQueryString = useMemo(
    () =>
      JSON.stringify({
        where,
        endAt,
        endBefore,
        startAfter,
        startAt,
        orderBy,
        limit,
        isCollectionGroup,
      }),
    [
      endAt,
      endBefore,
      isCollectionGroup,
      limit,
      orderBy,
      startAfter,
      startAt,
      where,
    ],
  )

  const dateParser = useRef(parseDates)
  useEffect(() => {
    dateParser.current = parseDates
  }, [parseDates])

  // we move listen to a Ref
  // why? because we shouldn't have to include "listen" in the key
  // if we do, then calling mutate() won't be consistent for all
  // collections with the same path & query
  const shouldListen = useRef(listen)
  useEffect(() => {
    shouldListen.current = listen
  })

  const shouldIgnoreSnapshot = useRef(ignoreFirestoreDocumentSnapshotField)
  useEffect(() => {
    shouldIgnoreSnapshot.current = ignoreFirestoreDocumentSnapshotField
  }, [ignoreFirestoreDocumentSnapshotField])

  const swr = useSWR<Doc[] | null>(
    // if the path is null, this means we don't want to fetch yet.
    path === null ? null : [path, memoQueryString],
    // swr 2 passes array keys to the fetcher as a single argument
    async ([fetchPath, queryString]: [string, string]) => {
      if (shouldListen.current) {
        if (unsubscribeRef.current) {
          unsubscribeRef.current()
          unsubscribeRef.current = null
        }
        const { unsubscribe, initialData } = await createListenerAsync<Doc>(
          fetchPath,
          queryString,
          {
            parseDates: dateParser.current,
            ignoreFirestoreDocumentSnapshotField: shouldIgnoreSnapshot.current,
          },
        )
        unsubscribeRef.current = unsubscribe
        return initialData
      }

      const data = await getCollection<Doc>(
        fetchPath,
        JSON.parse(queryString) as CollectionQueryType<Doc>,
        {
          parseDates: dateParser.current,
          ignoreFirestoreDocumentSnapshotField: shouldIgnoreSnapshot.current,
        },
      )
      return data
    },
    swrOptions,
  )

  const { data, isLoading, isValidating, mutate, error } = swr

  /**
   * Refetches this query. `swr.revalidate` was removed in swr 2, so this is
   * built on top of the bound `mutate`.
   */
  const revalidate = useCallback(() => mutate(), [mutate])

  // this MUST be declared before the effect below so the ref is populated.
  const revalidateRef = useRef(revalidate)
  useEffect(() => {
    revalidateRef.current = revalidate
  })

  // if listen changes,
  // we run revalidate.
  // This triggers SWR to fetch again
  // Why? because we don't want to put listen
  // in the useSWR key. If we did, then we couldn't mutate
  // based on query alone. If we had useSWR(['users', true]),
  // but then a `users` fetch with `listen` set to `false` updated, it wouldn't mutate both.
  // thus, we move the `listen` and option to a ref user in `useSWR`,
  // and we call `revalidate` if it changes.
  const mounted = useRef(false)
  useEffect(() => {
    if (mounted.current) revalidateRef.current()
    else mounted.current = true
  }, [listen])

  useEffect(() => {
    return () => {
      // clean up listener on unmount if it exists
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
    }
    // should depend on the path, query, and listen being the same...
  }, [path, listen, memoQueryString])

  // add the collection to the cache,
  // so that we can mutate it from document calls later
  useEffect(() => {
    if (path) collectionCache.addCollectionToCache(path, memoQueryString)
  }, [path, memoQueryString])

  /**
   * `add(data)`: Extends the Firestore document [`add` function](https://firebase.google.com/docs/firestore/manage-data/add-data).
   * - It also updates the local cache using SWR's `mutate`. This will prove highly convenient over the regular `add` function provided by Firestore.
   */
  const add = useCallback(
    <T extends Data | Data[]>(
      data: T,
    ): Promise<T extends Data ? string : string[]> | null => {
      if (!path) return null

      const multiple = Array.isArray(data)
      const dataArray = multiple ? (data as Data[]) : [data as Data]

      const ref = collection(fuego.db, path)

      const docsToAdd: Doc[] = dataArray.map(document => ({
        ...document,
        // generate IDs we can use that in the local cache that match the server
        id: doc(ref).id,
      })) as unknown as Doc[] // solve this annoying TS bug 😅

      // add to cache
      if (!listen) {
        // we only update the local cache if we don't have a listener set up
        // why? because Firestore automatically handles this part for subscriptions
        mutate(
          prevState => {
            const state = prevState ?? (empty.array as Doc[])
            return [...state, ...docsToAdd]
          },
          { revalidate: false },
        )
      }

      // add to network
      const batch = writeBatch(fuego.db)

      docsToAdd.forEach(({ id, ...document }) => {
        // take the ID out of the document
        batch.set(doc(ref, id), document)
      })

      return batch.commit().then(() => {
        const ids = docsToAdd.map(({ id }) => id)
        const returnValue = multiple ? ids : ids[0]

        return returnValue as T extends Data ? string : string[]
      })
    },
    [listen, mutate, path],
  )

  return {
    data,
    isLoading,
    isValidating,
    revalidate,
    mutate,
    error,
    add,
    /**
     * @deprecated use `isLoading` instead. Kept for backwards compatibility.
     */
    loading: isLoading,
    /**
     * A function that, when called, unsubscribes the Firestore listener.
     *
     * The function can be null, so make sure to check that it exists before calling it.
     *
     * Note: This is not necessary to use. `useCollection` already unmounts the listener for you. This is only intended if you want to unsubscribe on your own.
     */
    unsubscribe: unsubscribeRef.current,
  }
}
