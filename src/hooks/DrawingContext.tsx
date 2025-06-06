import {
  createContext,
  useContext,
  useRef,
  useCallback,
  type ReactNode,
} from 'react'
import { Viewer, Cartesian3 } from 'cesium'
import type { AnchorEntity, LineEntity, AreaEntity } from '../entityTypes'
import { useDrawingEntities } from './useDrawingEntities'

export interface DrawingContextType {
  anchorsRef: React.MutableRefObject<AnchorEntity[]>
  linesRef: React.MutableRefObject<LineEntity[]>
  selectedLineRef: React.MutableRefObject<LineEntity | null>
  selectedAnchorRef: React.MutableRefObject<AnchorEntity | null>
  selectedAreaRef: React.MutableRefObject<AreaEntity | null>
  highlightLine: (line: LineEntity) => void
  unhighlightLine: (line: LineEntity) => void
  highlightAnchor: (anchor: AnchorEntity) => void
  unhighlightAnchor: (anchor: AnchorEntity) => void
  addAnchor: (position: Cartesian3) => AnchorEntity | null
  removeLine: (line: LineEntity) => void
  removeAnchor: (anchor: AnchorEntity) => void
  showAxisHelper: (area: AreaEntity) => void
  removeAxisHelper: () => void
  setAxisHelperCallbacks: (cbs: {
    show: (area: AreaEntity) => void
    remove: () => void
  }) => void
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

  const selectedLineRef = useRef<LineEntity | null>(null)
  const selectedAnchorRef = useRef<AnchorEntity | null>(null)
  const selectedAreaRef = useRef<AreaEntity | null>(null)
  const showAxisHelperRef = useRef<(area: AreaEntity) => void>(() => {})
  const removeAxisHelperRef = useRef<() => void>(() => {})

  const setAxisHelperCallbacks = useCallback(
    (cbs: { show: (area: AreaEntity) => void; remove: () => void }) => {
      showAxisHelperRef.current = cbs.show
      removeAxisHelperRef.current = cbs.remove
    },
    [],
  )

  const showAxisHelper = useCallback((area: AreaEntity) => {
    showAxisHelperRef.current(area)
  }, [])

  const removeAxisHelper = useCallback(() => {
    removeAxisHelperRef.current()
  }, [])

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
        showAxisHelper,
        removeAxisHelper,
        setAxisHelperCallbacks,
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
