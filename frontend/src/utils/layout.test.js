import { describe, it, expect } from 'vitest'
import { getLayoutedElements } from './layout.js'

describe('getLayoutedElements', () => {
  it('drops dangling edges', () => {
    const nodes = [
      { id: 'a', data: { label: 'A' } },
      { id: 'b', data: { label: 'B' } },
    ]
    const edges = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'a', target: 'missing' },
      { id: 'e3', source: 'ghost', target: 'b' },
    ]
    const { nodes: ln, edges: le } = getLayoutedElements(nodes, edges, 'TB')
    expect(le.map(e => e.id)).toEqual(['e1'])
    expect(ln).toHaveLength(2)
    // positions are assigned
    expect(ln[0].position).toHaveProperty('x')
    expect(ln[0].position).toHaveProperty('y')
  })

  it('handles empty and single node without crashing', () => {
    expect(() => getLayoutedElements([], [], 'TB')).not.toThrow()
    const { nodes } = getLayoutedElements([{ id: 'solo', data: { label: 'Solo' } }], [], 'TB')
    expect(nodes).toHaveLength(1)
  })

  it('filters malformed nodes', () => {
    const nodes = [
      { id: 'ok', data: { label: 'OK' } },
      { id: '', data: { label: 'empty id' } },
      { data: { label: 'no id' } },
      null,
    ]
    const { nodes: ln } = getLayoutedElements(nodes, [], 'TB')
    expect(ln.map(n => n.id)).toEqual(['ok'])
  })

  // Regression: dagre keys plain objects by node id, so ids colliding with
  // Object.prototype ("constructor", "toString", ...) crashed layout with
  // "Cannot set properties of undefined (setting 'order')".
  it.each([
    ['constructor'],
    ['toString'],
    ['valueOf'],
    ['__proto__'],
    ['hasOwnProperty'],
  ])('survives prototype-colliding id "%s"', (magic) => {
    const nodes = [
      { id: 'a', data: { label: 'A' } },
      { id: magic, data: { label: 'Magic' } },
      { id: 'b', data: { label: 'B' } },
    ]
    const edges = [
      { id: 'e1', source: 'a', target: magic },
      { id: 'e2', source: magic, target: 'b' },
      { id: 'e3', source: magic, target: magic },
    ]
    let result
    expect(() => { result = getLayoutedElements(nodes, edges, 'TB') }).not.toThrow()
    expect(result.nodes.map(n => n.id)).toEqual(['a', magic, 'b'])
    expect(result.edges.map(e => e.id)).toEqual(['e1', 'e2', 'e3'])
    for (const n of result.nodes) {
      expect(Number.isFinite(n.position.x)).toBe(true)
      expect(Number.isFinite(n.position.y)).toBe(true)
    }
  })
})
