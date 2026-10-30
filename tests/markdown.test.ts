import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '../src/renderer/src/lib/markdown'
import { plainText } from '../src/renderer/src/lib/richtext'

describe('markdown import', () => {
  it('parses title and block types', () => {
    const md = [
      '# My Page',
      '',
      '## Section',
      '- item **one**',
      '  - nested',
      '- [x] done task',
      '1. first',
      '> quote',
      '---',
      '```ts',
      'const a = 1',
      '```',
      '| a | b |',
      '|---|---|',
      '| 1 | 2 |',
      'plain paragraph'
    ].join('\n')
    const { title, blocks } = parseMarkdown(md)
    expect(title).toBe('My Page')
    expect(blocks.map((b) => b.type)).toEqual(['sub_header', 'bulleted_list', 'to_do', 'numbered_list', 'quote', 'divider', 'code', 'table', 'text'])
    expect(blocks[1]!.children.map((c) => plainText(c.title))).toEqual(['nested'])
    expect(blocks[2]!.checked).toBe(true)
    expect(blocks[6]!.language).toBe('ts')
    expect(blocks[7]!.rows).toEqual([['a', 'b'], ['1', '2']])
  })
})
