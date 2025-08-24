/**
 * Custom ForceGraph2D component that replaces react-force-graph-2d
 *
 * This component wraps D3's force simulation directly to provide a force-directed graph
 * with the same API as the original react-force-graph-2d library.
 *
 * Features:
 * - Canvas-based rendering for performance
 * - D3 force simulation with customizable forces
 * - Interactive node dragging, zooming, and panning
 * - Customizable node and link styling
 * - Hover tooltips and click handling
 * - Support for large datasets
 */
import { drag } from 'd3-drag'
import * as d3 from 'd3-force'
import { select } from 'd3-selection'
import { zoom } from 'd3-zoom'
import React, { useCallback, useEffect, useRef, useState } from 'react'

// Types that match the original react-force-graph-2d API
export interface LinkObject<NodeType> {
  source: NodeType | string
  target: NodeType | string
  type?: string
  [key: string]: unknown
}

export interface GraphData<NodeType = object, LinkType = object> {
  nodes: NodeType[]
  links: LinkType[]
}

export interface ForceGraph2DProps<NodeType = object, LinkType = object> {
  graphData: GraphData<NodeType, LinkType>
  width?: number
  height?: number
  nodeLabel?: (node: NodeType) => string
  nodeColor?: (node: NodeType) => string
  nodeSize?: number | ((node: NodeType) => number)
  linkLabel?: (link: LinkObject<NodeType>) => string
  linkColor?: (link: LinkObject<NodeType>) => string
  linkWidth?: number | ((link: LinkObject<NodeType>) => number)
  backgroundColor?: string
  nodeCanvasObject?: (node: NodeType, ctx: CanvasRenderingContext2D, globalScale: number) => void
  linkCanvasObject?: (link: LinkObject<NodeType>, ctx: CanvasRenderingContext2D, globalScale: number) => void
  onNodeClick?: (node: NodeType, event: MouseEvent) => void
  onNodeHover?: (node: NodeType | null, prevNode: NodeType | null) => void
  onLinkClick?: (link: LinkObject<NodeType>, event: MouseEvent) => void
  onLinkHover?: (link: LinkObject<NodeType> | null, prevLink: LinkObject<NodeType> | null) => void
  enableZoomInteraction?: boolean
  enablePanInteraction?: boolean
  enableNodeDrag?: boolean
}

// Internal node type for D3 simulation
interface SimulationNodeType extends d3.SimulationNodeDatum {
  id: string
  [key: string]: unknown
}

// Internal link type for D3 simulation
interface SimulationLinkType extends d3.SimulationLinkDatum<SimulationNodeType> {
  [key: string]: unknown
}

export default function ForceGraph2D<
  NodeType extends { id: string },
  LinkType extends { source: string | NodeType; target: string | NodeType }
>({
  graphData,
  width = 800,
  height = 600,
  nodeLabel,
  nodeColor = () => '#1f77b4',
  nodeSize = 5,
  linkLabel,
  linkColor = () => '#999',
  linkWidth = 1,
  backgroundColor = '#ffffff',
  nodeCanvasObject,
  linkCanvasObject,
  onNodeClick,
  onNodeHover,
  onLinkClick,
  onLinkHover,
  enableZoomInteraction = true,
  enablePanInteraction = true,
  enableNodeDrag = true
}: ForceGraph2DProps<NodeType, LinkType>) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const simulationRef = useRef<d3.Simulation<SimulationNodeType, SimulationLinkType> | null>(null)
  const transformRef = useRef({ k: 1, x: 0, y: 0 })
  const [hoveredNode, setHoveredNode] = useState<NodeType | null>(null)
  const [hoveredLink, setHoveredLink] = useState<LinkObject<NodeType> | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null)

  // Convert graph data to simulation format
  const simulationData = React.useMemo(() => {
    const nodeMap = new Map<string, SimulationNodeType>()

    const simNodes: SimulationNodeType[] = graphData.nodes.map((node) => {
      const simNode = { ...node } as SimulationNodeType
      nodeMap.set(node.id, simNode)
      return simNode
    })

    const simLinks: SimulationLinkType[] = graphData.links.map((link) => ({
      ...link,
      source: typeof link.source === 'string' ? link.source : link.source.id,
      target: typeof link.target === 'string' ? link.target : link.target.id
    }))

    return { nodes: simNodes, links: simLinks, nodeMap }
  }, [graphData])

  // Drawing function
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { k, x, y } = transformRef.current

    // Clear canvas
    ctx.save()
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = backgroundColor
    ctx.fillRect(0, 0, width, height)

    // Apply transform
    ctx.translate(x, y)
    ctx.scale(k, k)

    // Draw links
    if (!linkCanvasObject) {
      simulationData.links.forEach((link) => {
        const sourceNode =
          typeof link.source === 'object' ? link.source : simulationData.nodeMap.get(link.source as string)
        const targetNode =
          typeof link.target === 'object' ? link.target : simulationData.nodeMap.get(link.target as string)

        if (
          !sourceNode ||
          !targetNode ||
          sourceNode.x == null ||
          sourceNode.y == null ||
          targetNode.x == null ||
          targetNode.y == null
        )
          return

        ctx.beginPath()
        ctx.moveTo(sourceNode.x, sourceNode.y)
        ctx.lineTo(targetNode.x, targetNode.y)
        ctx.strokeStyle = linkColor ? linkColor(link as LinkObject<NodeType>) : '#999'
        ctx.lineWidth = (typeof linkWidth === 'function' ? linkWidth(link as LinkObject<NodeType>) : linkWidth) / k
        ctx.stroke()
      })
    } else {
      simulationData.links.forEach((link) => {
        linkCanvasObject(link as LinkObject<NodeType>, ctx, k)
      })
    }

    // Draw nodes
    if (!nodeCanvasObject) {
      simulationData.nodes.forEach((node) => {
        if (node.x == null || node.y == null) return

        ctx.beginPath()
        const radius = (typeof nodeSize === 'function' ? nodeSize(node as NodeType) : nodeSize) / k
        ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI)
        ctx.fillStyle = nodeColor ? nodeColor(node as NodeType) : '#1f77b4'
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.5 / k
        ctx.stroke()
      })
    } else {
      simulationData.nodes.forEach((node) => {
        nodeCanvasObject(node as NodeType, ctx, k)
      })
    }

    ctx.restore()
  }, [
    simulationData,
    width,
    height,
    backgroundColor,
    nodeColor,
    nodeSize,
    linkColor,
    linkWidth,
    nodeCanvasObject,
    linkCanvasObject
  ])

  // Create and update D3 simulation
  useEffect(() => {
    if (!simulationData.nodes.length) return

    // Create or update simulation
    if (!simulationRef.current) {
      simulationRef.current = d3
        .forceSimulation<SimulationNodeType>(simulationData.nodes)
        .force(
          'link',
          d3
            .forceLink<SimulationNodeType, SimulationLinkType>(simulationData.links)
            .id((d) => d.id)
            .distance(30)
        )
        .force('charge', d3.forceManyBody().strength(-300))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(10))
    } else {
      // Update existing simulation
      simulationRef.current.nodes(simulationData.nodes)
      const linkForce = simulationRef.current.force('link') as d3.ForceLink<SimulationNodeType, SimulationLinkType>
      if (linkForce) {
        linkForce.links(simulationData.links)
      }
      simulationRef.current.force('center', d3.forceCenter(width / 2, height / 2))
      simulationRef.current.alpha(1).restart()
    }

    // Set up simulation tick handler
    simulationRef.current.on('tick', () => {
      draw()
    })

    return () => {
      if (simulationRef.current) {
        simulationRef.current.stop()
      }
    }
  }, [simulationData, width, height, draw])

  // Get node at screen coordinates
  const getNodeAtPosition = useCallback(
    (x: number, y: number): NodeType | null => {
      const { k, x: tx, y: ty } = transformRef.current
      const adjustedX = (x - tx) / k
      const adjustedY = (y - ty) / k

      for (const node of simulationData.nodes) {
        if (node.x == null || node.y == null) continue
        const radius = typeof nodeSize === 'function' ? nodeSize(node as NodeType) : nodeSize
        const distance = Math.sqrt((adjustedX - node.x) ** 2 + (adjustedY - node.y) ** 2)
        if (distance <= radius) {
          return node as NodeType
        }
      }
      return null
    },
    [simulationData.nodes, nodeSize]
  )

  // Get link at screen coordinates
  const getLinkAtPosition = useCallback(
    (x: number, y: number): LinkObject<NodeType> | null => {
      const { k, x: tx, y: ty } = transformRef.current
      const adjustedX = (x - tx) / k
      const adjustedY = (y - ty) / k
      const threshold = 5 / k // 5 pixel threshold

      for (const link of simulationData.links) {
        const sourceNode =
          typeof link.source === 'object' ? link.source : simulationData.nodeMap.get(link.source as string)
        const targetNode =
          typeof link.target === 'object' ? link.target : simulationData.nodeMap.get(link.target as string)

        if (
          !sourceNode ||
          !targetNode ||
          sourceNode.x == null ||
          sourceNode.y == null ||
          targetNode.x == null ||
          targetNode.y == null
        )
          continue

        // Calculate distance from point to line segment
        const dx = targetNode.x - sourceNode.x
        const dy = targetNode.y - sourceNode.y
        const length = Math.sqrt(dx * dx + dy * dy)
        if (length === 0) continue

        const t = Math.max(
          0,
          Math.min(1, ((adjustedX - sourceNode.x) * dx + (adjustedY - sourceNode.y) * dy) / (length * length))
        )
        const closestX = sourceNode.x + t * dx
        const closestY = sourceNode.y + t * dy
        const distance = Math.sqrt((adjustedX - closestX) ** 2 + (adjustedY - closestY) ** 2)

        if (distance <= threshold) {
          return link as LinkObject<NodeType>
        }
      }
      return null
    },
    [simulationData.links, simulationData.nodeMap]
  )

  // Mouse event handlers
  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top

      // Check for hovered node
      const node = getNodeAtPosition(x, y)
      if (node !== hoveredNode) {
        onNodeHover?.(node, hoveredNode)
        setHoveredNode(node)

        if (node && nodeLabel) {
          setTooltip({ x: event.clientX, y: event.clientY, content: nodeLabel(node) })
        } else {
          setTooltip(null)
        }
      }

      // Check for hovered link if no node is hovered
      if (!node) {
        const link = getLinkAtPosition(x, y)
        if (link !== hoveredLink) {
          onLinkHover?.(link, hoveredLink)
          setHoveredLink(link)

          if (link && linkLabel) {
            setTooltip({ x: event.clientX, y: event.clientY, content: linkLabel(link) })
          } else {
            setTooltip(null)
          }
        }
      } else if (hoveredLink) {
        onLinkHover?.(null, hoveredLink)
        setHoveredLink(null)
      }
    },
    [getNodeAtPosition, getLinkAtPosition, hoveredNode, hoveredLink, onNodeHover, onLinkHover, nodeLabel, linkLabel]
  )

  const handleMouseLeave = useCallback(() => {
    if (hoveredNode) {
      onNodeHover?.(null, hoveredNode)
      setHoveredNode(null)
    }
    if (hoveredLink) {
      onLinkHover?.(null, hoveredLink)
      setHoveredLink(null)
    }
    setTooltip(null)
  }, [hoveredNode, hoveredLink, onNodeHover, onLinkHover])

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top

      const node = getNodeAtPosition(x, y)
      if (node) {
        onNodeClick?.(node, event.nativeEvent)
        return
      }

      const link = getLinkAtPosition(x, y)
      if (link) {
        onLinkClick?.(link, event.nativeEvent)
      }
    },
    [getNodeAtPosition, getLinkAtPosition, onNodeClick, onLinkClick]
  )

  // Set up zoom and drag behavior
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const selection = select(canvas)

    // Zoom behavior
    if (enableZoomInteraction || enablePanInteraction) {
      const zoomBehavior = zoom<HTMLCanvasElement, unknown>()
        .scaleExtent([0.1, 10])
        .on('zoom', (event) => {
          transformRef.current = event.transform
          draw()
        })

      selection.call(zoomBehavior)
    }

    // Node drag behavior
    if (enableNodeDrag) {
      const dragBehavior = drag<HTMLCanvasElement, unknown>()
        .on('start', (event) => {
          const [x, y] = [event.x, event.y]
          const node = getNodeAtPosition(x, y)
          if (node && simulationRef.current) {
            simulationRef.current.alphaTarget(0.3).restart()
            const simNode = simulationData.nodeMap.get(node.id)
            if (simNode) {
              simNode.fx = simNode.x
              simNode.fy = simNode.y
            }
          }
        })
        .on('drag', (event) => {
          const [x, y] = [event.x, event.y]
          const node = getNodeAtPosition(x, y)
          if (node) {
            const simNode = simulationData.nodeMap.get(node.id)
            if (simNode) {
              const { k, x: tx, y: ty } = transformRef.current
              simNode.fx = (x - tx) / k
              simNode.fy = (y - ty) / k
            }
          }
        })
        .on('end', (event) => {
          if (simulationRef.current) {
            simulationRef.current.alphaTarget(0)
          }
          const [x, y] = [event.x, event.y]
          const node = getNodeAtPosition(x, y)
          if (node) {
            const simNode = simulationData.nodeMap.get(node.id)
            if (simNode) {
              simNode.fx = null
              simNode.fy = null
            }
          }
        })

      selection.call(dragBehavior)
    }

    // Initial draw
    draw()
  }, [draw, enableZoomInteraction, enablePanInteraction, enableNodeDrag, getNodeAtPosition, simulationData.nodeMap])

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ display: 'block', cursor: 'grab' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      />
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x + 10,
            top: tooltip.y - 10,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '4px 8px',
            borderRadius: '4px',
            pointerEvents: 'none',
            zIndex: 1000,
            fontSize: '12px',
            whiteSpace: 'nowrap'
          }}
        >
          {tooltip.content}
        </div>
      )}
    </div>
  )
}
