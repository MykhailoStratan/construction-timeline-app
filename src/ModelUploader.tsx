import { Viewer, Model } from 'cesium'
import type { ChangeEvent } from 'react'

interface ModelUploaderProps {
  viewer: Viewer | null
}

async function parseGltf(file: File): Promise<Record<string, unknown> | null> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.gltf')) {
    const text = await file.text()
    return JSON.parse(text) as Record<string, unknown>
  }
  const buffer = await file.arrayBuffer()
  if (buffer.byteLength < 20) {
    return null
  }
  const view = new DataView(buffer)
  const length = view.getUint32(12, true)
  const jsonStart = 20
  const json = new TextDecoder().decode(
    new Uint8Array(buffer, jsonStart, length),
  )
  try {
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

const ModelUploader = ({ viewer }: ModelUploaderProps) => {
  const onChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!viewer) return
    const file = e.target.files?.[0]
    if (!file) return

    const gltf = await parseGltf(file)
    const images = (gltf as { images?: unknown[] } | null)?.images
    const hasTextures = Array.isArray(images) && images.length > 0

    const url = URL.createObjectURL(file)
    try {
      const model = await Model.fromGltfAsync({
        url,
        incrementallyLoadTextures: true,
      })
      viewer.scene.primitives.add(model)

      if (!hasTextures) {
        alert('Model has no textures defined.')
      }

      model.texturesReadyEvent.addEventListener(() => {
        if (hasTextures) {
          console.log('Textures loaded and applied.')
        }
      })
    } catch (err) {
      console.error('Failed to load model', err)
    }
  }

  return <input type="file" accept=".gltf,.glb" onChange={onChange} />
}

export default ModelUploader
