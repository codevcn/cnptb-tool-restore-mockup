import { createCanvas, loadImage, Canvas, CanvasRenderingContext2D, Image } from "canvas"
import sharp from "sharp"
import axios from "axios"
import {
  TRestoreMockupBodySchema,
  TPrintedImageVisualState,
  TStickerVisualState,
  TTextVisualState,
  TPrintLayout,
  TAllowedPrintArea,
  TPrintAreaContainerWrapper,
  TLayoutSlotForCanvas,
} from "../types/api"
import { TMulterFiles } from "../types/global"
import { domains, elementDefaultStyles } from "../configs/contants"
import path from "path"
import fs from "fs"
import { mkdir, writeFile } from "fs/promises"
import { generateFullBlobFilePathByDate } from "../utils/helpers"

type TSingleElementInAll = {
  type: "printed-image" | "sticker" | "text"
  element: TPrintedImageVisualState | TStickerVisualState | TTextVisualState
}

class CanvasPainterService {
  private readonly CANVAS_SCALE_FACTOR: number = 8

  constructor() {}

  /**
   * Main method: Paint mockup to canvas and export PNG
   */
  async paintMockupToCanvas(
    data: TRestoreMockupBodySchema,
    savedBlobFiles: TMulterFiles
  ): Promise<string> {
    console.log(">>> [canvas] Starting canvas painting with node-canvas...")

    const {
      printAreaContainerWrapper,
      product,
      allowedPrintArea,
      printedImageElements,
      stickerElements,
      textElements,
      layout,
      layoutMode,
    } = data

    const canvasScaleFactor = this.CANVAS_SCALE_FACTOR
    const viewportRatio = printAreaContainerWrapper.width / printAreaContainerWrapper.height
    const viewportWidth = printAreaContainerWrapper.width * canvasScaleFactor
    const viewportHeight = viewportWidth / viewportRatio
    const viewportWidthRatio = viewportWidth / printAreaContainerWrapper.width
    const viewportHeightRatio = viewportHeight / printAreaContainerWrapper.height
    const viewport = {
      width: viewportWidth,
      height: viewportHeight,
    }

    // 1. Create base canvas
    const canvas = createCanvas(viewport.width, viewport.height)
    const ctx = canvas.getContext("2d")
    ctx.imageSmoothingEnabled = true
    ctx.save()
    console.log(`>>> [canvas] Canvas created: ${viewport.width}x${viewport.height}`)

    const imageCache = new Map<string, Image>()

    try {
      // 2. Draw background image if exists
      await this.drawBackgroundImage(
        product.mockup.imageURL,
        savedBlobFiles,
        imageCache,
        canvas,
        ctx
      )
      console.log(">>> [canvas] Background image drawn")

      // 3. Draw allowed print area outline
      this.drawOutline(
        allowedPrintArea,
        printAreaContainerWrapper,
        canvas,
        ctx,
        viewportWidthRatio,
        viewportHeightRatio
      )

      // 4. Draw layout slots if exists
      if (layoutMode !== "no-layout" && layout) {
        await this.drawLayoutSlots(
          layout,
          data.layoutSlotsForCanvas,
          allowedPrintArea,
          printAreaContainerWrapper,
          savedBlobFiles,
          imageCache,
          canvas,
          ctx,
          viewportWidthRatio,
          viewportHeightRatio
        )
        console.log(`>>> [canvas] Layout slots drawn`)
      }

      // 5. Collect and sort all elements by zindex
      const allElements: TSingleElementInAll[] = []
      if (printedImageElements) {
        for (const el of printedImageElements) {
          allElements.push({ type: "printed-image", element: el })
        }
      }
      if (stickerElements) {
        for (const el of stickerElements) {
          allElements.push({ type: "sticker", element: el })
        }
      }
      if (textElements) {
        for (const el of textElements) {
          allElements.push({ type: "text", element: el })
        }
      }
      // Sort by zindex
      allElements.sort((a, b) => a.element.zindex - b.element.zindex)

      // 6. Draw all elements in order
      for (const { type, element } of allElements) {
        try {
          if (type === "printed-image") {
            await this.drawPrintedImageElement(
              element as TPrintedImageVisualState,
              savedBlobFiles,
              imageCache,
              canvas,
              ctx,
              viewportWidthRatio,
              viewportHeightRatio
            )
          } else if (type === "sticker") {
            await this.drawStickerElement(
              element as TStickerVisualState,
              savedBlobFiles,
              imageCache,
              canvas,
              ctx,
              viewportWidthRatio,
              viewportHeightRatio
            )
          } else if (type === "text") {
            await this.drawTextElement(
              element as TTextVisualState,
              canvas,
              ctx,
              viewportWidthRatio,
              viewportHeightRatio
            )
          }
        } catch (error) {
          console.error(`>>> [canvas] [error] Failed to draw ${type} element:`, error)
          console.error(
            `>>> [canvas] [trace] Failed to draw ${type} element:`,
            (error as Error).stack
          )
        }
      }
      console.log(`>>> [canvas] Drew ${allElements.length} elements`)

      imageCache.clear()

      // 7. Export to file
      const outputPath = await this.exportCanvas(data.mockupId, canvas, ctx)

      return outputPath
    } catch (error) {
      console.error("❌ [canvas] Error during canvas painting:", error)
      throw error
    } finally {
    }
  }

  private toStoredURL(url: string, files: TMulterFiles, isSticker?: boolean): string {
    if (url.startsWith("blob:")) {
      const pathname = path.basename(url).slice(1) // remove leading '/'
      const file = files.find((f) => f.originalname.includes(pathname))
      if (file) return generateFullBlobFilePathByDate(file.originalname)
    } else if (isSticker) {
      return `${domains.fetchStickerDomain}${url}`
    }
    return url
  }

  /**
   * Draw background image
   */
  private async drawBackgroundImage(
    imageUrl: string,
    files: TMulterFiles,
    imageCache: Map<string, Image>,
    canvas: Canvas,
    ctx: CanvasRenderingContext2D
  ): Promise<void> {
    if (!ctx || !canvas) return

    const image = await this.loadImage(imageUrl, files, imageCache)

    // Draw image to fill canvas (contain mode)
    const canvasAspect = canvas.width / canvas.height
    const imageAspect = image.width / image.height

    let drawWidth = canvas.width
    let drawHeight = canvas.height
    let offsetX = 0
    let offsetY = 0

    if (imageAspect > canvasAspect) {
      // Image is wider
      drawHeight = canvas.width / imageAspect
      offsetY = (canvas.height - drawHeight) / 2
    } else {
      // Image is taller
      drawWidth = canvas.height * imageAspect
      offsetX = (canvas.width - drawWidth) / 2
    }

    ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight)
  }

  /**
   * Draw layout slots
   */
  private async drawLayoutSlots(
    layout: TPrintLayout,
    layoutSlotsForCanvas: TLayoutSlotForCanvas[],
    allowedPrintArea: TAllowedPrintArea,
    wrapper: TPrintAreaContainerWrapper,
    files: TMulterFiles,
    imageCache: Map<string, Image>,
    canvas: Canvas,
    ctx: CanvasRenderingContext2D,
    viewportWidthRatio: number,
    viewportHeightRatio: number
  ): Promise<void> {
    if (!canvas || !ctx || !layout.slotConfigs || layout.slotConfigs.length === 0) return
    const offsetX = (allowedPrintArea.x - wrapper.x) * viewportWidthRatio
    const offsetY = (allowedPrintArea.y - wrapper.y) * viewportHeightRatio

    for (const slot of layoutSlotsForCanvas) {
      const { placedImage, height, width, x, y } = slot
      console.log(">>> [canvas] draw slot:", slot)
      try {
        const image = await this.loadImage(placedImage.imageURL, files, imageCache)

        // Parse slot dimensions
        const slotWidth = this.parseStyleValue(width - 0.8 * 2, wrapper.width) * viewportWidthRatio
        const slotHeight =
          this.parseStyleValue(height - 0.8 * 2, wrapper.height) * viewportHeightRatio
        const slotLeft =
          this.parseStyleValue(x - wrapper.x + 0.8, wrapper.width) * viewportWidthRatio
        const slotTop =
          this.parseStyleValue(y - wrapper.y + 0.8, wrapper.height) * viewportHeightRatio
        console.log(">>> [canvas] draw slots calcu:", {
          left: x - wrapper.x + 0.8,
          top: y - wrapper.y + 0.8,
        })

        // Calculate draw dimensions based on fit mode
        let drawWidth = slotWidth
        let drawHeight = slotHeight
        let drawX = slotLeft
        let drawY = slotTop
        console.log(">>> [canvas] draw slots draw data:", { drawX, drawY })

        if (placedImage.isOriginalFrameImage) {
          // Contain mode
          const slotAspect = slotWidth / slotHeight
          const imageAspect = image.width / image.height

          if (imageAspect > slotAspect) {
            drawHeight = drawWidth / imageAspect
            drawY += (slotHeight - drawHeight) / 2
          } else {
            drawWidth = drawHeight * imageAspect
            drawX += (slotWidth - drawWidth) / 2
          }
        }

        ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight)
      } catch (error) {
        console.warn(`>>> [canvas] Failed to draw slot ${slot.slotId}:`, error)
      }
    }
  }

  /**
   * Draw printed image element
   */
  private async drawPrintedImageElement(
    element: TPrintedImageVisualState,
    files: TMulterFiles,
    imageCache: Map<string, Image>,
    canvas: Canvas,
    ctx: CanvasRenderingContext2D,
    viewportWidthRatio: number,
    viewportHeightRatio: number
  ): Promise<void> {
    if (!ctx) return
    console.log(">>> [canvas] printed image element:", element)

    // Fetch sticker from domain
    const printedImageUrl = this.toStoredURL(element.path, files, true)

    const image = await this.loadImage(printedImageUrl, files, imageCache)

    // Save context state
    ctx.save()

    // Calculate dimensions
    const width = (element.width || image.width) * viewportWidthRatio
    const height = (element.height || image.height) * viewportHeightRatio
    const scale = element.scale || 1
    const angle = element.angle || 0

    // Move to element position center
    const centerX = element.position.x * viewportWidthRatio + width / 2
    const centerY = element.position.y * viewportHeightRatio + height / 2

    ctx.translate(centerX, centerY)
    ctx.rotate((angle * Math.PI) / 180)
    ctx.scale(scale, scale)

    // // Apply grayscale if needed
    // if (element.grayscale && element.grayscale > 0) {
    //   ;(ctx as any).filter = `grayscale(${element.grayscale})`
    // }

    // Draw sticker
    ctx.drawImage(image, -width / 2, -height / 2, width, height)

    // Restore context
    ctx.restore()
  }

  /**
   * Draw sticker element
   */
  private async drawStickerElement(
    element: TStickerVisualState,
    files: TMulterFiles,
    imageCache: Map<string, Image>,
    canvas: Canvas,
    ctx: CanvasRenderingContext2D,
    viewportWidthRatio: number,
    viewportHeightRatio: number
  ): Promise<void> {
    if (!ctx) return
    console.log(">>> [canvas] sticker element:", element)

    // Fetch sticker from domain
    const stickerUrl = this.toStoredURL(element.path, files, true)

    const image = await this.loadImage(stickerUrl, files, imageCache)

    // Save context state
    ctx.save()

    // Calculate dimensions
    const width = (element.width || image.width) * viewportWidthRatio
    const height = (element.height || image.height) * viewportHeightRatio
    const scale = element.scale || 1
    const angle = element.angle || 0

    // Move to element position center
    const centerX = element.position.x * viewportWidthRatio + width / 2
    const centerY = element.position.y * viewportHeightRatio + height / 2

    ctx.translate(centerX, centerY)
    ctx.rotate((angle * Math.PI) / 180)
    ctx.scale(scale, scale)

    // // Apply grayscale if needed
    // if (element.grayscale && element.grayscale > 0) {
    //   ;(ctx as any).filter = `grayscale(${element.grayscale})`
    // }

    // Draw sticker
    ctx.drawImage(image, -width / 2, -height / 2, width, height)

    // Restore context
    ctx.restore()
  }

  /**
   * Draw text element
   */
  private async drawTextElement(
    element: TTextVisualState,
    canvas: Canvas,
    ctx: CanvasRenderingContext2D,
    viewportWidthRatio: number,
    viewportHeightRatio: number
  ): Promise<void> {
    console.log(">>> [canvas] text element:", element)
    if (!ctx) return
    const { dimensionOnCollect } = element
    if (!dimensionOnCollect) {
      throw new Error("Field dimensionOnCollect is required for text element")
    }
    // Save context state
    ctx.save()

    // Set text properties
    const fontSize = element.fontSize || elementDefaultStyles.text.fontSize
    const fontWeight = element.fontWeight || 400
    const fontFamily = element.fontFamily || "Arial"
    ctx.font = `${fontWeight} ${fontSize * viewportHeightRatio}px ${fontFamily}`
    ctx.fillStyle = element.textColor || "#000000"
    ctx.textBaseline = "middle" // Align "start point to draw text" to center
    ctx.textAlign = "center"

    const scale = element.scale || 1
    const angle = element.angle || 0

    // Move to element position top-left
    const widthAfterScaleCanvas = dimensionOnCollect.offsetWidth * viewportWidthRatio
    const heightAfterScaleCanvas = dimensionOnCollect.offsetHeight * viewportHeightRatio
    const posXAfterScaleCanvas = element.position.x * viewportWidthRatio
    const posYAfterScaleCanvas = element.position.y * viewportHeightRatio
    const centerX = posXAfterScaleCanvas + widthAfterScaleCanvas / 2
    const centerY = posYAfterScaleCanvas + heightAfterScaleCanvas / 2

    ctx.translate(centerX, centerY)
    ctx.scale(scale, scale)
    ctx.rotate((angle * Math.PI) / 180)

    // Draw text
    ctx.fillText(element.content, 0, 0)

    // Restore context
    ctx.restore()
  }

  /**
   * Draw outline for allowed print area (dashed border)
   */
  private drawOutline(
    printArea: TAllowedPrintArea,
    wrapper: TPrintAreaContainerWrapper,
    canvas: Canvas,
    ctx: CanvasRenderingContext2D,
    viewportWidthRatio: number,
    viewportHeightRatio: number
  ): void {
    if (!ctx) return

    const offsetX = (printArea.x - wrapper.x) * viewportWidthRatio
    const offsetY = (printArea.y - wrapper.y) * viewportHeightRatio

    ctx.save()
    ctx.strokeStyle = "#3b82f6"
    ctx.lineWidth = 1.5
    ctx.setLineDash([5, 5])
    ctx.strokeRect(
      offsetX,
      offsetY,
      printArea.width * viewportWidthRatio,
      printArea.height * viewportHeightRatio
    )
    ctx.restore()
  }

  /**
   * Export canvas to PNG file
   */
  private async exportCanvas(
    mockupId: string,
    canvas: Canvas,
    ctx: CanvasRenderingContext2D
  ): Promise<string> {
    if (!canvas) throw new Error("Canvas not initialized")

    const canvasDir = path.resolve("storage/canvas")
    await mkdir(canvasDir, { recursive: true })

    const filename = `mockup_${mockupId}.png`
    const outputPath = path.join(canvasDir, filename)

    // Get canvas buffer
    const buffer = canvas.toBuffer("image/png")

    // Use Sharp for optimization (optional)
    await sharp(buffer)
      .png({
        compressionLevel: 9,
        palette: false,
      })
      .toFile(outputPath)

    return outputPath
  }

  /**
   * Load image from URL or local file
   */
  private async loadImage(
    url: string,
    files: TMulterFiles,
    imageCache: Map<string, Image>
  ): Promise<Image> {
    // Check cache
    if (imageCache.has(url)) {
      return imageCache.get(url)!
    }

    let imagePath: string

    try {
      // Handle blob URLs (uploaded files)
      if (url.startsWith("blob:")) {
        const pathname = path.basename(url).slice(1)
        const file = files.find((f) => f.originalname.includes(pathname))
        if (!file) {
          throw new Error(`File not found for blob URL: ${url}`)
        }
        imagePath = file.path
      }
      // Handle HTTP URLs
      else if (url.startsWith("http://") || url.startsWith("https://")) {
        // Download to temp
        const buffer = await this.downloadRemoteImage(url)
        const tempPath = path.join("storage/temp", `temp_${Date.now()}_${path.basename(url)}`)
        await mkdir(path.dirname(tempPath), { recursive: true })
        await writeFile(tempPath, buffer)
        imagePath = tempPath
        console.log(`>>> [canvas] Saved temp file: ${tempPath} (${buffer.length} bytes)`)
      }
      // Handle local paths
      else {
        imagePath = path.resolve(url)
      }

      // Check if file exists
      if (!fs.existsSync(imagePath)) {
        throw new Error(`Image file does not exist: ${imagePath}`)
      }

      // Convert unsupported formats (WebP, AVIF) to PNG using Sharp
      const convertedPath = await this.convertToSupportedFormat(imagePath)

      // Load image using node-canvas
      const image = await loadImage(convertedPath)

      // Cache it
      imageCache.set(url, image)

      return image
    } catch (error) {
      console.error(`>>> [canvas] Failed to load image from: ${url}`)
      console.error(`>>> [canvas] Error details:`, error)
      throw error
    }
  }

  /**
   * Download remote image
   */
  private async downloadRemoteImage(url: string): Promise<Buffer> {
    console.log(`>>> [canvas] Downloading image: ${url}`)
    const response = await axios.get(url, { responseType: "arraybuffer" })

    // Check content type
    const contentType = response.headers["content-type"] || ""
    console.log(`>>> [canvas] Response content-type: ${contentType}`)

    if (!contentType.startsWith("image/")) {
      console.error(`>>> [canvas] Invalid content-type: ${contentType}`)
      console.error(`>>> [canvas] Response data preview: ${response.data.toString().slice(0, 200)}`)
      throw new Error(
        `Invalid image content-type: ${contentType}. Expected image/* but got ${contentType}`
      )
    }

    const buffer = Buffer.from(response.data)

    // Check file signature (magic bytes)
    if (buffer.length < 4) {
      throw new Error(`Downloaded file too small: ${buffer.length} bytes`)
    }

    const signature = buffer.toString("hex", 0, 4)
    console.log(`>>> [canvas] File signature: ${signature}`)

    return buffer
  }

  /**
   * Convert unsupported image formats (WebP, AVIF, SVG) to PNG
   */
  private async convertToSupportedFormat(imagePath: string): Promise<string> {
    // Detect format by reading file signature
    const fileBuffer = await fs.promises.readFile(imagePath)
    const signature = fileBuffer.toString("hex", 0, 4)

    // Check if conversion is needed
    const needsConversion =
      signature === "52494646" || // WebP (RIFF)
      signature.startsWith("0000001") || // AVIF
      signature === "3c3f786d" || // SVG (<?xml)
      signature === "3c737667" // SVG (<svg)

    if (!needsConversion) {
      // PNG (89504e47), JPEG (ffd8ffe0/ffd8ffe1), GIF (47494638) are supported
      console.log(`>>> [canvas] Format supported, using original: ${imagePath}`)
      return imagePath
    }

    // Convert to PNG
    console.log(`>>> [canvas] Converting unsupported format (${signature}) to PNG...`)
    const convertedPath = imagePath.replace(/\.[^.]+$/, "_converted.png")

    await sharp(imagePath).png().toFile(convertedPath)

    console.log(`>>> [canvas] Converted to: ${convertedPath}`)
    return convertedPath
  }

  /**
   * Parse CSS style value (e.g., "50px", "50%")
   */
  private parseStyleValue(value: string | number | undefined, baseValue: number): number {
    if (typeof value === "number") return value
    if (!value) return 0

    if (typeof value === "string") {
      if (value.endsWith("px")) {
        return parseFloat(value)
      }
      if (value.endsWith("%")) {
        return (parseFloat(value) / 100) * baseValue
      }
      return parseFloat(value) || 0
    }

    return 0
  }

  /**
   * Clear image cache
   */
  clearCache(imageCache: Map<string, Image>): void {
    imageCache.clear()
  }
}

export const canvasPainterService = new CanvasPainterService()
