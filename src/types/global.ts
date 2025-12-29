export type TMockupRequest = {
  imageUrl: string
  mockupType?: string
}

export type TMockupResponse = {
  success: boolean
  restoredImageUrl?: string
  error?: string
}

export type TMockupConfig = {
  width: number
  height: number
  quality: number
}

export type TReactCSSProperties = {
  [key: string]: string | number | undefined
}

export type TElementVisualBaseState = {
  position: {
    x: number
    y: number
  }
  scale: number
  angle: number
  zindex: number
} & Partial<{
  height: number
  width: number
  clippath: string
}>

export type TBrowserViewport = {
  width: number
  height: number
}

export type TMulterFiles = Express.Multer.File[]

export type TSizeInfo = {
  height: number
  width: number
}

export type TPosition = {
  x: number
  y: number
}
