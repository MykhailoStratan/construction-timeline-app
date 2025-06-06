export interface CreateAssetResponse {
  assetMetadata: { id: number }
  uploadLocation: {
    url: string
    fields: Record<string, string>
  }
}

export async function uploadModelToIon(file: File): Promise<number> {
  const token = import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN
  if (!token) {
    throw new Error('Cesium ion access token is not set')
  }

  const createRes = await fetch('https://api.cesium.com/v1/assets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: file.name,
      type: '3DTILES',
      options: { sourceType: '3D_MODEL' },
    }),
  })
  if (!createRes.ok) {
    throw new Error(`Failed to create asset: ${createRes.statusText}`)
  }
  const createData = (await createRes.json()) as CreateAssetResponse
  const formData = new FormData()
  for (const [key, value] of Object.entries(createData.uploadLocation.fields)) {
    formData.append(key, value)
  }
  formData.append('file', file)
  const uploadRes = await fetch(createData.uploadLocation.url, {
    method: 'POST',
    body: formData,
  })
  if (!uploadRes.ok) {
    throw new Error('Upload failed')
  }
  return createData.assetMetadata.id
}
