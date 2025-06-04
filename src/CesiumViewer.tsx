import { useEffect, useRef } from 'react'
import { Viewer } from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

const CesiumViewer = () => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      const viewer = new Viewer(containerRef.current)
      return () => viewer.destroy()
    }
  }, [])

  return <div ref={containerRef} style={{ height: '100vh', width: '100%' }} />
}

export default CesiumViewer
