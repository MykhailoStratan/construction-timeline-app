import { Viewer } from 'cesium'
import useAreaDrawing from './hooks/useAreaDrawing'

interface AreaProps {
  viewer: Viewer | null
}

const Area = ({ viewer }: AreaProps) => {
  const { startAreaMode, isAreaMode } = useAreaDrawing(viewer)

  return (
    <button
      onClick={startAreaMode}
      style={{ border: isAreaMode ? '2px solid yellow' : '1px solid gray' }}
    >
      Area
    </button>
  )
}

export default Area
