import {
  getApp,
  getApps,
  initializeApp,
  type FirebaseApp,
  type FirebaseOptions,
} from 'firebase/app'
import { getFirestore, type Firestore } from 'firebase/firestore'

const isFirebaseApp = (
  value: FirebaseOptions | FirebaseApp,
): value is FirebaseApp => 'name' in value && 'options' in value

/**
 * Holds the Firestore instance every hook in this library reads from.
 *
 * Pass it either a Firebase config object, or an already-initialized
 * `FirebaseApp` (handy when the rest of your app initializes Firebase itself,
 * for instance in a Next.js app that shares one app instance across pages).
 */
export class Fuego {
  public readonly app: FirebaseApp
  public readonly db: Firestore

  constructor(configOrApp: FirebaseOptions | FirebaseApp) {
    if (isFirebaseApp(configOrApp)) {
      this.app = configOrApp
    } else {
      this.app = getApps().length ? getApp() : initializeApp(configOrApp)
    }
    this.db = getFirestore(this.app)
  }
}
