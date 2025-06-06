import { Viewer } from 'cesium'
import LineDrawer from './LineDrawer'
import Area from './Area'
import { DrawingProvider } from './hooks/DrawingContext'
import styles from './ToolsPanel.module.css'

interface ToolsPanelProps {
  viewer: Viewer | null
}

const ToolsPanel = ({ viewer }: ToolsPanelProps) => {
  return (
    <DrawingProvider viewer={viewer}>
      <div className={styles.panel}>
        <LineDrawer viewer={viewer} />
        <Area viewer={viewer} />
      </div>
    </DrawingProvider>
  )
}

export default ToolsPanel
