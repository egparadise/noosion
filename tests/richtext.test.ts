import { describe, expect, it } from 'vitest'
import {
  concatRichText,
  fromPlain,
  inlineMarkdownToRichText,
  plainText,
  removeRange,
  richTextEquals,
  richTextToMarkdown,
  sliceRichText
} from '../src/renderer/src/lib/richtext'
import type { RichText } from '../src/shared/types'

const sample: RichText = [['Hello '], ['bold', [['b']]], [' world']]

describe('richtext', () => {
  it('extracts plain text', () => {
    expect(plainText(sample)).toBe('Hello bold world')
    expect(plainText(undefined)).toBe('')
    expect(plainText(fromPlain('abc'))).toBe('abc')
  })

  it('slices across decorated segments', () => {
    const s = sliceRichText(sample, 3, 8)
    expect(plainText(s)).toBe('lo bo')
    expect(s.some(([, d]) => d?.some((x) => x[0] === 'b'))).toBe(true)
  })

  it('removes a range and concatenates', () => {
    expect(plainText(removeRange(sample, 5, 10))).toBe('Hello world')
    expect(plainText(concatRichText(fromPlain('a'), fromPlain('b')))).toBe('ab')
  })

  it('compares structurally', () => {
    expect(richTextEquals(sample, JSON.parse(JSON.stringify(sample)))).toBe(true)
    expect(richTextEquals(sample, fromPlain('Hello bold world'))).toBe(false)
  })

  it('round-trips inline markdown', () => {
    const md = 'a **b** *c* ~~d~~ `e` [f](https://x.dev)'
    const rt = inlineMarkdownToRichText(md)
    expect(plainText(rt)).toBe('a b c d e f')
    expect(richTextToMarkdown(rt)).toBe(md)
  })
})
