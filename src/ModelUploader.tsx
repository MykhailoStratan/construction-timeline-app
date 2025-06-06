import { useState } from 'react'
import { uploadModelToIon } from './ionUpload'

const ModelUploader = () => {
  const [uploading, setUploading] = useState(false)
  const [assetId, setAssetId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      const id = await uploadModelToIon(file)
      setAssetId(id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{ padding: '1rem' }}>
      <input type="file" onChange={handleFileChange} accept=".gltf,.glb,.obj,.fbx" />
      {uploading && <p>Uploading...</p>}
      {assetId && <p>Uploaded asset ID: {assetId}</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  )
}

export default ModelUploader
