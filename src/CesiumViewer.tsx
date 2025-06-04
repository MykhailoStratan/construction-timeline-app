import { useEffect, useRef, useState } from 'react'
import {
  Viewer,
  Ion,
  createWorldTerrainAsync,
  createOsmBuildingsAsync,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Color,
  Cartesian3,
  Entity,
  HeightReference,
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
  const selectionHandlerRef = useRef<ScreenSpaceEventHandler | null>(null)
  const startPositionRef = useRef<Cartesian3 | null>(null)
  const selectedLineRef = useRef<Entity | null>(null)
  const [isLineMode, setIsLineMode] = useState(false)

  const addAnchor = (position: Cartesian3) => {
    const viewer = viewerRef.current
    if (!viewer) {
      return
    }
    const anchor: Entity = viewer.entities.add({
      position,
      point: {
        pixelSize: 8,
        color: Color.ORANGE,
        outlineColor: Color.WHITE,
        outlineWidth: 1,
        heightReference: HeightReference.CLAMP_TO_GROUND,
      },
    })
    ;(anchor as Entity & { isAnchor: boolean }).isAnchor = true
  }

  const startLineMode = () => {
    const viewer = viewerRef.current
    if (!viewer) {
      return
    }

    if (drawHandlerRef.current) {
      drawHandlerRef.current.destroy()
      drawHandlerRef.current = null
      setIsLineMode(false)
      return
    }

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    drawHandlerRef.current = handler
    setIsLineMode(true)

    let firstClick = true
    const getClickPosition = (
      event: ScreenSpaceEventHandler.PositionedEvent,
    ): Cartesian3 | null => {
      const picked = viewer.scene.pick(event.position)
      if (picked) {
        const entity = picked.id as Entity & { isAnchor?: boolean }
        if (entity.isAnchor) {
          return entity.position?.getValue(viewer.clock.currentTime) || null
        }
      }
      return (
        viewer.scene.pickPosition(event.position) ||
        viewer.camera.pickEllipsoid(event.position)
      )
    }
    handler.setInputAction((event: ScreenSpaceEventHandler.PositionedEvent) => {
      const position = getClickPosition(event)
      if (!position) {
        return
      }
      if (firstClick) {
        startPositionRef.current = position
        firstClick = false
      } else {
        const line = viewer.entities.add({
          polyline: {
            positions: [startPositionRef.current!, position],
            width: 2,
            material: Color.YELLOW,
            clampToGround: true,
          },
        })
        ;(line as Entity & { isLine: boolean }).isLine = true
        addAnchor(startPositionRef.current!)
        addAnchor(position)
        // prepare for drawing the next line without leaving line mode
        startPositionRef.current = null
        firstClick = true
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

      const selectionHandler = new ScreenSpaceEventHandler(viewer.scene.canvas)
      selectionHandlerRef.current = selectionHandler
      selectionHandler.setInputAction(
        (event: ScreenSpaceEventHandler.PositionedEvent) => {
          if (drawHandlerRef.current) {
            return
          }
          const picked = viewer!.scene.pick(event.position)
          if (
            picked &&
            (picked.id as Entity & { isLine?: boolean }).isLine
          ) {
            if (
              selectedLineRef.current &&
              selectedLineRef.current !== picked.id
            ) {
              const prev = selectedLineRef.current
              if (prev.polyline) {
                prev.polyline.material = Color.YELLOW
                prev.polyline.width = 2
              }
            }
            selectedLineRef.current = picked.id as Entity
            if (selectedLineRef.current.polyline) {
              selectedLineRef.current.polyline.material = Color.RED
              selectedLineRef.current.polyline.width = 3
            }
          } else if (selectedLineRef.current) {
            if (selectedLineRef.current.polyline) {
              selectedLineRef.current.polyline.material = Color.YELLOW
              selectedLineRef.current.polyline.width = 2
            }
            selectedLineRef.current = null
          }
        },
        ScreenSpaceEventType.LEFT_CLICK,
      )

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
      drawHandlerRef.current?.destroy()
      selectionHandlerRef.current?.destroy()
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && drawHandlerRef.current) {
        drawHandlerRef.current.destroy()
        drawHandlerRef.current = null
        setIsLineMode(false)
      }
      if (event.key === 'Delete' && selectedLineRef.current && viewerRef.current) {
        viewerRef.current.entities.remove(selectedLineRef.current)
        selectedLineRef.current = null
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isLineMode])

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
        <button
          onClick={startLineMode}
          style={{ border: isLineMode ? '2px solid yellow' : '1px solid gray' }}
        >
          Line
        </button>
      </div>
    </div>
  )
}

export default CesiumViewer
