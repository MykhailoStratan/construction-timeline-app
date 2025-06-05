import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  EllipsoidTangentPlane,
  Ellipsoid,
} from 'cesium'

export function computeAreaAndCentroid(
  positions: Cartesian3[],
  ellipsoid: Ellipsoid,
): { area: number; centroid: Cartesian3 } | null {
  if (positions.length < 3) {
    return null
  }
  const plane = EllipsoidTangentPlane.fromPoints(positions, ellipsoid)
  const projected = plane.projectPointsOntoPlane(positions, [])
  if (projected.length < 3) {
    return null
  }
  let signedArea = 0
  let cx = 0
  let cy = 0
  for (let i = 0, j = projected.length - 1; i < projected.length; j = i++) {
    const p0 = projected[j]
    const p1 = projected[i]
    const f = p0.x * p1.y - p1.x * p0.y
    signedArea += f
    cx += (p0.x + p1.x) * f
    cy += (p0.y + p1.y) * f
  }
  signedArea *= 0.5
  if (signedArea === 0) {
    return null
  }
  const area = Math.abs(signedArea)
  cx /= 6 * signedArea
  cy /= 6 * signedArea
  const centroid2D = new Cartesian2(cx, cy)
  const centroid = plane.projectPointOntoEllipsoid(centroid2D, new Cartesian3())
  return { area, centroid }
}

export function computeSurfaceAreaAndCentroid(
  positions: Cartesian3[],
): { area: number; centroid: Cartesian3 } | null {
  if (positions.length < 3) {
    return null
  }
  let area = 0
  const centroid = new Cartesian3(0, 0, 0)
  const base = positions[0]
  for (let i = 1; i < positions.length - 1; i++) {
    const b = positions[i]
    const c = positions[i + 1]
    const ab = Cartesian3.subtract(b, base, new Cartesian3())
    const ac = Cartesian3.subtract(c, base, new Cartesian3())
    const cross = Cartesian3.cross(ab, ac, new Cartesian3())
    const triArea = Cartesian3.magnitude(cross) * 0.5
    area += triArea
    const triCentroid = Cartesian3.multiplyByScalar(
      Cartesian3.add(base, Cartesian3.add(b, c, new Cartesian3()), new Cartesian3()),
      1 / 3,
      new Cartesian3(),
    )
    Cartesian3.multiplyByScalar(triCentroid, triArea, triCentroid)
    Cartesian3.add(centroid, triCentroid, centroid)
  }
  Cartesian3.divideByScalar(centroid, area, centroid)
  return { area, centroid }
}

export async function computeAreaWithTerrain(
  positions: Cartesian3[],
  sampleHeight: (cartographics: Cartographic[]) => Promise<Cartographic[]>,
): Promise<{ area: number; centroid: Cartesian3 } | null> {
  if (positions.length < 3) {
    return null
  }
  const cartographics = positions.map((p) => Cartographic.fromCartesian(p))
  try {
    const sampled = await sampleHeight(cartographics)
    const withHeights = sampled.map((c) =>
      Cartesian3.fromRadians(c.longitude, c.latitude, c.height),
    )
    return computeSurfaceAreaAndCentroid(withHeights)
  } catch {
    return computeSurfaceAreaAndCentroid(positions)
  }
}
