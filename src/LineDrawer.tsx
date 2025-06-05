// Line drawing component extracted from CesiumViewer
import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Viewer,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  CallbackProperty,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  ConstantPositionProperty,
  Cartesian3,
  Entity,
  HeightReference,
} from 'cesium'
import AxisHelper from './AxisHelper'

interface LineDrawerProps {
  viewer: Viewer | null
}

const LineDrawer = ({ viewer }: LineDrawerProps) => {
  const drawHandlerRef = useRef<ScreenSpaceEventHandler | null>(null)
  const selectionHandlerRef = useRef<ScreenSpaceEventHandler | null>(null)
  const startPositionRef = useRef<Cartesian3 | null>(null)
  const startAnchorRef = useRef<Entity | null>(null)
  const drawingLineRef = useRef<Entity | null>(null)
  const mousePositionRef = useRef<Cartesian3 | null>(null)
  const selectedLineRef = useRef<Entity | null>(null)
  const selectedAnchorRef = useRef<Entity | null>(null)
  const [selectedLine, setSelectedLine] = useState<Entity | null>(null)
  const anchorsRef = useRef<Entity[]>([])
  const [isLineMode, setIsLineMode] = useState(false)
  const [dragTick, setDragTick] = useState(0)

  const highlightLine = (line: Entity) => {
    if (line.polyline) {
      line.polyline.material = new ColorMaterialProperty(Color.RED)
      line.polyline.width = new ConstantProperty(3)
    }
    selectedLineRef.current = line
    setSelectedLine(line)
  }

  const unhighlightLine = (line: Entity) => {
    if (line.polyline) {
      line.polyline.material = new ColorMaterialProperty(Color.YELLOW)
      line.polyline.width = new ConstantProperty(2)
    }
    if (selectedLineRef.current === line) {
      selectedLineRef.current = null
    }
    setSelectedLine(null)
  }

  const highlightAnchor = (anchor: Entity) => {
    if (anchor.point) {
      anchor.point.color = new ConstantProperty(Color.RED)
      anchor.point.pixelSize = new ConstantProperty(10)
    }
  }

  const unhighlightAnchor = (anchor: Entity) => {
    if (anchor.point) {
      anchor.point.color = new ConstantProperty(Color.ORANGE)
      anchor.point.pixelSize = new ConstantProperty(8)
    }
  }

  const moveSelectedLine = useCallback(
    (translation: Cartesian3) => {
      if (!viewer || !selectedLine) return
      const pos = selectedLine.polyline?.positions?.getValue(
        viewer.clock.currentTime,
      ) as Cartesian3[] | undefined
      if (!pos) return
      const moved = pos.map((p) =>
        Cartesian3.add(p, translation, new Cartesian3()),
      )
      selectedLine.polyline!.positions = new ConstantProperty(moved)
      ;(selectedLine as Entity & { positions?: Cartesian3[] }).positions = moved
      const lineWithAnchors = selectedLine as Entity & {
        anchors?: [Entity, Entity]
      }
      if (lineWithAnchors.anchors) {
        lineWithAnchors.anchors.forEach((a, i) => {
          const newPos = moved[i]
          a.position = new ConstantPositionProperty(newPos)
        })
      }
      setDragTick((t) => t + 1)
    },
    [viewer, selectedLine],
  )

  const removeLine = useCallback(
    (line: Entity) => {
    if (!viewer) {
      return
    }
    viewer.entities.remove(line)
    if (selectedLineRef.current === line) {
      selectedLineRef.current = null
      setSelectedLine(null)
    }
    const lineWithAnchors = line as Entity & { anchors?: [Entity, Entity] }
    if (lineWithAnchors.anchors) {
      for (const anchor of lineWithAnchors.anchors) {
        const a = anchor as Entity & { connectedLines?: Set<Entity> }
        a.connectedLines?.delete(line)
        if (!a.connectedLines || a.connectedLines.size === 0) {
          viewer.entities.remove(a)
          anchorsRef.current = anchorsRef.current.filter((e) => e !== a)
          if (selectedAnchorRef.current === a) {
            selectedAnchorRef.current = null
          }
        }
      }
    }
    },
    [viewer],
  )

  const removeAnchor = useCallback(
    (anchor: Entity) => {
      if (!viewer) {
        return
      }
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

  const addAnchor = (position: Cartesian3) => {
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
  }

  const startLineMode = () => {
    if (!viewer) {
      return
    }

    if (drawHandlerRef.current) {
      drawHandlerRef.current.destroy()
      drawHandlerRef.current = null
      setIsLineMode(false)
      if (drawingLineRef.current) {
        viewer.entities.remove(drawingLineRef.current)
        drawingLineRef.current = null
      }
      if (startAnchorRef.current) {
        const anchor = startAnchorRef.current as Entity & { connectedLines: Set<Entity> }
        if (anchor.connectedLines.size === 0) {
          viewer.entities.remove(startAnchorRef.current)
          anchorsRef.current = anchorsRef.current.filter(
            (a) => a !== startAnchorRef.current,
          )
        }
        startAnchorRef.current = null
      }
      startPositionRef.current = null
      mousePositionRef.current = null
      return
    }

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    drawHandlerRef.current = handler
    setIsLineMode(true)

    let isDrawing = false
    let longPressTimeout: number | null = null
    let ignoreNextClick = false
    const getPosition = (
      event: ScreenSpaceEventHandler.PositionedEvent | ScreenSpaceEventHandler.MotionEvent,
    ): Cartesian3 | null => {
      const pos = 'position' in event ? event.position : event.endPosition
      const picked = viewer.scene.pick(pos)
      if (picked) {
        const entity = picked.id as Entity & { isAnchor?: boolean }
        if (entity.isAnchor) {
          return entity.position?.getValue(viewer.clock.currentTime) || null
        }
      }
      const ray = viewer.camera.getPickRay(pos)
      if (ray) {
        const ground = viewer.scene.globe.pick(ray, viewer.scene)
        if (ground) {
          return ground
        }
      }
      return viewer.camera.pickEllipsoid(pos) || null
    }

    handler.setInputAction((event: ScreenSpaceEventHandler.PositionedEvent) => {
      if (ignoreNextClick) {
        ignoreNextClick = false
        return
      }
      const position = getPosition(event)
      if (!position) {
        return
      }
      if (!isDrawing) {
        startPositionRef.current = position
        mousePositionRef.current = position
        startAnchorRef.current = addAnchor(position)!
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
            clampToGround: true,
          },
        })
        isDrawing = true
      } else {
        const endAnchor = addAnchor(position)!
        const line = drawingLineRef.current!
        line.polyline!.positions = new ConstantProperty([
          startPositionRef.current!,
          position,
        ])
        ;(line as Entity & { positions?: Cartesian3[] }).positions = [
          startPositionRef.current!,
          position,
        ]
        ;(line as Entity & { isLine: boolean; anchors: [Entity, Entity] }).isLine = true
        ;(line as Entity & { isLine: boolean; anchors: [Entity, Entity] }).anchors = [
          startAnchorRef.current!,
          endAnchor,
        ]
        ;(startAnchorRef.current! as Entity & { connectedLines: Set<Entity> }).connectedLines.add(line)
        ;(endAnchor as Entity & { connectedLines: Set<Entity> }).connectedLines.add(line)
        startPositionRef.current = position
        startAnchorRef.current = endAnchor
        mousePositionRef.current = position
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
            clampToGround: true,
          },
        })
        isDrawing = true
      }
    }, ScreenSpaceEventType.LEFT_CLICK)

    handler.setInputAction(() => {
      if (!isDrawing) {
        return
      }
      longPressTimeout = window.setTimeout(() => {
        finishDrawing()
        ignoreNextClick = true
      }, ScreenSpaceEventHandler.touchHoldDelayMilliseconds)
    }, ScreenSpaceEventType.LEFT_DOWN)

    const cancelLongPress = () => {
      if (longPressTimeout !== null) {
        clearTimeout(longPressTimeout)
        longPressTimeout = null
      }
    }

    handler.setInputAction(cancelLongPress, ScreenSpaceEventType.LEFT_UP)
    handler.setInputAction(cancelLongPress, ScreenSpaceEventType.MOUSE_MOVE)

    const finishDrawing = () => {
      if (drawingLineRef.current) {
        viewer.entities.remove(drawingLineRef.current)
        drawingLineRef.current = null
      }
      if (startAnchorRef.current) {
        const anchor = startAnchorRef.current as Entity & { connectedLines: Set<Entity> }
        if (anchor.connectedLines.size === 0) {
          viewer.entities.remove(startAnchorRef.current)
          anchorsRef.current = anchorsRef.current.filter((a) => a !== startAnchorRef.current)
        }
        startAnchorRef.current = null
      }
      startPositionRef.current = null
      mousePositionRef.current = null
      isDrawing = false
    }

    handler.setInputAction(finishDrawing, ScreenSpaceEventType.RIGHT_CLICK)
    handler.setInputAction(finishDrawing, ScreenSpaceEventType.LEFT_DOUBLE_CLICK)

    handler.setInputAction((movement: ScreenSpaceEventHandler.MotionEvent) => {
      if (!drawingLineRef.current) {
        return
      }
      const position = getPosition(movement)
      if (position) {
        mousePositionRef.current = position
      }
    }, ScreenSpaceEventType.MOUSE_MOVE)
  }

  useEffect(() => {
    if (!viewer) {
      return
    }

    const selectionHandler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    selectionHandlerRef.current = selectionHandler
    selectionHandler.setInputAction(
      (event: ScreenSpaceEventHandler.PositionedEvent) => {
        if (drawHandlerRef.current) {
          return
        }
        const picked = viewer.scene.pick(event.position)
        if (picked) {
          const entity = picked.id as Entity & {
            isLine?: boolean
            isAnchor?: boolean
          }
          if (entity.isLine) {
            if (selectedLineRef.current && selectedLineRef.current !== entity) {
              unhighlightLine(selectedLineRef.current)
            }
            if (selectedAnchorRef.current) {
              unhighlightAnchor(selectedAnchorRef.current)
              selectedAnchorRef.current = null
            }
            selectedLineRef.current = entity
            highlightLine(entity)
            return
          }
          if (entity.isAnchor) {
            if (
              selectedAnchorRef.current &&
              selectedAnchorRef.current !== entity
            ) {
              unhighlightAnchor(selectedAnchorRef.current)
            }
            if (selectedLineRef.current) {
              unhighlightLine(selectedLineRef.current)
              selectedLineRef.current = null
            }
            selectedAnchorRef.current = entity
            highlightAnchor(entity)
            return
          }
        }
        if (selectedLineRef.current) {
          unhighlightLine(selectedLineRef.current)
          selectedLineRef.current = null
        }
        if (selectedAnchorRef.current) {
          unhighlightAnchor(selectedAnchorRef.current)
          selectedAnchorRef.current = null
        }
      },
      ScreenSpaceEventType.LEFT_CLICK,
    )

    return () => {
      selectionHandlerRef.current?.destroy()
      selectionHandlerRef.current = null
    }
  }, [viewer])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && drawHandlerRef.current) {
        drawHandlerRef.current.destroy()
        drawHandlerRef.current = null
        setIsLineMode(false)
        if (drawingLineRef.current) {
          viewer?.entities.remove(drawingLineRef.current)
          drawingLineRef.current = null
        }
        if (startAnchorRef.current) {
          const anchor = startAnchorRef.current as Entity & { connectedLines: Set<Entity> }
          if (anchor.connectedLines.size === 0) {
            viewer?.entities.remove(startAnchorRef.current)
            anchorsRef.current = anchorsRef.current.filter(
              (a) => a !== startAnchorRef.current,
            )
          }
          startAnchorRef.current = null
        }
        startPositionRef.current = null
        mousePositionRef.current = null
      }
      if (event.key === 'Delete' && viewer) {
        if (selectedLineRef.current) {
          removeLine(selectedLineRef.current)
          selectedLineRef.current = null
        } else if (selectedAnchorRef.current) {
          removeAnchor(selectedAnchorRef.current)
          selectedAnchorRef.current = null
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isLineMode, removeLine, removeAnchor, viewer])

  return (
    <>
      <button
        onClick={startLineMode}
        style={{ border: isLineMode ? '2px solid yellow' : '1px solid gray' }}
      >
        Line
      </button>
      {viewer && selectedLine && (
        <AxisHelper
          viewer={viewer}
          target={selectedLine}
          onMove={moveSelectedLine}
          mode="2d"
          key={dragTick}
        />
      )}
    </>
  )
}

export default LineDrawer
