import { Viewer } from 'cesium'
import LineDrawer from './LineDrawer'
import Area from './Area'
import { DrawingProvider } from './hooks/DrawingContext'

interface ToolsPanelProps {
  viewer: Viewer | null
}

const ToolsPanel = ({ viewer }: ToolsPanelProps) => {
  return (
    <DrawingProvider viewer={viewer}>
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
        <LineDrawer viewer={viewer} />
        <Area viewer={viewer} />
      </div>
    </DrawingProvider>
  )
}

export default ToolsPanel
