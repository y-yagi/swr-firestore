import type { SetOptions } from 'firebase/firestore'

/**
 * Firestore's `SetOptions` is a union, so `options.merge` cannot be read
 * without narrowing first. `merge` defaults to false, matching Firestore.
 */
export const shouldMerge = (options?: SetOptions): boolean =>
  !!options && 'merge' in options && !!options.merge
