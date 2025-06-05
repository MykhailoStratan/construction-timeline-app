import { useCallback, useRef } from 'react'
import {
  Viewer,
  Entity,
  Cartesian3,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  HeightReference,
} from 'cesium'

export function useDrawingEntities(viewer: Viewer | null) {
  const anchorsRef = useRef<Entity[]>([])
  const linesRef = useRef<Entity[]>([])

  const highlightLine = useCallback((line: Entity) => {
    if (line.polyline) {
      line.polyline.material = new ColorMaterialProperty(Color.RED)
      line.polyline.width = new ConstantProperty(3)
    }
  }, [])

  const unhighlightLine = useCallback((line: Entity) => {
    if (line.polyline) {
      line.polyline.material = new ColorMaterialProperty(Color.YELLOW)
      line.polyline.width = new ConstantProperty(2)
    }
  }, [])

  const highlightAnchor = useCallback((anchor: Entity) => {
    if (anchor.point) {
      anchor.point.color = new ConstantProperty(Color.RED)
      anchor.point.pixelSize = new ConstantProperty(10)
    }
  }, [])

  const unhighlightAnchor = useCallback((anchor: Entity) => {
    if (anchor.point) {
      anchor.point.color = new ConstantProperty(Color.ORANGE)
      anchor.point.pixelSize = new ConstantProperty(8)
    }
  }, [])

  const addAnchor = useCallback(
    (position: Cartesian3) => {
      if (!viewer) {
        return null
      }
      for (const existing of anchorsRef.current) {
        const pos = existing.position?.getValue(viewer.clock.currentTime)
        if (pos && Cartesian3.distance(pos, position) < 1) {
          return existing
        }
      }
      const anchor: Entity = viewer.entities.add({
        position,
        point: {
          pixelSize: 8,
          color: Color.ORANGE,
          outlineColor: Color.WHITE,
          outlineWidth: 1,
          heightReference: HeightReference.CLAMP_TO_GROUND,
        },
      })
      ;(anchor as Entity & { isAnchor: boolean; connectedLines: Set<Entity> }).isAnchor = true
      ;(anchor as Entity & { isAnchor: boolean; connectedLines: Set<Entity> }).connectedLines = new Set()
      anchorsRef.current.push(anchor)
      return anchor
    },
    [viewer],
  )

  const removeLine = useCallback(
    (line: Entity) => {
      if (!viewer) return
      viewer.entities.remove(line)
      linesRef.current = linesRef.current.filter((l) => l !== line)
      const lineWithAnchors = line as Entity & { anchors?: [Entity, Entity] }
      if (lineWithAnchors.anchors) {
        for (const anchor of lineWithAnchors.anchors) {
          const a = anchor as Entity & { connectedLines?: Set<Entity> }
          a.connectedLines?.delete(line)
          if (!a.connectedLines || a.connectedLines.size === 0) {
            viewer.entities.remove(a)
            anchorsRef.current = anchorsRef.current.filter((e) => e !== a)
          }
        }
      }
    },
    [viewer],
  )

  const removeAnchor = useCallback(
    (anchor: Entity) => {
      if (!viewer) return
      viewer.entities.remove(anchor)
      anchorsRef.current = anchorsRef.current.filter((e) => e !== anchor)
      const anchorWithLines = anchor as Entity & { connectedLines?: Set<Entity> }
      if (anchorWithLines.connectedLines) {
        for (const line of Array.from(anchorWithLines.connectedLines)) {
          removeLine(line)
        }
      }
    },
    [removeLine, viewer],
  )

  return {
    anchorsRef,
    linesRef,
    highlightLine,
    unhighlightLine,
    highlightAnchor,
    unhighlightAnchor,
    addAnchor,
    removeLine,
    removeAnchor,
  }
}
