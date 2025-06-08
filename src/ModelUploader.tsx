import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Viewer,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Cartesian2,
  Cesium3DTileset,
  Transforms,
} from 'cesium'
import { uploadModelToIon } from './ionUpload'

interface ModelUploaderProps {
  viewer: Viewer | null
}

const ModelUploader = ({ viewer }: ModelUploaderProps) => {
  const [uploading, setUploading] = useState(false)
  const [assets, setAssets] = useState<{ id: number; name: string }[]>([])
  const [placingId, setPlacingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null)

  const placeTileset = useCallback(
    async (assetId: number, position: Cartesian2) => {
      if (!viewer) return
      try {
        const pos =
          viewer.scene.pickPosition(position) ||
          viewer.camera.pickEllipsoid(position)
        if (!pos) return
        const tileset = await Cesium3DTileset.fromIonAssetId(assetId)
        tileset.modelMatrix = Transforms.eastNorthUpToFixedFrame(pos)
        viewer.scene.primitives.add(tileset)
      } catch {
        setError('Failed to load tileset')
      }
    },
    [viewer],
  )

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      const id = await uploadModelToIon(file)
      setAssets((a) => [...a, { id, name: file.name }])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  useEffect(() => {
    if (!viewer || placingId === null) {
      return
    }
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    handlerRef.current = handler
    handler.setInputAction(async (e: ScreenSpaceEventHandler.PositionedEvent) => {
      await placeTileset(placingId, e.position)
      setPlacingId(null)
      handler.destroy()
      handlerRef.current = null
    }, ScreenSpaceEventType.LEFT_CLICK)
    return () => {
      handler.destroy()
      handlerRef.current = null
    }
  }, [viewer, placingId, placeTileset])

  return (
    <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.8)' }}>
      <input type="file" onChange={handleFileChange} accept=".gltf,.glb,.obj,.fbx" />
      {uploading && <p>Uploading and processing...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <ul>
        {assets.map((a) => (
          <li key={a.id}>
            <button onClick={() => setPlacingId(a.id)}>Place {a.name}</button>
          </li>
        ))}
      </ul>
      {placingId && <p>Click on the terrain to place the model...</p>}
    </div>
  )
}

export default ModelUploader
