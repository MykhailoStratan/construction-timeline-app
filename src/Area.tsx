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
  Plane,
  IntersectionTests,
  Entity,
  HeightReference,
  EllipsoidTangentPlane,
  PolygonHierarchy,
  Transforms,
  Matrix4,
  Matrix3,
  OrientedBoundingBox,
  Cesium3DTileFeature,
  LabelStyle,
  VerticalOrigin,
  Cartographic,
  LabelGraphics,
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
  const axisAreaRef = useRef<Entity | null>(null)
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
  const anchorsRef = useRef<Entity[]>([])
  const linesRef = useRef<Entity[]>([])
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
      ;(area as Entity & { positions?: Cartesian3[] }).positions = positions
      const result = await computeAreaWithTerrain(positions)
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
  }, [viewer, restoreCamera, computeAreaWithTerrain])

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
    movedPositionsRef.current = (
      (area as Entity & { positions?: Cartesian3[] }).positions || []
    ).map((p) => Cartesian3.clone(p))
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
      ;(area as Entity & { positions?: Cartesian3[] }).positions =
        movedPositionsRef.current
      const result = computeAreaAndCentroid(movedPositionsRef.current)
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

  const computeSurfaceAreaAndCentroid = (
    positions: Cartesian3[],
  ): { area: number; centroid: Cartesian3 } | null => {
    if (positions.length < 3) {
      return null
    }
    let area = 0
    const centroid = new Cartesian3(0, 0, 0)
    const base = positions[0]
    for (let i = 1; i < positions.length - 1; i++) {
      const b = positions[i]
      const c = positions[i + 1]
      const ab = Cartesian3.subtract(b, base, new Cartesian3())
      const ac = Cartesian3.subtract(c, base, new Cartesian3())
      const cross = Cartesian3.cross(ab, ac, new Cartesian3())
      const triArea = Cartesian3.magnitude(cross) * 0.5
      area += triArea
      const triCentroid = Cartesian3.multiplyByScalar(
        Cartesian3.add(
          base,
          Cartesian3.add(b, c, new Cartesian3()),
          new Cartesian3(),
        ),
        1 / 3,
        new Cartesian3(),
      )
      Cartesian3.multiplyByScalar(triCentroid, triArea, triCentroid)
      Cartesian3.add(centroid, triCentroid, centroid)
    }
    Cartesian3.divideByScalar(centroid, area, centroid)
    return { area, centroid }
  }

  async function computeAreaWithTerrain(
    positions: Cartesian3[],
  ): Promise<{ area: number; centroid: Cartesian3 } | null> {
    if (!viewer || positions.length < 3) {
      return null
    }
    const cartographics = positions.map((p) =>
      Cartographic.fromCartesian(p),
    )
    try {
      const sampled = await viewer.scene.sampleHeightMostDetailed(cartographics)
      const withHeights = sampled.map((c) =>
        Cartesian3.fromRadians(c.longitude, c.latitude, c.height),
      )
      return computeSurfaceAreaAndCentroid(withHeights)
    } catch {
      return computeSurfaceAreaAndCentroid(positions)
    }
  }

  const computeFootprint = (
    feature: Cesium3DTileFeature,
  ): Cartesian3[] | null => {
    const f = feature as unknown as {
      content?: {
        _polygons?: { _boundingVolumes?: OrientedBoundingBox[] }
        _boundingVolume?: OrientedBoundingBox
      }
    }
    const obb: OrientedBoundingBox | undefined =
      f.content?._polygons?._boundingVolumes?.[feature.featureId] ||
      f.content?._boundingVolume
    if (!obb) {
      return null
    }
    const corners = OrientedBoundingBox.computeCorners(obb, [])
    corners.sort((a, b) => {
      const ha = Cartographic.fromCartesian(a).height
      const hb = Cartographic.fromCartesian(b).height
      return ha - hb
    })
    const bottom = corners.slice(0, 4)
    const ground = bottom.map((c) => {
      const carto = Cartographic.fromCartesian(c)
      carto.height = 0
      return Cartesian3.fromRadians(carto.longitude, carto.latitude, 0)
    })
    const center = ground.reduce(
      (sum, p) => Cartesian3.add(sum, p, sum),
      new Cartesian3(0, 0, 0),
    )
    Cartesian3.divideByScalar(center, ground.length, center)
    const angle = (p: Cartesian3) => Math.atan2(p.y - center.y, p.x - center.x)
    ground.sort((a, b) => angle(a) - angle(b))
    return ground
  }

  const addAreaFromPositions = (positions: Cartesian3[]) => {
    if (!viewer) return
    const result = computeAreaAndCentroid(positions)
    const areaEntity = viewer.entities.add({
      position: result?.centroid,
      polygon: {
        hierarchy: new PolygonHierarchy(positions),
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
    ;(areaEntity as Entity & { isArea: boolean; positions: Cartesian3[] }).isArea =
      true
    ;(areaEntity as Entity & { positions: Cartesian3[] }).positions = positions
  }

  const removeLine = useCallback(
    (line: Entity) => {
    if (!viewer) {
      return
    }
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
      if (!isDrawing) {
        const picked = viewer.scene.pick(event.position)
        if (picked && picked.id instanceof Cesium3DTileFeature) {
          const footprint = computeFootprint(picked.id)
          if (footprint && footprint.length >= 3) {
            addAreaFromPositions(footprint)
            return
          }
        }
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
        linesRef.current.push(line)
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
          })
          ;(areaEntity as Entity & { isArea: boolean; positions: Cartesian3[] }).isArea = true
          ;(areaEntity as Entity & { positions: Cartesian3[] }).positions = polyPositions
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
