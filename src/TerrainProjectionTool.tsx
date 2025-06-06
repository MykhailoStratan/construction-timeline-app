import { useCallback } from 'react'
import {
  Viewer,
  Cartesian3,
  Cartographic,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  PolygonHierarchy,
  HeightReference,
} from 'cesium'
import { useDrawing } from './hooks/DrawingContext'

interface TerrainProjectionToolProps {
  viewer: Viewer | null
}

const TerrainProjectionTool = ({ viewer }: TerrainProjectionToolProps) => {
  const { selectedAreaRef } = useDrawing()

  const project = useCallback(async () => {
    const area = selectedAreaRef.current
    if (!viewer || !area) {
      return
    }
    const positions = area.positions || []
    if (positions.length === 0) return
    const cartos = positions.map((p) => Cartographic.fromCartesian(p))
    let sampled = cartos
    try {
      sampled = await viewer.scene.sampleHeightMostDetailed(cartos)
    } catch {
      // ignore and use original heights
    }
    const elevated = sampled.map((c) =>
      Cartesian3.fromRadians(c.longitude, c.latitude, c.height + 20),
    )
    viewer.entities.add({
      polygon: {
        hierarchy: new PolygonHierarchy(elevated),
        perPositionHeight: true,
        material: new ColorMaterialProperty(Color.CYAN.withAlpha(0.6)),
        outline: true,
        outlineColor: new ConstantProperty(Color.CYAN),
        heightReference: HeightReference.NONE,
      },
    })
  }, [viewer, selectedAreaRef])

  return <button onClick={project}>Terrain projection</button>
}

export default TerrainProjectionTool
