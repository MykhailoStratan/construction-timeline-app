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
  onTranslate: (delta: Cartesian3) => void
}

const AXIS_LENGTH = 20
const AXIS_OFFSET = 10
const DRAG_SPEED = 0.5

const AxisHelper = ({ viewer, enableZ, getPosition, onTranslate }: AxisHelperProps) => {
  const entitiesRef = useRef<{ x: Entity; y: Entity; z?: Entity } | null>(null)
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null)

  useEffect(() => {
    const center = getPosition()
    if (!center) return

    const transform = Transforms.eastNorthUpToFixedFrame(center)
    const rot = Matrix4.getMatrix3(transform, new Matrix3())
    const xDir = Matrix3.getColumn(rot, 0, new Cartesian3())
    const yDir = Matrix3.getColumn(rot, 1, new Cartesian3())
    const zDir = Matrix3.getColumn(rot, 2, new Cartesian3())

    const offset = Cartesian3.multiplyByScalar(xDir, AXIS_OFFSET, new Cartesian3())
      const pos = getPosition()
      return pos ? Cartesian3.add(pos, offset, new Cartesian3()) : null
    }
    const makePositions = (dir: Cartesian3) =>
        const origin = basePos()
        if (!origin) return []
          origin,
          Cartesian3.multiplyByScalar(dir, AXIS_LENGTH, new Cartesian3()),
        )
        return [origin, end]
      }, false)
        positions: makePositions(xDir),
    })
        positions: makePositions(yDir),
    })
    let z: Entity | undefined
          positions: makePositions(zDir),
      })
    ;(x as Entity & { axis?: 'x' }).axis = 'x'
    ;(y as Entity & { axis?: 'y' }).axis = 'y'
      ;(z as Entity & { axis?: 'z' }).axis = 'z'
    }
    entitiesRef.current = { x, y, z }

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    handlerRef.current = handler

    const controller = viewer.scene.screenSpaceCameraController
    const saved = {
      rotate: controller.enableRotate,
      translate: controller.enableTranslate,
      zoom: controller.enableZoom,
      tilt: controller.enableTilt,
      look: controller.enableLook,
    const restore = () => {
      controller.enableRotate = saved.rotate
      controller.enableTranslate = saved.translate
      controller.enableZoom = saved.zoom
      controller.enableTilt = saved.tilt
      controller.enableLook = saved.look
    }

    let dragging: 'x' | 'y' | 'z' | null = null
    let startPos: Cartesian3 | null = null
    let dragPlane: Plane | null = null
    const dirs = { x: xDir, y: yDir, z: zDir }
      ev: ScreenSpaceEventHandler.PositionedEvent | ScreenSpaceEventHandler.MotionEvent,
      const pos = 'position' in ev ? ev.position : ev.endPosition
      const ray = viewer.camera.getPickRay(pos)
        const g = viewer.scene.globe.pick(ray, viewer.scene)
        if (g) return g
      return viewer.camera.pickEllipsoid(pos) || null
    }
      ev: ScreenSpaceEventHandler.PositionedEvent | ScreenSpaceEventHandler.MotionEvent,
      const pos = 'position' in ev ? ev.position : ev.endPosition
      const ray = viewer.camera.getPickRay(pos)
      if (!ray) return null
      return IntersectionTests.rayPlane(ray, plane, new Cartesian3()) || null
    }
      const picked = viewer.scene.pick(e.position)
        const ent = picked.id as Entity & { axis?: 'x' | 'y' | 'z' }
        if (ent.axis) {
          dragging = ent.axis
          if (dragging === 'z') {
            const base = getPosition()
            if (!base) return
            let normal = Cartesian3.cross(viewer.camera.direction, zDir, new Cartesian3())
              normal = Cartesian3.cross(viewer.camera.up, zDir, new Cartesian3())
            Cartesian3.normalize(normal, normal)
            dragPlane = Plane.fromPointNormal(base, normal)
            startPos = planeIntersection(e, dragPlane)
            startPos = groundFromEvent(e)
          controller.enableRotate = false
          controller.enableTranslate = false
          controller.enableZoom = false
          controller.enableTilt = false
          controller.enableLook = false
    }, ScreenSpaceEventType.LEFT_DOWN)
      dragging = null
      startPos = null
      dragPlane = null
      restore()
    }, ScreenSpaceEventType.LEFT_UP)
      if (dragging && startPos) {
        if (dragging === 'z') {
          if (!dragPlane) return
          const end = planeIntersection(m, dragPlane)
          if (!end) return
          const diff = Cartesian3.subtract(end, startPos, new Cartesian3())
          const dist = Cartesian3.dot(diff, zDir) * DRAG_SPEED
          const delta = Cartesian3.multiplyByScalar(zDir, dist, new Cartesian3())
          onTranslate(delta)
          startPos = end
          return
        const end = groundFromEvent(m)
        if (!end) return
        const dir = dirs[dragging]
        const diff = Cartesian3.subtract(end, startPos, new Cartesian3())
        const dist = Cartesian3.dot(diff, dir) * DRAG_SPEED
        const delta = Cartesian3.multiplyByScalar(dir, dist, new Cartesian3())
        onTranslate(delta)
        startPos = end
        return
      const picked = viewer.scene.pick(m.endPosition)
        const ent = picked.id as Entity & { axis?: 'x' | 'y' | 'z' }
        if (ent.axis) {
          ent.polyline!.width = new ConstantProperty(8)
          return
      const current = entitiesRef.current as Record<'x' | 'y' | 'z', Entity | undefined> | null
      ;(['x', 'y', 'z'] as const).forEach((k) => {
        const ent = current?.[k]
        if (ent && ent.polyline) {
          ent.polyline.width = new ConstantProperty(4)
        }
      })
    }, ScreenSpaceEventType.MOUSE_MOVE)
      if (entitiesRef.current) {
        viewer.entities.remove(entitiesRef.current.x)
        viewer.entities.remove(entitiesRef.current.y)
        if (entitiesRef.current.z) viewer.entities.remove(entitiesRef.current.z)
        entitiesRef.current = null
      handler.destroy()
      handlerRef.current = null
      restore()
    }
  }, [viewer, enableZ, getPosition, onTranslate])
  return null
}

export default AxisHelper
      dragging = null
      startMouse = null
      startPlane = null
      dragPos = null
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
        dragPos = endPos
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
      dragPos = null
      restore()
    }
  }, [viewer, enableZ, getPosition, onTranslate])

  return null
}

export default AxisHelper
