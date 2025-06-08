import { useEffect, useRef, useState } from 'react'
import {
  Viewer,
  Ion,
  createWorldTerrainAsync,
  createOsmBuildingsAsync,
  Cartesian3,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Cesium3DTileFeature,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import ToolsPanel from './ToolsPanel'
import BuildingContextMenu from './BuildingContextMenu'
import ModelUploader from './ModelUploader'

const ionToken = import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN
if (ionToken) {
  Ion.defaultAccessToken = ionToken
}

const CesiumViewer = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const [viewer, setViewer] = useState<Viewer | null>(null)
  const [contextMenu, setContextMenu] = useState<
    | { x: number; y: number; feature: Cesium3DTileFeature }
    | null
  >(null)

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

  useEffect(() => {
    if (!viewerRef.current) {
      return
    }
    const handler = new ScreenSpaceEventHandler(
      viewerRef.current.scene.canvas,
    )
    handler.setInputAction((event: ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewerRef.current!.scene.pick(event.position)
      if (picked instanceof Cesium3DTileFeature) {
        setContextMenu({
          x: event.position.x,
          y: event.position.y,
          feature: picked,
        })
      } else {
        setContextMenu(null)
      }
    }, ScreenSpaceEventType.RIGHT_CLICK)
    handler.setInputAction(() => {
      setContextMenu(null)
    }, ScreenSpaceEventType.LEFT_CLICK)
    return () => {
      handler.destroy()
    }
  }, [viewer])

  return (
    <div style={{ position: 'relative', height: '100vh', width: '100%' }}>
      <div
        ref={containerRef}
        style={{ height: '100%', width: '100%' }}
        onContextMenu={(e) => e.preventDefault()}
      />
      <ToolsPanel viewer={viewer} />
      <ModelUploader viewer={viewer} />
      {contextMenu && (
        <BuildingContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onHide={() => {
            contextMenu.feature.show = false
            setContextMenu(null)
          }}
        />
      )}
    </div>
  )
}

export default CesiumViewer
