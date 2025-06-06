import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Viewer,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  CallbackProperty,
  Color,
  PolylineArrowMaterialProperty,
  ConstantProperty,
  Cartesian3,
  Cartographic,
  Plane,
  IntersectionTests,
  HeightReference,
  Entity,
} from 'cesium'
import { useDrawing } from './hooks/DrawingContext'
import type { AreaEntity } from './entityTypes'

interface ExtrusionToolProps {
  viewer: Viewer | null
}

const arrowLength = 20

const ExtrusionTool = ({ viewer }: ExtrusionToolProps) => {
  const { selectedAreaRef, removeAxisHelper, showAxisHelper } = useDrawing()
  const [isActive, setIsActive] = useState(false)
  const arrowRef = useRef<Entity | null>(null)
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null)
  const extrudedRef = useRef(0)

  const removeArrow = useCallback(() => {
    if (viewer && arrowRef.current) {
      viewer.entities.remove(arrowRef.current)
      arrowRef.current = null
    }
  }, [viewer])

  const stop = useCallback(() => {
    handlerRef.current?.destroy()
    handlerRef.current = null
    removeArrow()
    const area = selectedAreaRef.current
    if (area) {
      showAxisHelper(area)
    }
    setIsActive(false)
  }, [removeArrow, selectedAreaRef, showAxisHelper])

  const showArrow = useCallback(
    (area: AreaEntity) => {
      if (!viewer) return
      removeArrow()
      const positions = new CallbackProperty(() => {
        const center = area.position?.getValue(viewer.clock.currentTime)
        if (!center) return []
        const up = Cartesian3.normalize(center, new Cartesian3())
        const cart = Cartographic.fromCartesian(center)
        const base = Cartesian3.fromRadians(
          cart.longitude,
          cart.latitude,
          cart.height + extrudedRef.current,
        )
        const tip = Cartesian3.add(
          base,
          Cartesian3.multiplyByScalar(up, arrowLength, new Cartesian3()),
          new Cartesian3(),
        )
        return [base, tip]
      }, false)
      arrowRef.current = viewer.entities.add({
        polyline: {
          positions,
          width: 4,
          material: new PolylineArrowMaterialProperty(Color.BLUE),
        },
      })
    },
    [viewer, removeArrow],
  )

  const start = useCallback(() => {
    const area = selectedAreaRef.current
    if (!viewer || !area) return
    if (handlerRef.current) {
      stop()
      return
    }
    removeAxisHelper()
    setIsActive(true)
    extrudedRef.current =
      (area.polygon?.extrudedHeight?.getValue(viewer.clock.currentTime) as number) ||
      0
    area.polygon!.extrudedHeight = new ConstantProperty(extrudedRef.current)
    area.polygon!.extrudedHeightReference = new ConstantProperty(
      HeightReference.RELATIVE_TO_GROUND,
    )
    showArrow(area)

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    handlerRef.current = handler
    let dragging = false
    let startPlane: Plane | null = null
    let startPos: Cartesian3 | null = null

    const disableCamera = () => {
      const c = viewer.scene.screenSpaceCameraController
      c.enableRotate = false
      c.enableTranslate = false
      c.enableZoom = false
      c.enableTilt = false
      c.enableLook = false
    }

    const enableCamera = () => {
      const c = viewer.scene.screenSpaceCameraController
      c.enableRotate = true
      c.enableTranslate = true
      c.enableZoom = true
      c.enableTilt = true
      c.enableLook = true
    }

    handler.setInputAction((e: ScreenSpaceEventHandler.PositionedEvent) => {
      if (!arrowRef.current) return
      const picked = viewer.scene.pick(e.position)
      if (picked && picked.id === arrowRef.current) {
        const center = area.position!.getValue(viewer.clock.currentTime)!
        const up = Cartesian3.normalize(center, new Cartesian3())
        const cameraDir = viewer.camera.direction
        let normal = Cartesian3.cross(cameraDir, up, new Cartesian3())
        if (Cartesian3.magnitude(normal) === 0) {
          normal = Cartesian3.cross(viewer.camera.up, up, new Cartesian3())
        }
        Cartesian3.normalize(normal, normal)
        startPlane = Plane.fromPointNormal(center, normal)
        const ray = viewer.camera.getPickRay(e.position)
        if (!ray) return
        startPos = IntersectionTests.rayPlane(ray, startPlane, new Cartesian3())
        if (startPos) {
          dragging = true
          disableCamera()
        }
      }
    }, ScreenSpaceEventType.LEFT_DOWN)

    handler.setInputAction(() => {
      dragging = false
      startPlane = null
      startPos = null
      enableCamera()
    }, ScreenSpaceEventType.LEFT_UP)

    let hovered = false

    handler.setInputAction((m: ScreenSpaceEventHandler.MotionEvent) => {
      if (!arrowRef.current) return
      if (dragging && startPos && startPlane) {
        const ray = viewer.camera.getPickRay(m.endPosition)
        if (!ray) return
        const endPos = IntersectionTests.rayPlane(ray, startPlane, new Cartesian3())
        if (!endPos) return
        const diff = Cartesian3.subtract(endPos, startPos, new Cartesian3())
        const center = area.position!.getValue(viewer.clock.currentTime)!
        const up = Cartesian3.normalize(center, new Cartesian3())
        const amount = Cartesian3.dot(diff, up)
        extrudedRef.current += amount
        area.polygon!.extrudedHeight = new ConstantProperty(extrudedRef.current)
        startPos = endPos
        return
      }
      const picked = viewer.scene.pick(m.endPosition)
      if (picked && picked.id === arrowRef.current) {
        if (!hovered) {
          arrowRef.current.polyline!.width = new ConstantProperty(8)
          hovered = true
        }
      } else if (hovered) {
        arrowRef.current.polyline!.width = new ConstantProperty(4)
        hovered = false
      }
    }, ScreenSpaceEventType.MOUSE_MOVE)
  }, [viewer, selectedAreaRef, showArrow, stop, removeAxisHelper])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isActive) {
        stop()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [isActive, stop])

  useEffect(() => {
    return () => {
      stop()
    }
  }, [stop])

  return (
    <button onClick={start} style={{ border: isActive ? '2px solid yellow' : '1px solid gray' }}>
      Extrude
    </button>
  )
}

export default ExtrusionTool
