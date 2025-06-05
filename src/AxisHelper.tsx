import { useEffect } from 'react'
import {
  Viewer,
  Entity,
  CallbackProperty,
  ConstantPositionProperty,
  Color,
  Cartesian3,
  Matrix4,
  Matrix3,
  Transforms,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  IntersectionTests,
  Plane,
} from 'cesium'

interface AxisHelperProps {
  viewer: Viewer | null
  target: Entity | null
  mode?: '2d' | '3d'
  onMove?: (translation: Cartesian3) => void
}

const AxisHelper = ({ viewer, target, mode = '2d', onMove }: AxisHelperProps) => {
  useEffect(() => {
    if (!viewer || !target) {
      return
    }
    const pos = target.position?.getValue(viewer.clock.currentTime)
    if (!pos) {
      return
    }
    const transform = Transforms.eastNorthUpToFixedFrame(pos)
    const rot = Matrix4.getMatrix3(transform, new Matrix3())
    const xDir = Matrix3.getColumn(rot, 0, new Cartesian3())
    const yDir = Matrix3.getColumn(rot, 1, new Cartesian3())
    const zDir = Matrix3.getColumn(rot, 2, new Cartesian3())
    const len = 20
    const axisPositions = (dir: Cartesian3) =>
      new CallbackProperty(() => {
        const p = target.position?.getValue(viewer.clock.currentTime)
        if (!p) return []
        const offset = Cartesian3.multiplyByScalar(dir, len, new Cartesian3())
        const end = Cartesian3.add(p, offset, new Cartesian3())
        return [p, end]
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
    ;(x as Entity & { isAxis: string }).isAxis = 'x'
    ;(y as Entity & { isAxis: string }).isAxis = 'y'
    let z: Entity | undefined
    if (mode === '3d') {
      z = viewer.entities.add({
        polyline: {
          positions: axisPositions(zDir),
          material: Color.BLUE,
          width: 4,
        },
      })
      ;(z as Entity & { isAxis: string }).isAxis = 'z'
    }

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    let dragging: 'x' | 'y' | 'z' | null = null
    let startMouse: Cartesian3 | null = null
    let startPlane: Plane | null = null
    const axisDirs: Record<string, Cartesian3> = { x: xDir, y: yDir, z: zDir }

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

    const update = (translation: Cartesian3) => {
      if (onMove) {
        onMove(translation)
      } else {
        const current = target.position?.getValue(viewer.clock.currentTime)
        if (!current) return
        const newPos = Cartesian3.add(current, translation, new Cartesian3())
        target.position = new ConstantPositionProperty(newPos)
      }
    }

    handler.setInputAction((e: ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(e.position)
      if (picked) {
        const ent = picked.id as Entity & { isAxis?: string }
        if (ent.isAxis) {
          dragging = ent.isAxis as 'x' | 'y' | 'z'
          startMouse = getPosition(e)
          if (startMouse) {
            const camDir = viewer.camera.direction
            let normal = Cartesian3.cross(camDir, axisDirs[dragging], new Cartesian3())
            if (Cartesian3.magnitude(normal) === 0) {
              normal = Cartesian3.cross(viewer.camera.up, axisDirs[dragging], new Cartesian3())
            }
            Cartesian3.normalize(normal, normal)
            startPlane = Plane.fromPointNormal(startMouse, normal)
          }
        }
      }
    }, ScreenSpaceEventType.LEFT_DOWN)

    handler.setInputAction(() => {
      dragging = null
      startMouse = null
      startPlane = null
    }, ScreenSpaceEventType.LEFT_UP)

    handler.setInputAction((m: ScreenSpaceEventHandler.MotionEvent) => {
      if (dragging && startMouse && startPlane) {
        const ray = viewer.camera.getPickRay(m.endPosition)
        if (!ray) return
        const endPos = IntersectionTests.rayPlane(ray, startPlane, new Cartesian3())
        if (!endPos) return
        const diff = Cartesian3.subtract(endPos, startMouse, new Cartesian3())
        const dir = axisDirs[dragging]
        const amount = Cartesian3.dot(diff, dir) * 0.5
        const translation = Cartesian3.multiplyByScalar(dir, amount, new Cartesian3())
        update(translation)
        startMouse = endPos
      }
    }, ScreenSpaceEventType.MOUSE_MOVE)

    return () => {
      handler.destroy()
      viewer.entities.remove(x)
      viewer.entities.remove(y)
      if (z) viewer.entities.remove(z)
    }
  }, [viewer, target, mode, onMove])

  return null
}

export default AxisHelper
