import { Viewer } from 'cesium'
import LineDrawer from './LineDrawer'
import Line from './Line'
import Area from './Area'
import ExtrusionTool from './ExtrusionTool'
import TerrainProjectionTool from './TerrainProjectionTool'
import { DrawingProvider } from './hooks/DrawingContext'
import styles from './ToolsPanel.module.css'

interface ToolsPanelProps {
  viewer: Viewer | null
}

const ToolsPanel = ({ viewer }: ToolsPanelProps) => {
  return (
    <DrawingProvider viewer={viewer}>
      <div className={styles.panel}>
        <Line viewer={viewer} />
        <LineDrawer viewer={viewer} />
        <Area viewer={viewer} />
        <ExtrusionTool viewer={viewer} />
        <TerrainProjectionTool viewer={viewer} />
      </div>
    </DrawingProvider>
  )
}

export default ToolsPanel
