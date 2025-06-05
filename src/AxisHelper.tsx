import { useEffect, useRef } from 'react'
import {
  Viewer,
  Entity,
  Cartesian3,
  Color,
  CallbackProperty,
  Transforms,
  Matrix4,
  Matrix3,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Plane,
  IntersectionTests,
  ConstantProperty,
} from 'cesium'

export interface AxisHelperProps {
  viewer: Viewer
  enableZ?: boolean
  getPosition: () => Cartesian3 | null
  onTranslate: (translation: Cartesian3) => void
}

const AxisHelper = ({ viewer, enableZ, getPosition, onTranslate }: AxisHelperProps) => {
  const axisRef = useRef<{ x: Entity; y: Entity; z?: Entity } | null>(null)
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null)

  useEffect(() => {
    const center = getPosition()
    if (!center) {
      return
    }
    const transform = Transforms.eastNorthUpToFixedFrame(center)
    const rot = Matrix4.getMatrix3(transform, new Matrix3())
    const xDir = Matrix3.getColumn(rot, 0, new Cartesian3())
    const yDir = Matrix3.getColumn(rot, 1, new Cartesian3())
    const zDir = Matrix3.getColumn(rot, 2, new Cartesian3())
    const offset = Cartesian3.multiplyByScalar(xDir, 10, new Cartesian3())
    const len = 20
    const basePos = () => {
      const p = getPosition()
      return p ? Cartesian3.add(p, offset, new Cartesian3()) : null
    }
    const axisPositions = (dir: Cartesian3) =>
      new CallbackProperty(() => {
        const pos = basePos()
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
      polyline: { positions: axisPositions(xDir), material: Color.RED, width: 4 },
    })
    const y = viewer.entities.add({
      polyline: {
        positions: axisPositions(yDir),
        material: Color.GREEN,
        width: 4,
      },
    })
    let z: Entity | undefined
    if (enableZ) {
      z = viewer.entities.add({
        polyline: {
          positions: axisPositions(zDir),
          material: Color.BLUE,
          width: 4,
        },
      })
    }
    ;(x as Entity & { isAxis: string }).isAxis = 'x'
    ;(y as Entity & { isAxis: string }).isAxis = 'y'
    if (z) {
      ;(z as Entity & { isAxis: string }).isAxis = 'z'
    }
    axisRef.current = { x, y, z }

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    handlerRef.current = handler
    let dragging: 'x' | 'y' | 'z' | null = null
    let startMouse: Cartesian3 | null = null
    let startPlane: Plane | null = null
    const axisDirs = { x: xDir, y: yDir, z: zDir }
    const speed = 0.5

    const positionFromEvent = (
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

    const controller = viewer.scene.screenSpaceCameraController
    const state = {
      enableRotate: controller.enableRotate,
      enableTranslate: controller.enableTranslate,
      enableZoom: controller.enableZoom,
      enableTilt: controller.enableTilt,
      enableLook: controller.enableLook,
    }

    const restore = () => {
      controller.enableRotate = state.enableRotate
      controller.enableTranslate = state.enableTranslate
      controller.enableZoom = state.enableZoom
      controller.enableTilt = state.enableTilt
      controller.enableLook = state.enableLook
    }

    handler.setInputAction((e: ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(e.position)
      if (picked) {
        const ent = picked.id as Entity & { isAxis?: string }
        if (ent.isAxis) {
          dragging = ent.isAxis as 'x' | 'y' | 'z'
          startMouse = positionFromEvent(e)
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
      restore()
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
        const amount = Cartesian3.dot(diff, dir) * speed
        const translation = Cartesian3.multiplyByScalar(dir, amount, new Cartesian3())
        onTranslate(translation)
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

    return () => {
      if (axisRef.current) {
        viewer.entities.remove(axisRef.current.x)
        viewer.entities.remove(axisRef.current.y)
        if (axisRef.current.z) {
          viewer.entities.remove(axisRef.current.z)
        }
        axisRef.current = null
      }
      if (handlerRef.current) {
        handlerRef.current.destroy()
        handlerRef.current = null
      }
      restore()
    }
  }, [viewer, enableZ, getPosition, onTranslate])

  return null
}

export default AxisHelper
