import { useEffect, useRef } from 'react'
import {
  Viewer,
  Ion,
  createWorldTerrainAsync,
  createOsmBuildingsAsync,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

const ionToken = import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN
if (ionToken) {
  Ion.defaultAccessToken = ionToken
}

const CesiumViewer = () => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    let viewer: Viewer | undefined

    const initialize = async () => {
      const terrainProvider = await createWorldTerrainAsync()
      viewer = new Viewer(containerRef.current!, { terrainProvider })

      try {
        const osmBuildings = await createOsmBuildingsAsync()
        viewer.scene.primitives.add(osmBuildings)
      } catch (error) {
        console.error('Error loading OSM Buildings', error)
      }

      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(-123.102943, 49.271094, 4000),
      })
    }

    initialize()

    return () => {
      viewer?.destroy()
    }
  }, [])

  return <div ref={containerRef} style={{ height: '100vh', width: '100%' }} />
}

export default CesiumViewer
