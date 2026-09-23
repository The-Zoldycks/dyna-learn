import { describe, it, expect } from 'vitest'

// mock window for share hash (uses window.btoa/atob + escape)
globalThis.window = globalThis.window || {}
if (!globalThis.window.btoa) {
  globalThis.window.btoa = (str) => Buffer.from(str, 'binary').toString('base64')
  globalThis.window.atob = (str) => Buffer.from(str, 'base64').toString('binary')
}
if (typeof globalThis.escape === 'undefined') {
  globalThis.escape = (str) => encodeURIComponent(str).replace(/%20/g, '+')
  globalThis.unescape = (str) => decodeURIComponent(str.replace(/\+/g, '%20'))
}
if (typeof globalThis.window.escape === 'undefined') {
  globalThis.window.escape = globalThis.escape
  globalThis.window.unescape = globalThis.unescape
}

import { encodeShareHash, decodeShareHash } from './export.js'

describe('share hash round-trip', () => {
  it('encodes and decodes compact v2', () => {
    const nodes = [
      { id: 'a', data: { label: 'Planning', icon: 'clipboard', shape: 'rectangle', highlight: false }, position: { x: 10, y: 20 } },
      { id: 'b', data: { label: 'Design', icon: 'palette', highlight: true }, position: { x: 30, y: 40 } },
    ]
    const edges = [{ id: 'e1', source: 'a', target: 'b', label: 'next' }]
    const hash = encodeShareHash(nodes, edges)
    expect(hash).toBeTruthy()
    const decoded = decodeShareHash(hash)
    expect(decoded.nodes).toHaveLength(2)
    expect(decoded.nodes[0].id).toBe('a')
    expect(decoded.nodes[0].data.label).toBe('Planning')
    expect(decoded.nodes[1].data.highlight).toBe(true)
    expect(decoded.edges).toHaveLength(1)
    expect(decoded.edges[0].source).toBe('a')
  })

  it('returns null for empty input', () => {
    expect(decodeShareHash('')).toBeNull()
    expect(decodeShareHash(null)).toBeNull()
  })
})
