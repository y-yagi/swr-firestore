type MaybeFirestoreTimestamp = { toDate?: () => Date }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/**
 * Splits a lodash-style path (`user.createdAt`, `items[0].createdAt`) into keys.
 */
const toKeys = (path: string): string[] =>
  path
    .replace(/\[(\w+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)

const getIn = (source: unknown, keys: string[]): unknown =>
  keys.reduce<unknown>(
    (value, key) => (isRecord(value) ? value[key] : undefined),
    source,
  )

/**
 * Sets `value` at `keys`, cloning each object along the way so we never mutate
 * the nested objects we were handed.
 */
const setIn = (
  target: Record<string, unknown>,
  keys: string[],
  value: unknown,
) => {
  let current = target
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    const next = current[key]
    if (!isRecord(next)) return
    const clone = Array.isArray(next) ? [...next] : { ...next }
    current[key] = clone
    current = clone as Record<string, unknown>
  }
  current[keys[keys.length - 1]] = value
}

export function withDocumentDatesParsed<Data extends object>(
  data: Data,
  parseDates?: (keyof Data | string)[],
) {
  const doc = { ...data } as Data & Record<string, unknown>
  parseDates?.forEach(dateField => {
    if (typeof dateField !== 'string') return

    const keys = toKeys(dateField)
    if (!keys.length) return

    const unparsedDate = getIn(doc, keys) as MaybeFirestoreTimestamp | undefined
    if (unparsedDate) {
      const parsedDate: Date | undefined = unparsedDate.toDate?.()
      if (parsedDate) {
        setIn(doc, keys, parsedDate)
      }
    }
  })

  return doc as Data
}
