import { useCallback } from 'react'
import {
  Viewer,
  Cartesian3,
  Cartographic,
  Color,
  ColorMaterialProperty,
  PolygonHierarchy,
  HeightReference,
} from 'cesium'
import { useDrawing } from './hooks/DrawingContext'

function pointInPolygon(point: Cartographic, polygon: Cartographic[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].longitude
    const yi = polygon[i].latitude
    const xj = polygon[j].longitude
    const yj = polygon[j].latitude
    const intersect =
      yi > point.latitude !== yj > point.latitude &&
      point.longitude <
        ((xj - xi) * (point.latitude - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

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

    const lons = cartos.map((c) => c.longitude)
    const lats = cartos.map((c) => c.latitude)
    const minLon = Math.min(...lons)
    const maxLon = Math.max(...lons)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const steps = 10
    const stepLon = (maxLon - minLon) / steps
    const stepLat = (maxLat - minLat) / steps

    const cells: Cartographic[][] = []
    for (let i = 0; i < steps; i++) {
      for (let j = 0; j < steps; j++) {
        const west = minLon + i * stepLon
        const east = west + stepLon
        const south = minLat + j * stepLat
        const north = south + stepLat
        const center = new Cartographic((west + east) / 2, (south + north) / 2)
        if (!pointInPolygon(center, cartos)) continue
        cells.push([
          new Cartographic(west, south),
          new Cartographic(east, south),
          new Cartographic(east, north),
          new Cartographic(west, north),
        ])
      }
    }
    const toSample = cells.flat()
    let sampled = toSample
    try {
      sampled = await viewer.scene.sampleHeightMostDetailed(toSample)
    } catch {
      // ignore errors
    }
    let idx = 0
    for (const cell of cells) {
      const withHeights = cell.map(() => sampled[idx++])
      const elevated = withHeights.map((c) =>
        Cartesian3.fromRadians(c.longitude, c.latitude, c.height + 20),
      )
      viewer.entities.add({
        polygon: {
          hierarchy: new PolygonHierarchy(elevated),
          perPositionHeight: true,
          material: new ColorMaterialProperty(Color.CYAN.withAlpha(0.6)),
          outline: false,
          heightReference: HeightReference.NONE,
        },
      })
    }
  }, [viewer, selectedAreaRef])

  return <button onClick={project}>Terrain projection</button>
}

export default TerrainProjectionTool
