import { initializeApp, type FirebaseApp } from 'firebase/app'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'

import { collectionCache } from '../../classes/Cache.js'
import { Fuego } from '../../classes/Fuego.js'
import { setFuego } from '../../context/index.js'

export const EMULATOR_HOST = '127.0.0.1'
export const EMULATOR_PORT = 8080

/**
 * A `demo-` prefixed id never resolves to a real Firebase project, so these
 * tests cannot reach live resources even if the emulator is not running.
 */
export const PROJECT_ID = 'demo-swr-firestore'

let app: FirebaseApp | undefined

/**
 * Points the library's `fuego` singleton at the emulator.
 *
 * `connectFirestoreEmulator` has to run before any other Firestore call, so we
 * wire the emulator up on the raw `Firestore` first and only then hand the
 * already-initialized app to `Fuego`.
 */
export const connectToEmulator = () => {
  if (!app) {
    app = initializeApp({ projectId: PROJECT_ID })
    connectFirestoreEmulator(getFirestore(app), EMULATOR_HOST, EMULATOR_PORT)
  }
  setFuego(new Fuego(app))
  return app
}

/** Wipes every document in the emulator. */
export const clearFirestore = async () => {
  const response = await fetch(
    `http://${EMULATOR_HOST}:${EMULATOR_PORT}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  )
  if (!response.ok) {
    throw new Error(
      `could not clear the firestore emulator: ${response.status} ${response.statusText}`,
    )
  }
}

/**
 * A collection path nothing else touches.
 *
 * Tests share one emulator and one swr cache, so isolating by path is both
 * cheaper and less flaky than clearing state between every test.
 */
export const uniquePath = (name = 'docs') =>
  `it-${crypto.randomUUID()}/scope/${name}`

/** Drops the collection-path cache so keys do not leak across tests. */
export const resetCollectionCache = () => collectionCache.clear()
