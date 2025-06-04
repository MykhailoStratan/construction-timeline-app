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
  Cartographic,
  HeightReference,
  Entity,
  Cesium3DTileFeature,
  BoundingSphere,
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
    let handler: ScreenSpaceEventHandler | undefined
    let footprintEntity: Entity | undefined

    const initialize = async () => {
      const terrainProvider = await createWorldTerrainAsync()
      viewer = new Viewer(containerRef.current!, { terrainProvider })

      try {
        const osmBuildings = await createOsmBuildingsAsync()
        viewer.scene.primitives.add(osmBuildings)
      } catch (error) {
        console.error('Error loading OSM Buildings', error)
      }

      handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
      handler.setInputAction((click: ScreenSpaceEventHandler.PositionedEvent) => {
        if (!viewer) {
          return
        }

        const picked = viewer.scene.pick(click.position)
        if (!picked || !(picked instanceof Cesium3DTileFeature)) {
          return
        }

        const feature = picked as Cesium3DTileFeature & {
          content?: {
            tile?: {
              contentBoundingVolume?: { boundingSphere: BoundingSphere }
              boundingSphere?: BoundingSphere
            }
          }
        }
        const tile = feature.content?.tile
        const bs =
          tile?.contentBoundingVolume?.boundingSphere ?? tile?.boundingSphere
        if (!bs) {
          return
        }

        const centerCart = Cartographic.fromCartesian(bs.center)
        const metersPerDegree = 111319.9
        const deltaRad = ((bs.radius ?? 1) / metersPerDegree) * (Math.PI / 180)

        const positions = [
          Cartesian3.fromRadians(centerCart.longitude - deltaRad, centerCart.latitude - deltaRad, 0),
          Cartesian3.fromRadians(centerCart.longitude + deltaRad, centerCart.latitude - deltaRad, 0),
          Cartesian3.fromRadians(centerCart.longitude + deltaRad, centerCart.latitude + deltaRad, 0),
          Cartesian3.fromRadians(centerCart.longitude - deltaRad, centerCart.latitude + deltaRad, 0),
        ]

        if (footprintEntity) {
          viewer.entities.remove(footprintEntity)
        }

        footprintEntity = viewer.entities.add({
          polygon: {
            hierarchy: positions,
            material: Color.YELLOW.withAlpha(0.5),
            heightReference: HeightReference.CLAMP_TO_GROUND,
          },
        })
      }, ScreenSpaceEventType.LEFT_CLICK)

      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(
          -123.102943,
          49.271094,
          4000,
        ),
      })
    }

    initialize()

    return () => {
      handler?.destroy()
      viewer?.destroy()
    }
  }, [])

  return <div ref={containerRef} style={{ height: '100vh', width: '100%' }} />
}

export default CesiumViewer
