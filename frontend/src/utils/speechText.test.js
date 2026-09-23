import { describe, it, expect } from 'vitest'
import { stripMarkdown } from './speechText.js'

describe('stripMarkdown', () => {
  it('strips heading markers', () => {
    expect(stripMarkdown('## How It Works')).toBe('How It Works')
    expect(stripMarkdown('# Binary Search')).toBe('Binary Search')
    expect(stripMarkdown('### Details')).toBe('Details')
  })

  it('strips bold, italic and inline code', () => {
    expect(stripMarkdown('**O(log n)** time')).toBe('O(log n) time')
    expect(stripMarkdown('*right*')).toBe('right')
    expect(stripMarkdown('`O(1)` space')).toBe('O(1) space')
  })

  it('strips bullets and blockquotes', () => {
    expect(stripMarkdown('- Check the middle')).toBe('Check the middle')
    expect(stripMarkdown('* Go left')).toBe('Go left')
    expect(stripMarkdown('> Key takeaway: halve')).toBe('Key takeaway: halve')
  })

  it('keeps numbered list numbers', () => {
    expect(stripMarkdown('1. Pick mid')).toBe('1. Pick mid')
  })

  it('strips code fences but keeps content', () => {
    const md = '```js\nconst mid = (lo + hi) >> 1;\n```'
    const out = stripMarkdown(md)
    expect(out).not.toContain('```')
    expect(out).toContain('const mid')
  })

  it('replaces links and images with visible text', () => {
    expect(stripMarkdown('See [docs](https://example.com)')).toBe('See docs')
    expect(stripMarkdown('![alt text](https://example.com/img.png)')).toBe('alt text')
  })

  it('handles mixed markdown', () => {
    const md = ['# Binary Search', '## How It Works', '**O(log n)** and `O(1)`', '- Check middle', '> Note: halve'].join('\n')
    const out = stripMarkdown(md)
    expect(out).not.toMatch(/#/)
    expect(out).not.toMatch(/\*\*/)
    expect(out).not.toMatch(/`/)
    expect(out).toContain('Binary Search')
    expect(out).toContain('How It Works')
    expect(out).toContain('O(log n)')
  })
})
