// Area drawing component derived from LineDrawer
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
  Cartesian2,
  Entity,
  HeightReference,
  EllipsoidTangentPlane,
  Transforms,
  Matrix4,
  Matrix3,
  LabelStyle,
  VerticalOrigin,
} from 'cesium'

interface AreaProps {
  viewer: Viewer | null
}

const Area = ({ viewer }: AreaProps) => {
  const drawHandlerRef = useRef<ScreenSpaceEventHandler | null>(null)
  const selectionHandlerRef = useRef<ScreenSpaceEventHandler | null>(null)
  const startPositionRef = useRef<Cartesian3 | null>(null)
  const startAnchorRef = useRef<Entity | null>(null)
  const drawingLineRef = useRef<Entity | null>(null)
  const mousePositionRef = useRef<Cartesian3 | null>(null)
  const selectedLineRef = useRef<Entity | null>(null)
  const selectedAnchorRef = useRef<Entity | null>(null)
  const selectedAreaRef = useRef<Entity | null>(null)
  const axisHelperRef = useRef<
    | {
        x: Entity
        y: Entity
        z: Entity
      }
    | null
  >(null)
  const axisHandlerRef = useRef<ScreenSpaceEventHandler | null>(null)
  const anchorsRef = useRef<Entity[]>([])
  const firstAnchorRef = useRef<Entity | null>(null)
  const polygonPositionsRef = useRef<Cartesian3[]>([])
  const [isAreaMode, setIsAreaMode] = useState(false)

  const highlightLine = (line: Entity) => {
    if (line.polyline) {
      line.polyline.material = new ColorMaterialProperty(Color.RED)
      line.polyline.width = new ConstantProperty(3)
    }
  }

  const unhighlightLine = (line: Entity) => {
    if (line.polyline) {
      line.polyline.material = new ColorMaterialProperty(Color.YELLOW)
      line.polyline.width = new ConstantProperty(2)
    }
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


  const removeAxisHelper = useCallback(() => {
    if (!viewer) {
      return
    }
    if (axisHelperRef.current) {
      viewer.entities.remove(axisHelperRef.current.x)
      viewer.entities.remove(axisHelperRef.current.y)
      viewer.entities.remove(axisHelperRef.current.z)
      axisHelperRef.current = null
    }
    axisHandlerRef.current?.destroy()
    axisHandlerRef.current = null
  }, [viewer])

  const showAxisHelper = useCallback((area: Entity) => {
    if (!viewer) {
      return
    }
    removeAxisHelper()
    const center = area.position?.getValue(viewer.clock.currentTime)
    if (!center) {
      return
    }
    const transform = Transforms.eastNorthUpToFixedFrame(center)
    const rot = Matrix4.getMatrix3(transform, new Matrix3())
    const xDir = Matrix3.getColumn(rot, 0, new Cartesian3())
    const yDir = Matrix3.getColumn(rot, 1, new Cartesian3())
    const zDir = Matrix3.getColumn(rot, 2, new Cartesian3())
    const len = 20
    const xEnd = Cartesian3.add(
      center,
      Cartesian3.multiplyByScalar(xDir, len, new Cartesian3()),
      new Cartesian3(),
    )
    const yEnd = Cartesian3.add(
      center,
      Cartesian3.multiplyByScalar(yDir, len, new Cartesian3()),
      new Cartesian3(),
    )
    const zEnd = Cartesian3.add(
      center,
      Cartesian3.multiplyByScalar(zDir, len, new Cartesian3()),
      new Cartesian3(),
    )
    const x = viewer.entities.add({
      polyline: {
        positions: [center, xEnd],
        material: Color.RED,
        width: 4,
      },
    })
    const y = viewer.entities.add({
      polyline: {
        positions: [center, yEnd],
        material: Color.GREEN,
        width: 4,
      },
    })
    const z = viewer.entities.add({
      polyline: {
        positions: [center, zEnd],
        material: Color.BLUE,
        width: 4,
      },
    })
    ;(x as Entity & { isAxis: 'x' }).isAxis = 'x'
    ;(y as Entity & { isAxis: 'y' }).isAxis = 'y'
    ;(z as Entity & { isAxis: 'z' }).isAxis = 'z'
    axisHelperRef.current = { x, y, z }

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    axisHandlerRef.current = handler
    let dragging: 'x' | 'y' | 'z' | null = null
    let startMouse: Cartesian3 | null = null

    const getPosition = (
      event: ScreenSpaceEventHandler.PositionedEvent | ScreenSpaceEventHandler.MotionEvent,
    ): Cartesian3 | null => {
      const pos = 'position' in event ? event.position : event.endPosition
      const ray = viewer.camera.getPickRay(pos)
      if (ray) {
        const ground = viewer.scene.globe.pick(ray, viewer.scene)
        if (ground) {
          return ground
        }
      }
      return viewer.camera.pickEllipsoid(pos) || null
    }

    const axisDirs = { x: xDir, y: yDir, z: zDir }
    const update = (translation: Cartesian3) => {
      const pos = area.position?.getValue(viewer.clock.currentTime)
      if (!pos) return
      const newPos = Cartesian3.add(pos, translation, new Cartesian3())
      area.position = new ConstantPositionProperty(newPos)
      const areaWithPositions = area as Entity & { positions?: Cartesian3[] }
      const poly = areaWithPositions.positions
      if (poly) {
        const moved = poly.map((p) =>
          Cartesian3.add(p, translation, new Cartesian3()),
        )
        area.polygon!.hierarchy = new ConstantProperty(moved)
        areaWithPositions.positions = moved
      }
      const ends = {
        x: Cartesian3.add(newPos, Cartesian3.multiplyByScalar(xDir, len, new Cartesian3()), new Cartesian3()),
        y: Cartesian3.add(newPos, Cartesian3.multiplyByScalar(yDir, len, new Cartesian3()), new Cartesian3()),
        z: Cartesian3.add(newPos, Cartesian3.multiplyByScalar(zDir, len, new Cartesian3()), new Cartesian3()),
      }
      if (axisHelperRef.current) {
        axisHelperRef.current.x.polyline!.positions =
          new ConstantProperty([newPos, ends.x])
        axisHelperRef.current.y.polyline!.positions =
          new ConstantProperty([newPos, ends.y])
        axisHelperRef.current.z.polyline!.positions =
          new ConstantProperty([newPos, ends.z])
      }
    }

    handler.setInputAction((e: ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(e.position)
      if (picked) {
        const ent = picked.id as Entity & { isAxis?: string }
        if (ent.isAxis) {
          dragging = ent.isAxis as 'x' | 'y' | 'z'
          startMouse = getPosition(e)
        }
      }
    }, ScreenSpaceEventType.LEFT_DOWN)

    handler.setInputAction(() => {
      dragging = null
      startMouse = null
    }, ScreenSpaceEventType.LEFT_UP)

    let hovered: Entity | null = null

    handler.setInputAction((m: ScreenSpaceEventHandler.MotionEvent) => {
      if (dragging && startMouse) {
        const pos = getPosition(m)
        if (!pos) return
        const diff = Cartesian3.subtract(pos, startMouse, new Cartesian3())
        const dir = axisDirs[dragging]
        const amount = Cartesian3.dot(diff, dir)
        const translation = Cartesian3.multiplyByScalar(dir, amount, new Cartesian3())
        update(translation)
        return
      }
      const picked = viewer.scene.pick(m.endPosition)
      if (picked) {
        const ent = picked.id as Entity & { isAxis?: string }
          if (ent.isAxis) {
            if (hovered && hovered !== ent) {
              hovered.polyline!.width = new ConstantProperty(4)
            }
            hovered = ent
            hovered.polyline!.width = new ConstantProperty(8)
            return
          }
        }
        if (hovered) {
          hovered.polyline!.width = new ConstantProperty(4)
          hovered = null
        }
    }, ScreenSpaceEventType.MOUSE_MOVE)
  }, [viewer, removeAxisHelper])

  const highlightArea = useCallback(
    (area: Entity) => {
      if (area.polygon) {
        area.polygon.material = new ColorMaterialProperty(
          Color.RED.withAlpha(0.5),
        )
        area.polygon.outlineColor = new ConstantProperty(Color.RED)
      }
      showAxisHelper(area)
    },
    [showAxisHelper],
  )

  const unhighlightArea = useCallback(
    (area: Entity) => {
      if (area.polygon) {
        area.polygon.material = new ColorMaterialProperty(
          Color.YELLOW.withAlpha(0.5),
        )
        area.polygon.outlineColor = new ConstantProperty(Color.YELLOW)
      }
      removeAxisHelper()
    },
    [removeAxisHelper],
  )

  const computeAreaAndCentroid = (
    positions: Cartesian3[],
  ): { area: number; centroid: Cartesian3 } | null => {
    if (!viewer || positions.length < 3) {
      return null
    }
    const plane = EllipsoidTangentPlane.fromPoints(
      positions,
      viewer.scene.globe.ellipsoid,
    )
    const projected = plane.projectPointsOntoPlane(positions, [])
    if (projected.length < 3) {
      return null
    }
    let signedArea = 0
    let cx = 0
    let cy = 0
    for (let i = 0, j = projected.length - 1; i < projected.length; j = i++) {
      const p0 = projected[j]
      const p1 = projected[i]
      const f = p0.x * p1.y - p1.x * p0.y
      signedArea += f
      cx += (p0.x + p1.x) * f
      cy += (p0.y + p1.y) * f
    }
    signedArea *= 0.5
    if (signedArea === 0) {
      return null
    }
    const area = Math.abs(signedArea)
    cx /= 6 * signedArea
    cy /= 6 * signedArea
    const centroid2D = new Cartesian2(cx, cy)
    const centroid = plane.projectPointOntoEllipsoid(
      centroid2D,
      new Cartesian3(),
    )
    return { area, centroid }
  }

  const removeLine = useCallback(
    (line: Entity) => {
    if (!viewer) {
      return
    }
    viewer.entities.remove(line)
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

  const removeArea = useCallback(
    (area: Entity) => {
      if (!viewer) {
        return
      }
      viewer.entities.remove(area)
      if (selectedAreaRef.current === area) {
        removeAxisHelper()
      }
    },
    [viewer, removeAxisHelper],
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

  const startAreaMode = () => {
    if (!viewer) {
      return
    }

    if (drawHandlerRef.current) {
      drawHandlerRef.current.destroy()
      drawHandlerRef.current = null
      setIsAreaMode(false)
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
    setIsAreaMode(true)

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
        firstAnchorRef.current = startAnchorRef.current
        polygonPositionsRef.current = [position]
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
        ;(line as Entity & { isLine: boolean; anchors: [Entity, Entity] }).isLine = true
        ;(line as Entity & { isLine: boolean; anchors: [Entity, Entity] }).anchors = [
          startAnchorRef.current!,
          endAnchor,
        ]
        ;(startAnchorRef.current! as Entity & { connectedLines: Set<Entity> }).connectedLines.add(line)
        ;(endAnchor as Entity & { connectedLines: Set<Entity> }).connectedLines.add(line)
        polygonPositionsRef.current.push(position)
        if (
          endAnchor === firstAnchorRef.current &&
          polygonPositionsRef.current.length >= 3
        ) {
          const polyPositions = [...polygonPositionsRef.current]
          const result = computeAreaAndCentroid(polyPositions)
          const areaEntity = viewer.entities.add({
            position: result?.centroid,
            polygon: {
              hierarchy: polyPositions,
              material: new ColorMaterialProperty(Color.YELLOW.withAlpha(0.5)),
              outline: true,
              outlineColor: Color.YELLOW,
              heightReference: HeightReference.CLAMP_TO_GROUND,
            },
            label: result
              ? {
                  text: `${Math.round(result.area)} m²`,
                  fillColor: Color.BLACK,
                  style: LabelStyle.FILL,
                  showBackground: true,
                  backgroundColor: Color.WHITE.withAlpha(0.5),
                  verticalOrigin: VerticalOrigin.CENTER,
                  heightReference: HeightReference.CLAMP_TO_GROUND,
                }
              : undefined,
          })
          ;(areaEntity as Entity & { isArea: boolean; positions: Cartesian3[] }).isArea = true
          ;(areaEntity as Entity & { positions: Cartesian3[] }).positions = polyPositions
          firstAnchorRef.current = null
          polygonPositionsRef.current = []
          finishDrawing()
          return
        }
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
      firstAnchorRef.current = null
      polygonPositionsRef.current = []
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
            isArea?: boolean
          }
          if (entity.isLine) {
            if (selectedLineRef.current && selectedLineRef.current !== entity) {
              unhighlightLine(selectedLineRef.current)
            }
            if (selectedAnchorRef.current) {
              unhighlightAnchor(selectedAnchorRef.current)
              selectedAnchorRef.current = null
            }
            if (selectedAreaRef.current) {
              unhighlightArea(selectedAreaRef.current)
              selectedAreaRef.current = null
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
            if (selectedAreaRef.current) {
              unhighlightArea(selectedAreaRef.current)
              selectedAreaRef.current = null
            }
            selectedAnchorRef.current = entity
            highlightAnchor(entity)
            return
          }
          if (entity.isArea) {
            if (
              selectedAreaRef.current &&
              selectedAreaRef.current !== entity
            ) {
              unhighlightArea(selectedAreaRef.current)
            }
            if (selectedLineRef.current) {
              unhighlightLine(selectedLineRef.current)
              selectedLineRef.current = null
            }
            if (selectedAnchorRef.current) {
              unhighlightAnchor(selectedAnchorRef.current)
              selectedAnchorRef.current = null
            }
            selectedAreaRef.current = entity
            highlightArea(entity)
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
        if (selectedAreaRef.current) {
          unhighlightArea(selectedAreaRef.current)
          selectedAreaRef.current = null
        }
      },
      ScreenSpaceEventType.LEFT_CLICK,
    )

    return () => {
      selectionHandlerRef.current?.destroy()
      selectionHandlerRef.current = null
    }
  }, [viewer, highlightArea, unhighlightArea])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && drawHandlerRef.current) {
        drawHandlerRef.current.destroy()
        drawHandlerRef.current = null
        setIsAreaMode(false)
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
        } else if (selectedAreaRef.current) {
          removeArea(selectedAreaRef.current)
          selectedAreaRef.current = null
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [
    isAreaMode,
    removeLine,
    removeAnchor,
    removeArea,
    viewer,
    highlightArea,
    unhighlightArea,
  ])

  return (
    <button
      onClick={startAreaMode}
      style={{ border: isAreaMode ? '2px solid yellow' : '1px solid gray' }}
    >
      Area
    </button>
  )
}

export default Area
