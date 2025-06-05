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
  Plane,
  IntersectionTests,
  Entity,
  HeightReference,
  PolygonHierarchy,
  Transforms,
  Matrix4,
  Matrix3,
  LabelStyle,
  VerticalOrigin,
  LabelGraphics,
} from 'cesium'
import type { AnchorEntity, LineEntity, AreaEntity } from './entityTypes'
import { computeAreaAndCentroid, computeAreaWithTerrain } from './geometry'
import { useDrawing } from './hooks/DrawingContext'

interface AreaProps {
  viewer: Viewer | null
}

const Area = ({ viewer }: AreaProps) => {
  const drawHandlerRef = useRef<ScreenSpaceEventHandler | null>(null)
  const selectionHandlerRef = useRef<ScreenSpaceEventHandler | null>(null)
  const startPositionRef = useRef<Cartesian3 | null>(null)
  const startAnchorRef = useRef<AnchorEntity | null>(null)
  const drawingLineRef = useRef<LineEntity | null>(null)
  const mousePositionRef = useRef<Cartesian3 | null>(null)
  const axisHelperRef = useRef<
    | {
        x: Entity
        y: Entity
        z: Entity
      }
    | null
  >(null)
  const axisAreaRef = useRef<AreaEntity | null>(null)
  const movedPositionsRef = useRef<Cartesian3[] | null>(null)
  const hierarchyCallbackRef = useRef<CallbackProperty | null>(null)
  const axisHandlerRef = useRef<ScreenSpaceEventHandler | null>(null)
  const cameraStateRef = useRef<
    | {
        enableRotate: boolean
        enableTranslate: boolean
        enableZoom: boolean
        enableTilt: boolean
        enableLook: boolean
      }
    | null
  >(null)
  const {
    anchorsRef,
    linesRef,
    highlightLine,
    unhighlightLine,
    highlightAnchor,
    unhighlightAnchor,
    addAnchor,
    removeLine,
    removeAnchor,
    selectedLineRef,
    selectedAnchorRef,
    selectedAreaRef,
  } = useDrawing()
  const firstAnchorRef = useRef<AnchorEntity | null>(null)
  const polygonPositionsRef = useRef<Cartesian3[]>([])
  const [isAreaMode, setIsAreaMode] = useState(false)

  const restoreCamera = useCallback(() => {
    if (!viewer || !cameraStateRef.current) {
      return
    }
    const controller = viewer.scene.screenSpaceCameraController
    controller.enableRotate = cameraStateRef.current.enableRotate
    controller.enableTranslate = cameraStateRef.current.enableTranslate
    controller.enableZoom = cameraStateRef.current.enableZoom
    controller.enableTilt = cameraStateRef.current.enableTilt
    controller.enableLook = cameraStateRef.current.enableLook
    cameraStateRef.current = null
  }, [viewer])


  const removeAxisHelper = useCallback(async () => {
    if (!viewer) {
      return
    }
    if (axisHelperRef.current) {
      viewer.entities.remove(axisHelperRef.current.x)
      viewer.entities.remove(axisHelperRef.current.y)
      viewer.entities.remove(axisHelperRef.current.z)
      axisHelperRef.current = null
    }
    if (axisAreaRef.current && movedPositionsRef.current) {
      const area = axisAreaRef.current
      const positions = movedPositionsRef.current
      axisAreaRef.current = null
      movedPositionsRef.current = null
      hierarchyCallbackRef.current = null

      area.polygon!.hierarchy = new ConstantProperty(
        new PolygonHierarchy(positions),
      )
      area.positions = positions
      const result = await computeAreaWithTerrain(viewer, positions)
      if (result) {
        area.position = new ConstantPositionProperty(result.centroid)
        if (area.label) {
          area.label.text = new ConstantProperty(
            `${Math.round(result.area)} m²`,
          )
        } else {
          area.label = new LabelGraphics({
            text: new ConstantProperty(`${Math.round(result.area)} m²`),
            fillColor: new ConstantProperty(Color.BLACK),
            style: new ConstantProperty(LabelStyle.FILL),
            showBackground: new ConstantProperty(true),
            backgroundColor: new ConstantProperty(
              Color.WHITE.withAlpha(0.5),
            ),
            verticalOrigin: new ConstantProperty(VerticalOrigin.CENTER),
            heightReference: new ConstantProperty(
              HeightReference.CLAMP_TO_GROUND,
            ),
          })
        }
      }
    }
    axisHandlerRef.current?.destroy()
    axisHandlerRef.current = null
    restoreCamera()
  }, [viewer, restoreCamera])

  const showAxisHelper = useCallback((area: AreaEntity) => {
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
    const axisPositions = (dir: Cartesian3) =>
      new CallbackProperty(() => {
        const pos = axisAreaRef.current?.position?.getValue(
          viewer.clock.currentTime,
        )
        if (!pos) {
          return []
        }
        const end = Cartesian3.add(
          pos,
          Cartesian3.multiplyByScalar(dir, len, new Cartesian3()),
          new Cartesian3(),
        )
        return [pos, end]
      }, false)

    const x = viewer.entities.add({
      polyline: {
        positions: axisPositions(xDir),
        material: Color.RED,
        width: 4,
      },
    })
    const y = viewer.entities.add({
      polyline: {
        positions: axisPositions(yDir),
        material: Color.GREEN,
        width: 4,
      },
    })
    const z = viewer.entities.add({
      polyline: {
        positions: axisPositions(zDir),
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
    let startPlane: Plane | null = null

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
    movedPositionsRef.current = (area.positions || []).map((p) =>
      Cartesian3.clone(p),
    )
    hierarchyCallbackRef.current = new CallbackProperty(() => {
      return new PolygonHierarchy(movedPositionsRef.current || [])
    }, false)
    area.polygon!.hierarchy = hierarchyCallbackRef.current
    axisAreaRef.current = area

    const update = (translation: Cartesian3) => {
      const pos = area.position?.getValue(viewer.clock.currentTime)
      if (!pos || !movedPositionsRef.current) return
      const newPos = Cartesian3.add(pos, translation, new Cartesian3())
      area.position = new ConstantPositionProperty(newPos)
      movedPositionsRef.current = movedPositionsRef.current.map((p) =>
        Cartesian3.add(p, translation, new Cartesian3()),
      )
      area.positions = movedPositionsRef.current
      const result = computeAreaAndCentroid(viewer, movedPositionsRef.current)
      if (result) {
        area.position = new ConstantPositionProperty(result.centroid)
        if (area.label) {
          area.label.text = new ConstantProperty(`${Math.round(result.area)} m²`)
        }
      }
      // Axis helper positions update via CallbackProperty
    }

    handler.setInputAction((e: ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(e.position)
      if (picked) {
        const ent = picked.id as Entity & { isAxis?: string }
        if (ent.isAxis) {
          dragging = ent.isAxis as 'x' | 'y' | 'z'
          startMouse = getPosition(e)
          if (startMouse) {
            const cameraDir = viewer.camera.direction
            let normal = Cartesian3.cross(
              cameraDir,
              axisDirs[dragging],
              new Cartesian3(),
            )
            if (Cartesian3.magnitude(normal) === 0) {
              normal = Cartesian3.cross(
                viewer.camera.up,
                axisDirs[dragging],
                new Cartesian3(),
              )
            }
            Cartesian3.normalize(normal, normal)
            startPlane = Plane.fromPointNormal(startMouse, normal)
          }
          const controller = viewer.scene.screenSpaceCameraController
          if (!cameraStateRef.current) {
            cameraStateRef.current = {
              enableRotate: controller.enableRotate,
              enableTranslate: controller.enableTranslate,
              enableZoom: controller.enableZoom,
              enableTilt: controller.enableTilt,
              enableLook: controller.enableLook,
            }
          }
          controller.enableRotate = false
          controller.enableTranslate = false
          controller.enableZoom = false
          controller.enableTilt = false
          controller.enableLook = false
        }
      }
    }, ScreenSpaceEventType.LEFT_DOWN)

    handler.setInputAction(() => {
      dragging = null
      startMouse = null
      startPlane = null
      restoreCamera()
    }, ScreenSpaceEventType.LEFT_UP)

    let hovered: Entity | null = null

    handler.setInputAction((m: ScreenSpaceEventHandler.MotionEvent) => {
      if (dragging && startMouse) {
        const ray = viewer.camera.getPickRay(m.endPosition)
        if (!ray || !startPlane) return
        const endPos = IntersectionTests.rayPlane(ray, startPlane, new Cartesian3())
        if (!endPos) return
        const diff = Cartesian3.subtract(endPos, startMouse, new Cartesian3())
        const dir = axisDirs[dragging]
        const amount = Cartesian3.dot(diff, dir)
        const translation = Cartesian3.multiplyByScalar(dir, amount, new Cartesian3())
        update(translation)
        startMouse = endPos
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
  }, [viewer, removeAxisHelper, restoreCamera])

  const highlightArea = useCallback(
    (area: AreaEntity) => {
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
    (area: AreaEntity) => {
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


  const removeArea = useCallback(
    (area: AreaEntity) => {
      if (!viewer) {
        return
      }
      viewer.entities.remove(area)
      if (selectedAreaRef.current === area) {
        removeAxisHelper()
      }
    },
    [viewer, removeAxisHelper, selectedAreaRef],
  )



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
        const anchor = startAnchorRef.current
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
        const entity = picked.id as AnchorEntity | undefined
        if (entity?.isAnchor) {
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
        }) as LineEntity
        isDrawing = true
      } else {
        const endAnchor = addAnchor(position)!
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
        polygonPositionsRef.current.push(position)
        if (
          endAnchor === firstAnchorRef.current &&
          polygonPositionsRef.current.length >= 3
        ) {
          const polyPositions = [...polygonPositionsRef.current]
          const result = computeAreaAndCentroid(viewer, polyPositions)
          const areaEntity = viewer.entities.add({
            position: result?.centroid,
            polygon: {
              hierarchy: new PolygonHierarchy(polyPositions),
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
          }) as AreaEntity
          areaEntity.isArea = true
          areaEntity.positions = polyPositions
          for (const l of linesRef.current) {
            removeLine(l)
          }
          linesRef.current = []
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
        }) as LineEntity
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
        const anchor = startAnchorRef.current
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
          const entity = picked.id as LineEntity | AnchorEntity | AreaEntity | undefined
          if (entity && 'isLine' in entity && entity.isLine) {
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
          } else if (entity && 'isAnchor' in entity && entity.isAnchor) {
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
          } else if (entity && 'isArea' in entity && entity.isArea) {
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
  }, [
    viewer,
    highlightArea,
    unhighlightArea,
    highlightLine,
    unhighlightLine,
    highlightAnchor,
    unhighlightAnchor,
    selectedLineRef,
    selectedAnchorRef,
    selectedAreaRef,
  ])

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
          const anchor = startAnchorRef.current
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
    anchorsRef,
    selectedLineRef,
    selectedAnchorRef,
    selectedAreaRef,
  ])

  useEffect(() => {
    return () => {
      drawHandlerRef.current?.destroy()
      drawHandlerRef.current = null
      selectionHandlerRef.current?.destroy()
      selectionHandlerRef.current = null
      axisHandlerRef.current?.destroy()
      axisHandlerRef.current = null
      removeAxisHelper()
    }
  }, [removeAxisHelper])

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
