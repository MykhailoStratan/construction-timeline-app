import { useCallback, useRef } from 'react'
import {
  Viewer,
  Cartesian3,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  HeightReference,
} from 'cesium'
import type { AnchorEntity, LineEntity } from '../entityTypes'

export function useDrawingEntities(viewer: Viewer | null) {
  const anchorsRef = useRef<AnchorEntity[]>([])
  const linesRef = useRef<LineEntity[]>([])

  const highlightLine = useCallback((line: LineEntity) => {
    if (line.polyline) {
      line.polyline.material = new ColorMaterialProperty(Color.RED)
      line.polyline.width = new ConstantProperty(3)
    }
  }, [])

  const unhighlightLine = useCallback((line: LineEntity) => {
    if (line.polyline) {
      line.polyline.material = new ColorMaterialProperty(Color.YELLOW)
      line.polyline.width = new ConstantProperty(2)
    }
  }, [])

  const highlightAnchor = useCallback((anchor: AnchorEntity) => {
    if (anchor.point) {
      anchor.point.color = new ConstantProperty(Color.RED)
      anchor.point.pixelSize = new ConstantProperty(10)
    }
  }, [])

  const unhighlightAnchor = useCallback((anchor: AnchorEntity) => {
    if (anchor.point) {
      anchor.point.color = new ConstantProperty(Color.ORANGE)
      anchor.point.pixelSize = new ConstantProperty(8)
    }
  }, [])

  const addAnchor = useCallback(
    (
      position: Cartesian3,
      heightReference: HeightReference = HeightReference.CLAMP_TO_GROUND,
    ): AnchorEntity | null => {
      if (!viewer) {
        return null
      }
      for (const existing of anchorsRef.current) {
        const pos = existing.position?.getValue(viewer.clock.currentTime)
        if (pos && Cartesian3.distance(pos, position) < 1) {
          return existing
        }
      }
      const anchor = viewer.entities.add({
        position,
        point: {
          pixelSize: 8,
          color: Color.ORANGE,
          outlineColor: Color.WHITE,
          outlineWidth: 1,
          heightReference,
        },
      }) as AnchorEntity
      anchor.isAnchor = true
      anchor.connectedLines = new Set()
      anchorsRef.current.push(anchor)
      return anchor
    },
    [viewer],
  )

  const removeLine = useCallback(
    (line: LineEntity) => {
      if (!viewer) return
      viewer.entities.remove(line)
      linesRef.current = linesRef.current.filter((l) => l !== line)
      if (line.anchors) {
        for (const anchor of line.anchors) {
          anchor.connectedLines.delete(line)
          if (anchor.connectedLines.size === 0) {
            viewer.entities.remove(anchor)
            anchorsRef.current = anchorsRef.current.filter((e) => e !== anchor)
          }
        }
      }
    },
    [viewer],
  )

  const removeAnchor = useCallback(
    (anchor: AnchorEntity) => {
      if (!viewer) return
      viewer.entities.remove(anchor)
      anchorsRef.current = anchorsRef.current.filter((e) => e !== anchor)
      if (anchor.connectedLines) {
        for (const line of Array.from(anchor.connectedLines)) {
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
