import { describe, expect, it } from 'vitest'

import { withDocumentDatesParsed } from '../helpers/doc-date-parser.js'

const timestamp = (date: Date) => ({ toDate: () => date })

describe('withDocumentDatesParsed', () => {
  it('returns a copy when no fields are given', () => {
    const data = { id: 'a' }
    const result = withDocumentDatesParsed(data)
    expect(result).toEqual(data)
    expect(result).not.toBe(data)
  })

  it('converts a top level timestamp into a Date', () => {
    const date = new Date('2020-01-01T00:00:00.000Z')
    const result = withDocumentDatesParsed(
      { id: 'a', createdAt: timestamp(date) },
      ['createdAt'],
    )
    expect(result.createdAt).toEqual(date)
  })

  it('converts a nested timestamp without mutating the source', () => {
    const date = new Date('2020-01-01T00:00:00.000Z')
    const user = { createdAt: timestamp(date) }
    const data = { id: 'a', user }
    const result = withDocumentDatesParsed(data, ['user.createdAt'])

    expect(result.user.createdAt).toEqual(date)
    // the original nested object is untouched
    expect(user.createdAt).not.toEqual(date)
  })

  it('supports bracket paths', () => {
    const date = new Date('2020-01-01T00:00:00.000Z')
    const result = withDocumentDatesParsed(
      { id: 'a', items: [{ createdAt: timestamp(date) }] },
      ['items[0].createdAt'],
    )
    expect(result.items[0].createdAt).toEqual(date)
  })

  it('leaves fields that are missing or not timestamps alone', () => {
    const result = withDocumentDatesParsed(
      { id: 'a', createdAt: 'not-a-timestamp' },
      ['createdAt', 'missing', 'missing.nested'],
    )
    expect(result.createdAt).toBe('not-a-timestamp')
    expect(result).not.toHaveProperty('missing')
  })
})
