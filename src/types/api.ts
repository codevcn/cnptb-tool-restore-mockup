import { TPosition, TReactCSSProperties, TSizeInfo } from "./global"

export type TMockupId = string

type TLayoutType =
  | "frame-layout"
  | "full"
  | "half-width"
  | "half-height"
  | "2-horizontal-square"
  | "2-vertical-square"
  | "3-left"
  | "3-right"
  | "3-top"
  | "3-bottom"
  | "4-horizon"
  | "4-vertical"
  | "4-square"
  | "6-square"

export type TLayoutMode = "with-layout" | "no-layout" | "frame-layout"

type TLayoutPlacedImage = {
  id: string
  url: string
  initialWidth: number
  initialHeight: number
  isOriginalFrameImage?: boolean
}

type TLayoutSlotConfig = {
  id: string
  containerWidth: number // Tỷ lệ width của slot so với print area (0-1)
  containerHeight: number // Tỷ lệ height của slot so với print area (0-1)
  style: TReactCSSProperties
  placedImage?: TLayoutPlacedImage
}

export type TPrintLayout = {
  id: string
  name: string
  layoutType: TLayoutType
  printedImageElements: TPrintedImageVisualState[]
  slotConfigs: TLayoutSlotConfig[]
  layoutContainerConfigs: {
    style: TReactCSSProperties
  }
  mountType?: "suggested" | "picked"
}

type TElementMountType = "from-new" | "from-saved" | "from-template" | "from-layout"

type TMatchOrientation = "width" | "height"

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
  mountType: TElementMountType
  matchOrientation: TMatchOrientation
}>

export type TTextVisualState = TElementVisualBaseState & {
  id: string
  textColor: string
  content: string
  fontFamily: string
  fontWeight: number
} & Partial<{
    fontSize: number
    dimensionOnCollect: TSizeInfo
  }>

export type TStickerVisualState = TElementVisualBaseState & {
  id: string
  path: string
} & Partial<{
    grayscale: number // 0-100 percentage
  }>

export type TPrintedImageVisualState = TStickerVisualState &
  Partial<{
    isInitWithLayout: boolean
  }>

export type TLayoutSlotForCanvas = TRect & {
  slotId: string
  placedImage: {
    imageURL: string
    isOriginalFrameImage?: boolean
  }
}

// ============================================
// PRODUCT INFO (Optional - for reference)
// ============================================

type TProductInfo = {
  id: number | string
  name?: string
  variantId?: number | string
  surfaceId?: number | string
  mockup: {
    id: number | string
    imageURL: string
  }
}

export type TRect = TPosition & TSizeInfo

export type TPrintAreaContainerWrapper = {
  width: number // in pixels
  height: number // in pixels
  x: number // in pixels
  y: number // in pixels
  borderWidth: string // in pixels
}

export type TAllowedPrintArea = {
  width: number // in pixels
  height: number // in pixels
  x: number // in pixels
  y: number // in pixels
  borderWidth: string // in pixels
}

// ============================================
// MAIN SCHEMA
// ============================================

export type TRestoreMockupBodySchema = {
  /**
   * Tỷ lệ pixel của thiết bị (devicePixelRatio) - REQUIRED
   */
  devicePixelRatio: number

  /**
   * ID của mockup đang được restore - REQUIRED
   */
  mockupId: TMockupId

  /**
   * Thông tin về print area container wrapper - REQUIRED
   */
  printAreaContainerWrapper: TPrintAreaContainerWrapper

  /**
   * Cấu hình print area - REQUIRED
   * Xác định kích thước canvas và vùng in
   */
  allowedPrintArea: TAllowedPrintArea

  /**
   * Thông tin sản phẩm (optional - để reference/logging)
   */
  product: TProductInfo

  /**
   * Layout mode và config
   */
  layoutMode: TLayoutMode

  /**
   * Layout config (required nếu layoutMode !== 'no-layout')
   */
  layout?: TPrintLayout | null

  layoutSlotsForCanvas: TLayoutSlotForCanvas[]
  layoutSlotBorderWidth: string // in pixels

  /**
   * Danh sách elements - REQUIRED
   * Bao gồm printed-image, sticker, text
   * Nên được sort theo zindex trước khi gửi
   */
  printedImageElements?: TPrintedImageVisualState[]
  stickerElements?: TStickerVisualState[]
  textElements?: TTextVisualState[]

  /**
   * Metadata (optional - for tracking/debugging)
   */
  metadata?: {
    sessionId?: string
  }
}
