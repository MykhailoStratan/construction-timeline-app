import { useRef, useState, useCallback, useEffect } from 'react'
import {
  Viewer,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Cartesian3,
  HeightReference,
} from 'cesium'

interface ModelPlacementToolProps {
  viewer: Viewer | null
}

const ModelPlacementTool = ({ viewer }: ModelPlacementToolProps) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [modelUrl, setModelUrl] = useState<string | null>(null)
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null)
  const [isActive, setIsActive] = useState(false)

  const stop = useCallback(() => {
    handlerRef.current?.destroy()
    handlerRef.current = null
    setIsActive(false)
    if (modelUrl) {
      URL.revokeObjectURL(modelUrl)
    }
    setModelUrl(null)
  }, [modelUrl])

  const startPlacement = useCallback(() => {
    if (!viewer || !modelUrl) {
      return
    }
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    handlerRef.current = handler
    handler.setInputAction((event: ScreenSpaceEventHandler.PositionedEvent) => {
      const pos = event.position
      let cartesian: Cartesian3 | null = null
      const ray = viewer!.camera.getPickRay(pos)
      if (ray) {
        cartesian = viewer!.scene.globe.pick(ray, viewer!.scene) || null
      }
      if (!cartesian) {
        cartesian = viewer!.camera.pickEllipsoid(pos) || null
      }
      if (cartesian) {
        viewer!.entities.add({
          position: cartesian,
          model: { uri: modelUrl, heightReference: HeightReference.CLAMP_TO_GROUND },
        })
        stop()
      }
    }, ScreenSpaceEventType.LEFT_CLICK)
  }, [viewer, modelUrl, stop])

  useEffect(() => {
    if (isActive) {
      startPlacement()
    }
    return () => {
      handlerRef.current?.destroy()
      handlerRef.current = null
    }
  }, [isActive, startPlacement])

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!viewer || !file) {
        return
      }
      const url = URL.createObjectURL(file)
      setModelUrl(url)
      setIsActive(true)
    },
    [viewer],
  )

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".gltf,.glb"
        style={{ display: 'none' }}
        onChange={onFileChange}
      />
      <button
        onClick={() => inputRef.current?.click()}
        style={{ border: isActive ? '2px solid yellow' : '1px solid gray' }}
      >
        Add model
      </button>
    </>
  )
}

export default ModelPlacementTool
