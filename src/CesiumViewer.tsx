import { useEffect, useRef } from 'react'
import {
  Viewer,
  Ion,
  createWorldTerrainAsync,
  createOsmBuildingsAsync,
  ScreenSpaceEventType,
  Cartesian3,
  Matrix3,
  OrientedBoundingBox,
  ClassificationType,
  Color,
  HeightReference,
  Cartographic,
  Math as CesiumMath,
  Cesium3DTileFeature,
  Entity,
  ScreenSpaceEventHandler,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

interface TileFeatureWithContent extends Cesium3DTileFeature {
  content?: { boundingVolume?: unknown }
}

const ionToken = import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN
if (ionToken) {
  Ion.defaultAccessToken = ionToken
}

const CesiumViewer = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const footprintEntities = useRef<Entity[]>([])

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

        const handler = viewer.screenSpaceEventHandler

        const createFootprint = (feature: TileFeatureWithContent) => {
          const bv = feature.content?.boundingVolume as OrientedBoundingBox | undefined
          if (bv instanceof OrientedBoundingBox) {
            const center = bv.center
            const halfAxes = bv.halfAxes
            const xAxis = Matrix3.getColumn(halfAxes, 0, new Cartesian3())
            const yAxis = Matrix3.getColumn(halfAxes, 1, new Cartesian3())
            const zAxis = Matrix3.getColumn(halfAxes, 2, new Cartesian3())

            const bottom = Cartesian3.subtract(center, zAxis, new Cartesian3())

            const c1 = Cartesian3.add(bottom, xAxis, new Cartesian3())
            Cartesian3.add(c1, yAxis, c1)
            const c2 = Cartesian3.subtract(bottom, xAxis, new Cartesian3())
            Cartesian3.add(c2, yAxis, c2)
            const c3 = Cartesian3.subtract(bottom, xAxis, new Cartesian3())
            Cartesian3.subtract(c3, yAxis, c3)
            const c4 = Cartesian3.add(bottom, xAxis, new Cartesian3())
            Cartesian3.subtract(c4, yAxis, c4)

            const toDegrees = (cart: Cartesian3) => {
              const c = Cartographic.fromCartesian(cart)
              return [CesiumMath.toDegrees(c.longitude), CesiumMath.toDegrees(c.latitude)]
            }

            const coords = [c1, c2, c3, c4].flatMap(toDegrees)

            const entity = viewer!.entities.add({
              name: 'footprint',
              polygon: {
                hierarchy: Cartesian3.fromDegreesArray(coords),
                material: Color.YELLOW.withAlpha(0.5),
                outline: true,
                outlineColor: Color.YELLOW,
                classificationType: ClassificationType.BOTH,
                heightReference: HeightReference.CLAMP_TO_GROUND,
              },
            })
            footprintEntities.current.push(entity)
          }
        }

        handler.setInputAction((movement: ScreenSpaceEventHandler.PositionedEvent) => {
          const picked = viewer!.scene.pick(movement.position)
          if (picked && picked instanceof Cesium3DTileFeature) {
            createFootprint(picked as TileFeatureWithContent)
          }
        }, ScreenSpaceEventType.LEFT_CLICK)

        handler.setInputAction((movement: ScreenSpaceEventHandler.PositionedEvent) => {
          const picked = viewer!.scene.pick(movement.position)
          if (picked && (picked.id && picked.id.name === 'footprint')) {
            viewer!.entities.remove(picked.id)
            footprintEntities.current = footprintEntities.current.filter((e) => e !== picked.id)
          }
        }, ScreenSpaceEventType.RIGHT_CLICK)

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
    }
  }, [])

  return <div ref={containerRef} style={{ height: '100vh', width: '100%' }} />
}

export default CesiumViewer
