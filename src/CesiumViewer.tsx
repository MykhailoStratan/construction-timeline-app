import { useEffect, useRef, useState } from 'react'
import {
  Viewer,
  Ion,
  createWorldTerrainAsync,
  createOsmBuildingsAsync,
  Cartesian3,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import ToolsPanel from './components/ToolsPanel'

const ionToken = import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN
if (ionToken) {
  Ion.defaultAccessToken = ionToken
}

const CesiumViewer = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const [viewer, setViewer] = useState<Viewer | null>(null)

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    let viewer: Viewer | undefined

    const initialize = async () => {
      const terrainProvider = await createWorldTerrainAsync()
      viewer = new Viewer(containerRef.current!, { terrainProvider })
      viewerRef.current = viewer
      setViewer(viewer)

      try {
        const osmBuildings = await createOsmBuildingsAsync()
        viewer.scene.primitives.add(osmBuildings)
      } catch (error) {
        console.error('Error loading OSM Buildings', error)
      }

      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(-123.102943, 49.271094, 4000),
      })
    }

    initialize()

    return () => {
      viewer?.destroy()
      setViewer(null)
    }
  }, [])

  return (
    <div style={{ position: 'relative', height: '100vh', width: '100%' }}>
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
      <ToolsPanel viewer={viewer} />
    </div>
  )
}

export default CesiumViewer
