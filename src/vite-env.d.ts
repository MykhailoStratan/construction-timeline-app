/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CESIUM_ION_ACCESS_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare const Cesium: typeof import('cesium')
