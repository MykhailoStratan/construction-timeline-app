export interface CreateAssetResponse {
  assetMetadata: { id: number }
  uploadLocation: {
    url: string
    fields: Record<string, string>
  }
}

interface AssetStatusResponse {
  id: number
  status: string
  percentComplete?: number
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForAssetReady(id: number, token: string) {
  const statusUrl = `https://api.cesium.com/v1/assets/${id}`
  while (true) {
    const res = await fetch(statusUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      throw new Error('Failed to check asset status')
    }
    const data = (await res.json()) as AssetStatusResponse
    if (data.status === 'COMPLETE' || data.status === 'READY') {
      return
    }
    await sleep(5000)
  }
}

export async function uploadModelToIon(file: File): Promise<number> {
  const token = import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN
  if (!token || token.toLowerCase().includes('token')) {
    throw new Error('Cesium ion access token is not set')
  }

  const createRes = await fetch('https://api.cesium.com/v1/assets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      name: file.name,
      description: 'Uploaded via web app',
      type: '3DTILES',
      options: { sourceType: '3D_MODEL' },
    }),
  })
  if (!createRes.ok) {
    let msg = `Failed to create asset: ${createRes.status} ${createRes.statusText}`
    try {
      const data = await createRes.json()
      if (data && data.message) {
        msg += ` - ${data.message}`
      }
    } catch {
      // ignore JSON parse errors
    }
    if (createRes.status === 401 || createRes.status === 403) {
      throw new Error(
        msg + '. Check that your Cesium ion access token is valid and has write access.',
      )
    }
    throw new Error(msg)
  }
  const createData = (await createRes.json()) as Partial<CreateAssetResponse>
  if (
    !createData.assetMetadata?.id ||
    !createData.uploadLocation?.url ||
    !createData.uploadLocation.fields
  ) {
    throw new Error('Invalid response from Cesium ion')
  }
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

  await waitForAssetReady(createData.assetMetadata.id, token)

  return createData.assetMetadata.id
}
