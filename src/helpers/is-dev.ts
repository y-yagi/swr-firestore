/**
 * `true` outside of production builds. Written as a literal
 * `process.env.NODE_ENV` comparison so bundlers can statically replace it and
 * drop the dev-only warnings from production bundles.
 */
export const isDev =
  typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'
