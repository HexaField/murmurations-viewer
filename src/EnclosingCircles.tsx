import { useMemo } from 'react'
import type { ForceGraphProps, LinkObject, NodeObject } from 'react-force-graph-2d'
import type { GraphData, NodeData } from './types'

// Tiny MEC (Welzl). You can replace with 'smallest-enclosing-circle' if you prefer.
function minEnclosingCircle(points: { x: number; y: number }[], pad = 16) {
  const P = points.map((p) => ({ ...p }))
  for (let i = P.length - 1; i > 0; --i) {
    const j = (Math.random() * (i + 1)) | 0
    ;[P[i], P[j]] = [P[j], P[i]]
  }
  let c: { x: number; y: number; r: number } | null = null
  const dist2 = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = a.x - b.x,
      dy = a.y - b.y
    return dx * dx + dy * dy
  }
  const inC = (p: { x: number; y: number }, cc: { x: number; y: number; r: number }) =>
    dist2(p, cc) <= (cc.r + 1e-7) * (cc.r + 1e-7)
  const c2 = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    r: Math.hypot(a.x - b.x, a.y - b.y) / 2
  })
  const c3 = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) => {
    const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
    if (Math.abs(d) < 1e-12) {
      const cs = [c2(a, b), c2(a, c), c2(b, c)].sort((u, v) => u.r - v.r)
      for (const cc of cs) if (inC(a, cc) && inC(b, cc) && inC(c, cc)) return cc
      return cs[0]
    }
    const ux =
      ((a.x * a.x + a.y * a.y) * (b.y - c.y) +
        (b.x * b.x + b.y * b.y) * (c.y - a.y) +
        (c.x * c.x + c.y * c.y) * (a.y - b.y)) /
      d
    const uy =
      ((a.x * a.x + a.y * a.y) * (c.x - b.x) +
        (b.x * b.x + b.y * b.y) * (a.x - c.x) +
        (c.x * c.x + c.y * c.y) * (b.x - a.x)) /
      d
    return { x: ux, y: uy, r: Math.hypot(a.x - ux, a.y - uy) }
  }

  for (let i = 0; i < P.length; i++) {
    const p = P[i]
    if (!c || !inC(p, c)) {
      c = { x: p.x, y: p.y, r: 0 }
      for (let j = 0; j < i; j++) {
        const q = P[j]
        if (!inC(q, c)) {
          c = c2(p, q)
          for (let k = 0; k < j; k++) {
            const r = P[k]
            if (!inC(r, c)) c = c3(p, q, r)
          }
        }
      }
    }
  }
  if (!c) return { x: 0, y: 0, r: 0 }
  c.r += pad
  return c
}

export const useEnclosingCircles = (data: GraphData, enabled: boolean) => {
  // Build adjacency for quick “related nodes” lookup
  const neighbors = useMemo(() => {
    const map = new Map<string, Set<NodeData>>()
    const byId = new Map(data.nodes.map((n) => [n.id, n]))
    data.nodes.forEach((n) => map.set(n.id, new Set()))
    data.links.forEach((l) => {
      const s = typeof l.source === 'string' ? byId.get(l.source)! : (l.source as NodeData)
      const t = typeof l.target === 'string' ? byId.get(l.target)! : (l.target as NodeData)
      map.get(s.id)!.add(t)
      map.get(t.id)!.add(s)
    })
    return { byId, map }
  }, [data])

  const groupIds = useMemo(
    () => (enabled ? data.nodes.filter((n) => n.type === 'tag').map((n) => n.id) : []),
    [data, enabled]
  )

  return {
    // draw the highlight circles AFTER the graph each frame
    onRenderFramePost: (ctx, globalScale) => {
      ctx.save()
      // keep widths/dashes consistent while zooming
      const lw = 2 / globalScale
      const dash = [6 / globalScale, 4 / globalScale]
      ctx.lineWidth = lw
      ctx.setLineDash(dash)
      ctx.strokeStyle = '#3b82f6'
      ctx.globalAlpha = 0.9

      for (const gid of groupIds) {
        const ns = neighbors.map.get(gid) as Set<NodeData & { x?: number; y?: number }>
        if (!ns || ns.size === 0) continue

        // use current sim positions (already in graph coords)
        const pts: { x: number; y: number }[] = []
        ns.forEach((n) => {
          if (Number.isFinite(n.x) && Number.isFinite(n.y)) pts.push({ x: n.x!, y: n.y! })
        })
        if (pts.length === 0) continue

        const c = minEnclosingCircle(pts, 16) // 16px padding
        ctx.beginPath()
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2)
        ctx.stroke()

        // optional: subtle fill
        // ctx.fillStyle = 'rgba(59,130,246,0.08)';
        // ctx.fill();
      }
      ctx.restore()
    },
    // optional: draw group nodes differently
    nodeCanvasObjectMode: (node) => (node.type === 'tag' && enabled ? 'after' : undefined),
    nodeCanvasObject: (node, ctx, scale) => {
      if (node.type !== 'tag' || !enabled) return
      const r = 6 / scale
      ctx.beginPath()
      ctx.arc(node.x!, node.y!, r, 0, 2 * Math.PI)
      ctx.fillStyle = '#1f2937'
      ctx.fill()
      ctx.strokeStyle = '#3b82f6'
      ctx.lineWidth = 2 / scale
      ctx.stroke()
    }
  } as Partial<ForceGraphProps<NodeObject<NodeData>, LinkObject<NodeData>>>
}
