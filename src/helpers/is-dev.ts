/**
 * `true` outside of production builds.
 *
 * `process.env.NODE_ENV` is written out literally so bundlers can statically
 * replace it, but it is read inside a try/catch because `process` simply does
 * not exist in a browser that has no polyfill and no bundler substitution.
 * In that case we fall back to `true`, so the dev-only warnings are shown
 * rather than silently swallowed.
 */
const nodeEnv = (): string | undefined => {
  try {
    return process.env.NODE_ENV
  } catch {
    return undefined
  }
}

export const isDev = nodeEnv() !== 'production'
