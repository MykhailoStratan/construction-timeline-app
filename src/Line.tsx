import { useState, useRef, useEffect } from 'react'
import {
  Viewer,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  CallbackProperty,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  Cartesian3,
  HeightReference,
} from 'cesium'
import type { AnchorEntity, LineEntity } from './entityTypes'
import { useDrawing } from './hooks/DrawingContext'

interface LineProps {
  viewer: Viewer | null
}

const Line = ({ viewer }: LineProps) => {
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null)
  const startAnchorRef = useRef<AnchorEntity | null>(null)
  const drawingLineRef = useRef<LineEntity | null>(null)
  const startPositionRef = useRef<Cartesian3 | null>(null)
  const mousePositionRef = useRef<Cartesian3 | null>(null)
  const [isActive, setIsActive] = useState(false)

  const { addAnchor, linesRef } = useDrawing()

  const getPosition = (
    event: ScreenSpaceEventHandler.PositionedEvent | ScreenSpaceEventHandler.MotionEvent,
  ): Cartesian3 | null => {
    const pos = 'position' in event ? event.position : event.endPosition
    const picked = viewer!.scene.pick(pos)
    if (picked) {
      const entity = picked.id as AnchorEntity | undefined
      if (entity?.isAnchor) {
        return entity.position?.getValue(viewer!.clock.currentTime) || null
      }
    }
    if (viewer!.scene.pickPositionSupported) {
      const world = viewer!.scene.pickPosition(pos)
      if (world) {
        return world
      }
    }
    const ray = viewer!.camera.getPickRay(pos)
    if (ray) {
      const ground = viewer!.scene.globe.pick(ray, viewer!.scene)
      if (ground) {
        return ground
      }
    }
    return viewer!.camera.pickEllipsoid(pos) || null
  }

  const start = () => {
    if (!viewer) return
    if (handlerRef.current) {
      handlerRef.current.destroy()
      handlerRef.current = null
      setIsActive(false)
      if (drawingLineRef.current) {
        viewer.entities.remove(drawingLineRef.current)
        drawingLineRef.current = null
      }
      if (startAnchorRef.current) {
        viewer.entities.remove(startAnchorRef.current)
        startAnchorRef.current = null
      }
      startPositionRef.current = null
      mousePositionRef.current = null
      return
    }
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    handlerRef.current = handler
    setIsActive(true)
    let isDrawing = false

    handler.setInputAction((event: ScreenSpaceEventHandler.PositionedEvent) => {
      const position = getPosition(event)
      if (!position) return
      if (!isDrawing) {
        startPositionRef.current = position
        mousePositionRef.current = position
        startAnchorRef.current = addAnchor(position, HeightReference.NONE)!
        const dynamicPositions = new CallbackProperty(() => {
          if (!startPositionRef.current || !mousePositionRef.current) {
            return []
          }
          return [startPositionRef.current, mousePositionRef.current]
        }, false)
        drawingLineRef.current = viewer.entities.add({
          polyline: {
            positions: dynamicPositions,
            width: new ConstantProperty(2),
            material: new ColorMaterialProperty(Color.YELLOW),
          },
        }) as LineEntity
        isDrawing = true
      } else {
        const endAnchor = addAnchor(position, HeightReference.NONE)!
        const line = drawingLineRef.current!
        line.polyline!.positions = new ConstantProperty([
          startPositionRef.current!,
          position,
        ])
        line.isLine = true
        line.anchors = [startAnchorRef.current!, endAnchor]
        startAnchorRef.current!.connectedLines.add(line)
        endAnchor.connectedLines.add(line)
        linesRef.current.push(line)
        drawingLineRef.current = null
        startAnchorRef.current = null
        startPositionRef.current = null
        mousePositionRef.current = null
        isDrawing = false
        handlerRef.current?.destroy()
        handlerRef.current = null
        setIsActive(false)
      }
    }, ScreenSpaceEventType.LEFT_CLICK)

    handler.setInputAction((movement: ScreenSpaceEventHandler.MotionEvent) => {
      if (!isDrawing) return
      const position = getPosition(movement)
      if (position) {
        mousePositionRef.current = position
      }
    }, ScreenSpaceEventType.MOUSE_MOVE)
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && handlerRef.current) {
        handlerRef.current.destroy()
        handlerRef.current = null
        setIsActive(false)
        if (drawingLineRef.current) {
          viewer?.entities.remove(drawingLineRef.current)
          drawingLineRef.current = null
        }
        if (startAnchorRef.current) {
          viewer?.entities.remove(startAnchorRef.current)
          startAnchorRef.current = null
        }
        startPositionRef.current = null
        mousePositionRef.current = null
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [viewer])

  useEffect(() => {
    return () => {
      handlerRef.current?.destroy()
      handlerRef.current = null
    }
  }, [])

  return (
    <button onClick={start} style={{ border: isActive ? '2px solid yellow' : '1px solid gray' }}>
      Line
    </button>
  )
}

export default Line
