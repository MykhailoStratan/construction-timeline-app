import { Entity, Cartesian3 } from 'cesium'

export interface LineEntity extends Entity {
  isLine: boolean
  anchors: [AnchorEntity, AnchorEntity]
}

export interface AnchorEntity extends Entity {
  isAnchor: boolean
  connectedLines: Set<LineEntity>
}

export interface AreaEntity extends Entity {
  isArea: boolean
  positions: Cartesian3[]
}
