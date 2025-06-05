import {
  createContext,
  useContext,
  useRef,
  type ReactNode,
} from 'react'
import { Viewer, Entity, Cartesian3 } from 'cesium'
import { useDrawingEntities } from './useDrawingEntities'

export interface DrawingContextType {
  anchorsRef: React.MutableRefObject<Entity[]>
  linesRef: React.MutableRefObject<Entity[]>
  selectedLineRef: React.MutableRefObject<Entity | null>
  selectedAnchorRef: React.MutableRefObject<Entity | null>
  selectedAreaRef: React.MutableRefObject<Entity | null>
  highlightLine: (line: Entity) => void
  unhighlightLine: (line: Entity) => void
  highlightAnchor: (anchor: Entity) => void
  unhighlightAnchor: (anchor: Entity) => void
  addAnchor: (position: Cartesian3) => Entity | null
  removeLine: (line: Entity) => void
  removeAnchor: (anchor: Entity) => void
}

interface DrawingProviderProps {
  viewer: Viewer | null
  children: ReactNode
}

const DrawingContext = createContext<DrawingContextType | null>(null)

export const DrawingProvider = ({ viewer, children }: DrawingProviderProps) => {
  const {
    anchorsRef,
    linesRef,
    highlightLine,
    unhighlightLine,
    highlightAnchor,
    unhighlightAnchor,
    addAnchor,
    removeLine,
    removeAnchor,
  } = useDrawingEntities(viewer)

  const selectedLineRef = useRef<Entity | null>(null)
  const selectedAnchorRef = useRef<Entity | null>(null)
  const selectedAreaRef = useRef<Entity | null>(null)

  return (
    <DrawingContext.Provider
      value={{
        anchorsRef,
        linesRef,
        selectedLineRef,
        selectedAnchorRef,
        selectedAreaRef,
        highlightLine,
        unhighlightLine,
        highlightAnchor,
        unhighlightAnchor,
        addAnchor,
        removeLine,
        removeAnchor,
      }}
    >
      {children}
    </DrawingContext.Provider>
  )
}

export const useDrawing = () => {
  const ctx = useContext(DrawingContext)
  if (!ctx) {
    throw new Error('useDrawing must be used within DrawingProvider')
  }
  return ctx
}
