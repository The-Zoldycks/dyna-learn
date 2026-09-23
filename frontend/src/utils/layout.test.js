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
})
