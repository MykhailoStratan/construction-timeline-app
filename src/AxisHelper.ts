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
} from 'cesium'

interface ShowOptions {
  enableZ?: boolean
  getPosition: () => Cartesian3 | null
  onTranslate: (translation: Cartesian3) => void
}

class AxisHelper {
  private viewer: Viewer
  private axis: { x: Entity; y: Entity; z?: Entity } | null = null
  private handler: ScreenSpaceEventHandler | null = null

  constructor(viewer: Viewer) {
    this.viewer = viewer
  }

  remove() {
    if (this.axis) {
      this.viewer.entities.remove(this.axis.x)
      this.viewer.entities.remove(this.axis.y)
      if (this.axis.z) {
        this.viewer.entities.remove(this.axis.z)
      }
      this.axis = null
    }
    if (this.handler) {
      this.handler.destroy()
      this.handler = null
    }
  }

  show(options: ShowOptions) {
    this.remove()
    const center = options.getPosition()
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
      const p = options.getPosition()
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
    const x = this.viewer.entities.add({
      polyline: { positions: axisPositions(xDir), material: Color.RED, width: 4 },
    })
    const y = this.viewer.entities.add({
      polyline: {
        positions: axisPositions(yDir),
        material: Color.GREEN,
        width: 4,
      },
    })
    let z: Entity | undefined
    if (options.enableZ) {
      z = this.viewer.entities.add({
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
    this.axis = { x, y, z }

    const handler = new ScreenSpaceEventHandler(this.viewer.scene.canvas)
    this.handler = handler
    let dragging: 'x' | 'y' | 'z' | null = null
    let startMouse: Cartesian3 | null = null
    let startPlane: Plane | null = null
    const axisDirs = { x: xDir, y: yDir, z: zDir }
    const speed = 0.5

    const getPosition = (
      event: ScreenSpaceEventHandler.PositionedEvent | ScreenSpaceEventHandler.MotionEvent,
    ): Cartesian3 | null => {
      const pos = 'position' in event ? event.position : event.endPosition
      const ray = this.viewer.camera.getPickRay(pos)
      if (ray) {
        const ground = this.viewer.scene.globe.pick(ray, this.viewer.scene)
        if (ground) {
          return ground
        }
      }
      return this.viewer.camera.pickEllipsoid(pos) || null
    }

    const controller = this.viewer.scene.screenSpaceCameraController
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
      const picked = this.viewer.scene.pick(e.position)
      if (picked) {
        const ent = picked.id as Entity & { isAxis?: string }
        if (ent.isAxis) {
          dragging = ent.isAxis as 'x' | 'y' | 'z'
          startMouse = getPosition(e)
          if (startMouse) {
            const cameraDir = this.viewer.camera.direction
            let normal = Cartesian3.cross(
              cameraDir,
              axisDirs[dragging],
              new Cartesian3(),
            )
            if (Cartesian3.magnitude(normal) === 0) {
              normal = Cartesian3.cross(
                this.viewer.camera.up,
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
        const ray = this.viewer.camera.getPickRay(m.endPosition)
        if (!ray || !startPlane) return
        const endPos = IntersectionTests.rayPlane(ray, startPlane, new Cartesian3())
        if (!endPos) return
        const diff = Cartesian3.subtract(endPos, startMouse, new Cartesian3())
        const dir = axisDirs[dragging]
        const amount = Cartesian3.dot(diff, dir) * speed
        const translation = Cartesian3.multiplyByScalar(dir, amount, new Cartesian3())
        options.onTranslate(translation)
        startMouse = endPos
        return
      }
      const picked = this.viewer.scene.pick(m.endPosition)
      if (picked) {
        const ent = picked.id as Entity & { isAxis?: string }
        if (ent.isAxis) {
          if (hovered && hovered !== ent) {
            hovered.polyline!.width = 4
          }
          hovered = ent
          hovered.polyline!.width = 8
          return
        }
      }
      if (hovered) {
        hovered.polyline!.width = 4
        hovered = null
      }
    }, ScreenSpaceEventType.MOUSE_MOVE)
  }
}

export default AxisHelper
