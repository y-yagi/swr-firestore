import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
  type DocumentData,
  type FieldValue,
  type SetOptions,
  type Unsubscribe,
  type UpdateData,
} from 'firebase/firestore'
import { useCallback, useEffect, useRef } from 'react'
import useSWR, { mutate, type SWRConfiguration } from 'swr'

import { collectionCache } from '../classes/Cache.js'
import { fuego } from '../context/index.js'
import { withDocumentDatesParsed } from '../helpers/doc-date-parser.js'
import { empty } from '../helpers/empty.js'
import { isDev } from '../helpers/is-dev.js'
import { shouldMerge } from '../helpers/set-options.js'
import type { AllowType, Document } from '../types/Document.js'
import { deleteDocument } from './static-mutations.js'

type Options<Doc extends Document = Document> = {
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
  parseDates?: (
    | string
    | keyof Omit<Doc, 'id' | 'exists' | 'hasPendingWrites' | '__snapshot'>
  )[]
  /**
   * If `true`, doc returned in `data` will not include the firestore `__snapshot` field.
   *
   * If `false`, it will include a `__snapshot` field. This lets you access the document snapshot, but makes the document not JSON serializable.
   *
   * Default: `true`
   */
  ignoreFirestoreDocumentSnapshotField?: boolean
} & SWRConfiguration<Doc | null>

type ListenerReturnType<Doc extends Document = Document> = {
  initialData: Doc
  unsubscribe: Unsubscribe
}

export const getDocument = async <Doc extends Document = Document>(
  path: string,
  {
    parseDates,
    ignoreFirestoreDocumentSnapshotField = true,
  }: {
    parseDates?: (
      | string
      | keyof Omit<Doc, 'id' | 'exists' | 'hasPendingWrites' | '__snapshot'>
    )[]
    /**
     * If `true`, doc returned in `data` will not include the firestore `__snapshot` field.
     *
     * If `false`, it will include a `__snapshot` field. This lets you access the document snapshot, but makes the document not JSON serializable.
     *
     * Default: `true`
     */
    ignoreFirestoreDocumentSnapshotField?: boolean
  } = empty.object,
) => {
  const snapshot = await getDoc(doc(fuego.db, path))
  const docData =
    snapshot.data({ serverTimestamps: 'estimate' }) ?? empty.object
  if (
    isDev &&
    // @ts-ignore
    (docData.exists || docData.id || docData.hasPendingWrites)
  ) {
    console.warn(
      '[get-document] warning: Your document, ',
      snapshot.id,
      ' is using one of the following reserved fields: [exists, id, hasPendingWrites]. These fields are reserved. Please remove them from your documents.',
    )
  }
  const data = withDocumentDatesParsed(
    {
      ...docData,
      id: snapshot.id,
      exists: snapshot.exists(),
      hasPendingWrites: snapshot.metadata.hasPendingWrites,
      __snapshot: ignoreFirestoreDocumentSnapshotField ? undefined : snapshot,
    } as unknown as Doc,
    parseDates,
  )

  // update the document in any collections listening to the same document
  let collection: string | string[] = path.split(`/${data.id}`)

  collection.pop() // remove last item, which is the /id
  collection = collection.join('/') // rejoin the path
  if (collection) {
    collectionCache.getSWRKeysFromCollectionPath(collection).forEach(key => {
      mutate(
        key,
        (currentState: Doc[] = empty.array as Doc[]): Doc[] => {
          // don't mutate the current state if it doesn't include this doc
          if (!currentState.some(document => document.id === data.id)) {
            return currentState
          }
          return currentState.map(document => {
            if (document.id === data.id) {
              return data
            }
            return document
          })
        },
        { revalidate: false },
      )
    })
  }

  return data
}

const createListenerAsync = async <Doc extends Document = Document>(
  path: string,
  {
    parseDates,
    ignoreFirestoreDocumentSnapshotField = true,
  }: {
    parseDates?: (
      | string
      | keyof Omit<Doc, 'id' | 'exists' | 'hasPendingWrites' | '__snapshot'>
    )[]
    /**
     * If `true`, `data` will not include the firestore `__snapshot` field. You might want this if you need your data to be JSON serializable.
     *
     * Default: `false`
     */
    ignoreFirestoreDocumentSnapshotField?: boolean
  } = {},
): Promise<ListenerReturnType<Doc>> => {
  return await new Promise(resolve => {
    const unsubscribe = onSnapshot(doc(fuego.db, path), snapshot => {
      const docData = snapshot.data() ?? empty.object
      const data = withDocumentDatesParsed<Doc>(
        {
          ...docData,
          id: snapshot.id,
          exists: snapshot.exists(),
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
          __snapshot: ignoreFirestoreDocumentSnapshotField
            ? undefined
            : snapshot,
        } as unknown as Doc,
        parseDates,
      )
      mutate(path, data, { revalidate: false })
      if (
        isDev &&
        // @ts-ignore
        (docData.exists || docData.id || docData.hasPendingWrites)
      ) {
        console.warn(
          '[use-document] warning: Your document, ',
          snapshot.id,
          ' is using one of the following reserved fields: [exists, id, hasPendingWrites]. These fields are reserved. Please remove them from your documents.',
        )
      }

      // update the document in any collections listening to the same document
      let collection: string | string[] = path
        .split(`/${snapshot.id}`)
        .filter(Boolean)
      collection.pop() // remove last item, which is the /id
      collection = collection.join('/')

      if (collection) {
        collectionCache
          .getSWRKeysFromCollectionPath(collection)
          .forEach(key => {
            mutate(
              key,
              (currentState: Doc[] = empty.array as Doc[]): Doc[] => {
                // don't mutate the current state if it doesn't include this doc
                if (
                  !currentState.some(
                    document => document.id && document.id === data.id,
                  )
                ) {
                  return currentState
                }
                return currentState.map(document => {
                  if (document.id === data.id) {
                    return data
                  }
                  return document
                })
              },
              { revalidate: false },
            )
          })
      }

      // the first time the listener fires, we resolve the promise with initial data
      resolve({
        initialData: data,
        unsubscribe,
      })
    })
  })
}

export const useDocument = <
  Data extends object = {},
  Doc extends Document = Document<Data>,
>(
  path: string | null,
  options: Options<Doc> = empty.object,
) => {
  const unsubscribeRef = useRef<Unsubscribe | null>(null)
  const {
    listen = false,
    parseDates,
    ignoreFirestoreDocumentSnapshotField = true,
    ...opts
  } = options

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
    ...opts,
    refreshInterval,
    refreshWhenHidden,
    refreshWhenOffline,
    revalidateOnFocus,
    revalidateOnReconnect,
    dedupingInterval,
  }

  // we move listen to a Ref
  // why? because we shouldn't have to include "listen" in the key
  // if we do, then calling mutate() won't be consistent for all
  // documents with the same path.
  const shouldListen = useRef(listen)
  useEffect(() => {
    shouldListen.current = listen
  }, [listen])

  const datesToParse = useRef(parseDates)
  useEffect(() => {
    datesToParse.current = parseDates
  }, [parseDates])

  const shouldIgnoreSnapshot = useRef(ignoreFirestoreDocumentSnapshotField)
  useEffect(() => {
    shouldIgnoreSnapshot.current = ignoreFirestoreDocumentSnapshotField
  }, [ignoreFirestoreDocumentSnapshotField])

  const swr = useSWR<Doc | null>(
    path,
    async (fetchPath: string) => {
      if (shouldListen.current) {
        if (unsubscribeRef.current) {
          unsubscribeRef.current()
          unsubscribeRef.current = null
        }
        const { unsubscribe, initialData } = await createListenerAsync<Doc>(
          fetchPath,
          {
            parseDates: datesToParse.current,
            ignoreFirestoreDocumentSnapshotField: shouldIgnoreSnapshot.current,
          },
        )
        unsubscribeRef.current = unsubscribe
        return initialData
      }
      const data = await getDocument<Doc>(fetchPath, {
        parseDates: datesToParse.current,
        ignoreFirestoreDocumentSnapshotField: shouldIgnoreSnapshot.current,
      })
      return data
    },
    swrOptions,
  )

  const { data, isLoading, isValidating, mutate: connectedMutate, error } = swr

  /**
   * Refetches this document. `swr.revalidate` was removed in swr 2, so this is
   * built on top of the bound `mutate`.
   */
  const revalidate = useCallback(() => connectedMutate(), [connectedMutate])

  // this MUST be declared before the effect below so the ref is populated.
  const revalidateRef = useRef(revalidate)
  useEffect(() => {
    revalidateRef.current = revalidate
  })

  // if listen changes,
  // we run revalidate.
  // This triggers SWR to fetch again
  // Why? because we don't want to put listen or memoQueryString
  // in the useSWR key. If we did, then we couldn't mutate
  // based on path. If we had useSWR(['users', { where: ['name', '==, 'fernando']}]),
  // and we updated the proper `user` dictionary, it wouldn't mutate, because of
  // the key.
  // thus, we move the `listen` and `queryString` options to refs passed to `useSWR`,
  // and we call `revalidate` if either of them change.
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
    // should depend on the path, and listen being the same...
  }, [path, listen])

  /**
   * `set(data, SetOptions?)`: Extends the `firestore` document `set` function.
   * - You can call this when you want to edit your document.
   * - It also updates the local cache using SWR's `mutate`. This will prove highly convenient over the regular Firestore `set` function.
   * - The second argument is the same as the second argument for [Firestore `set`](https://firebase.google.com/docs/firestore/manage-data/add-data#set_a_document).
   */
  const set = useCallback(
    (data: Partial<AllowType<Data, FieldValue>>, options?: SetOptions) => {
      if (!listen) {
        // we only update the local cache if we don't have a listener set up
        // Why? firestore handles this for us for listeners.
        // @ts-ignore
        connectedMutate((prevState = empty.object) => {
          // default we set merge to be false. this is annoying, but follows Firestore's preference.
          if (!shouldMerge(options)) return data
          return {
            ...prevState,
            ...data,
          }
        })
      }
      if (!path) return null
      const ref = doc(fuego.db, path)
      return options
        ? setDoc(ref, data as DocumentData, options)
        : setDoc(ref, data as DocumentData)
    },
    [path, listen, connectedMutate],
  )

  /**
   * - `update(data)`: Extends the Firestore document [`update` function](https://firebase.google.com/docs/firestore/manage-data/add-data#update-data).
   * - It also updates the local cache using SWR's `mutate`. This will prove highly convenient over the regular `set` function.
   */
  const update = useCallback(
    (data: Partial<AllowType<Data, FieldValue>>) => {
      if (!listen) {
        // we only update the local cache if we don't have a listener set up
        // @ts-ignore
        connectedMutate((prevState = empty.object) => {
          return {
            ...prevState,
            ...data,
          }
        })
      }
      if (!path) return null
      return updateDoc(doc(fuego.db, path), data as UpdateData<DocumentData>)
    },
    [listen, path, connectedMutate],
  )

  const connectedDelete = useCallback(() => {
    return deleteDocument(path, listen)
  }, [path, listen])

  return {
    data,
    isLoading,
    isValidating,
    revalidate,
    mutate: connectedMutate,
    error,
    set,
    update,
    /**
     * @deprecated use `isLoading` instead. Kept for backwards compatibility.
     */
    loading: isLoading,
    deleteDocument: connectedDelete,
    /**
     * A function that, when called, unsubscribes the Firestore listener.
     *
     * The function can be null, so make sure to check that it exists before calling it.
     *
     * **Note**: This is not necessary to use. `useDocument` already unmounts the listener for you. This is only intended if you want to unsubscribe on your own.
     */
    unsubscribe: unsubscribeRef.current,
  }
}
