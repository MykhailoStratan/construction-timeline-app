import { useEffect, useRef, useState } from 'react'
import {
  Viewer,
  Ion,
  createWorldTerrainAsync,
  createOsmBuildingsAsync,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
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
  const selectedAnchorRef = useRef<Entity | null>(null)
  const anchorsRef = useRef<Entity[]>([])
  const [isLineMode, setIsLineMode] = useState(false)

  const highlightLine = (line: Entity) => {
    if (line.polyline) {
      line.polyline.material = new ColorMaterialProperty(Color.RED)
      line.polyline.width = new ConstantProperty(3)
    }
  }

  const unhighlightLine = (line: Entity) => {
    if (line.polyline) {
      line.polyline.material = new ColorMaterialProperty(Color.YELLOW)
      line.polyline.width = new ConstantProperty(2)
    }
  }

  const highlightAnchor = (anchor: Entity) => {
    if (anchor.point) {
      anchor.point.color = new ConstantProperty(Color.RED)
      anchor.point.pixelSize = new ConstantProperty(10)
    }
  }

  const unhighlightAnchor = (anchor: Entity) => {
    if (anchor.point) {
      anchor.point.color = new ConstantProperty(Color.ORANGE)
      anchor.point.pixelSize = new ConstantProperty(8)
    }
  }

  const addAnchor = (position: Cartesian3) => {
    const viewer = viewerRef.current
    if (!viewer) {
      return null
    }
    for (const existing of anchorsRef.current) {
      const pos = existing.position?.getValue(viewer.clock.currentTime)
      if (pos && Cartesian3.distance(pos, position) < 1) {
        return existing
      }
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
    ;(
      anchor as Entity & { isAnchor: boolean; connectedLines: Set<Entity> }
    ).isAnchor = true
    ;(
      anchor as Entity & { isAnchor: boolean; connectedLines: Set<Entity> }
    ).connectedLines = new Set()
    anchorsRef.current.push(anchor)
    return anchor
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
        const startAnchor = addAnchor(startPositionRef.current!)!
        const endAnchor = addAnchor(position)!
        const line = viewer.entities.add({
          polyline: {
            positions: [startPositionRef.current!, position],
            width: new ConstantProperty(2),
            material: new ColorMaterialProperty(Color.YELLOW),
            clampToGround: true,
          },
        })
        ;(
          line as Entity & {
            isLine: boolean
            anchors: [Entity, Entity]
          }
        ).isLine = true
        ;(
          line as Entity & {
            isLine: boolean
            anchors: [Entity, Entity]
          }
        ).anchors = [startAnchor, endAnchor]
        ;(
          startAnchor as Entity & {
            connectedLines: Set<Entity>
          }
        ).connectedLines.add(line)
        ;(
          endAnchor as Entity & {
            connectedLines: Set<Entity>
          }
        ).connectedLines.add(line)
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
          if (picked) {
            const entity = picked.id as Entity & {
              isLine?: boolean
              isAnchor?: boolean
            }
            if (entity.isLine) {
              if (
                selectedLineRef.current &&
                selectedLineRef.current !== entity
              ) {
                unhighlightLine(selectedLineRef.current)
              }
              if (selectedAnchorRef.current) {
                unhighlightAnchor(selectedAnchorRef.current)
                selectedAnchorRef.current = null
              }
              selectedLineRef.current = entity
              highlightLine(entity)
              return
            }
            if (entity.isAnchor) {
              if (
                selectedAnchorRef.current &&
                selectedAnchorRef.current !== entity
              ) {
                unhighlightAnchor(selectedAnchorRef.current)
              }
              if (selectedLineRef.current) {
                unhighlightLine(selectedLineRef.current)
                selectedLineRef.current = null
              }
              selectedAnchorRef.current = entity
              highlightAnchor(entity)
              return
            }
          }
          if (selectedLineRef.current) {
            unhighlightLine(selectedLineRef.current)
            selectedLineRef.current = null
          }
          if (selectedAnchorRef.current) {
            unhighlightAnchor(selectedAnchorRef.current)
            selectedAnchorRef.current = null
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
      if (event.key === 'Delete' && viewerRef.current) {
        const viewer = viewerRef.current
        if (selectedLineRef.current) {
          const line = selectedLineRef.current as Entity & {
            anchors?: [Entity, Entity]
          }
          viewer.entities.remove(line)
          if (line.anchors) {
            for (const anchor of line.anchors) {
              const a = anchor as Entity & { connectedLines?: Set<Entity> }
              a.connectedLines?.delete(line)
              if (!a.connectedLines || a.connectedLines.size === 0) {
                viewer.entities.remove(a)
                anchorsRef.current = anchorsRef.current.filter((e) => e !== a)
                if (selectedAnchorRef.current === a) {
                  selectedAnchorRef.current = null
                }
              }
            }
          }
          selectedLineRef.current = null
        } else if (selectedAnchorRef.current) {
          const anchor = selectedAnchorRef.current as Entity & {
            connectedLines?: Set<Entity>
          }
          viewer.entities.remove(anchor)
          anchorsRef.current = anchorsRef.current.filter((e) => e !== anchor)
          anchor.connectedLines?.forEach((line) => {
            const l = line as Entity & { anchors?: [Entity, Entity] }
            if (l.anchors) {
              l.anchors = l.anchors.filter((a) => a !== anchor) as [
                Entity,
                Entity
              ]
            }
          })
          selectedAnchorRef.current = null
        }
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
