import { useEffect, useRef } from 'react'
import {
  Viewer,
  Ion,
  createWorldTerrainAsync,
  createOsmBuildingsAsync,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Color,
  Cartesian3,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

const ionToken = import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN
if (ionToken) {
  Ion.defaultAccessToken = ionToken
}

const CesiumViewer = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const drawHandlerRef = useRef<ScreenSpaceEventHandler | null>(null)
  const startPositionRef = useRef<Cartesian3 | null>(null)

  const startLineMode = () => {
    const viewer = viewerRef.current
    if (!viewer) {
      return
    }
    drawHandlerRef.current?.destroy()
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    drawHandlerRef.current = handler
    let firstClick = true
    handler.setInputAction((event: ScreenSpaceEventHandler.PositionedEvent) => {
      const position =
        viewer.scene.pickPosition(event.position) ||
        viewer.camera.pickEllipsoid(event.position)
      if (!position) {
        return
      }
      if (firstClick) {
        startPositionRef.current = position
        firstClick = false
      } else {
        viewer.entities.add({
          polyline: {
            positions: [startPositionRef.current!, position],
            width: 2,
            material: Color.YELLOW,
            clampToGround: true,
          },
        })
        handler.destroy()
        drawHandlerRef.current = null
      }
    }, ScreenSpaceEventType.LEFT_CLICK)
  }

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    let viewer: Viewer | undefined

    const initialize = async () => {
      const terrainProvider = await createWorldTerrainAsync()
      viewer = new Viewer(containerRef.current!, { terrainProvider })
      viewerRef.current = viewer

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
      drawHandlerRef.current?.destroy()
    }
  }, [])

  return (
    <div style={{ position: 'relative', height: '100vh', width: '100%' }}>
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          bottom: 0,
          width: '60px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '8px',
          backgroundColor: 'rgba(0,0,0,0.3)',
        }}
      >
        <button onClick={startLineMode}>Line</button>
      </div>
    </div>
  )
}

export default CesiumViewer
