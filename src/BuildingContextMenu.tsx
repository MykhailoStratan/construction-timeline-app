import type { CSSProperties } from 'react'

interface BuildingContextMenuProps {
  x: number
  y: number
  onHide: () => void
}

const menuStyle: CSSProperties = {
  position: 'absolute',
  backgroundColor: 'white',
  color: 'black',
  padding: '4px',
  border: '1px solid gray',
  zIndex: 1000,
}

const BuildingContextMenu = ({ x, y, onHide }: BuildingContextMenuProps) => {
  return (
    <div
      style={{ ...menuStyle, left: x, top: y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button onClick={onHide}>Hide</button>
    </div>
  )
}

export default BuildingContextMenu
