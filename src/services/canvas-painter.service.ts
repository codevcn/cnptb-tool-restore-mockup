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
  TRect,
  TLayoutSlotForCanvas,
} from "../types/api"
import { TMulterFiles } from "../types/global"
import { domains } from "../configs/contants"
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

    // 1. Create base canvas
    const canvas = createCanvas(
      printAreaContainerWrapper.width * this.CANVAS_SCALE_FACTOR,
      printAreaContainerWrapper.height * this.CANVAS_SCALE_FACTOR
    )
    const ctx = canvas.getContext("2d")
    ctx.imageSmoothingEnabled = true
    ctx.save()
    console.log(
      `>>> [canvas] Canvas created: ${printAreaContainerWrapper.width * this.CANVAS_SCALE_FACTOR}x${
        printAreaContainerWrapper.height * this.CANVAS_SCALE_FACTOR
      }`
    )

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

      // 3. Draw layout slots if exists
      if (layoutMode !== "no-layout" && layout) {
        await this.drawLayoutSlots(
          layout,
          data.layoutSlotsForCanvas,
          allowedPrintArea,
          printAreaContainerWrapper,
          savedBlobFiles,
          imageCache,
          canvas,
          ctx
        )
        console.log(`>>> [canvas] Layout slots drawn`)
      }

      // 4. Collect and sort all elements by zindex
      const allElements: TSingleElementInAll[] = []
      if (printedImageElements) {
        printedImageElements.forEach((el) =>
          allElements.push({ type: "printed-image", element: el })
        )
      }
      if (stickerElements) {
        stickerElements.forEach((el) => allElements.push({ type: "sticker", element: el }))
      }
      // if (textElements) {
      //   textElements.forEach((el) => allElements.push({ type: "text", element: el }))
      // }
      // Sort by zindex
      allElements.sort((a, b) => a.element.zindex - b.element.zindex)

      // 5. Draw all elements in order
      for (const { type, element } of allElements) {
        try {
          if (type === "printed-image") {
            await this.drawPrintedImageElement(
              element as TPrintedImageVisualState,
              savedBlobFiles,
              imageCache,
              canvas,
              ctx
            )
          } else if (type === "sticker") {
            await this.drawStickerElement(
              element as TStickerVisualState,
              savedBlobFiles,
              imageCache,
              canvas,
              ctx
            )
          }
          // else if (type === "text") {
          //   await this.drawTextElement(element as TTextVisualState)
          // }
        } catch (error) {
          console.error(`>>> [canvas] [error] Failed to draw ${type} element:`, error)
          console.error(
            `>>> [canvas] [trace] Failed to draw ${type} element:`,
            (error as Error).stack
          )
        }
      }
      console.log(`>>> [canvas] Drew ${allElements.length} elements`)

      // 6. Draw allowed print area outline
      this.drawOutline(allowedPrintArea, printAreaContainerWrapper, canvas, ctx)

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
    canvas?: Canvas,
    ctx?: CanvasRenderingContext2D
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
    canvas?: Canvas,
    ctx?: CanvasRenderingContext2D
  ): Promise<void> {
    if (!canvas || !ctx || !layout.slotConfigs || layout.slotConfigs.length === 0) return

    const offsetX = (allowedPrintArea.x - wrapper.x) * this.CANVAS_SCALE_FACTOR
    const offsetY = (allowedPrintArea.y - wrapper.y) * this.CANVAS_SCALE_FACTOR

    for (const slot of layoutSlotsForCanvas) {
      const { placedImage, height, width, x, y } = slot
      try {
        const image = await this.loadImage(placedImage.imageURL, files, imageCache)

        // Parse slot dimensions
        const slotWidth =
          this.parseStyleValue(width, allowedPrintArea.width) * this.CANVAS_SCALE_FACTOR
        const slotHeight =
          this.parseStyleValue(height, allowedPrintArea.height) * this.CANVAS_SCALE_FACTOR
        const slotLeft =
          this.parseStyleValue(x - allowedPrintArea.x, allowedPrintArea.width) *
          this.CANVAS_SCALE_FACTOR
        const slotTop =
          this.parseStyleValue(y - allowedPrintArea.y, allowedPrintArea.height) *
          this.CANVAS_SCALE_FACTOR

        // Calculate draw dimensions based on fit mode
        let drawWidth = slotWidth
        let drawHeight = slotHeight
        let drawX = offsetX + slotLeft
        let drawY = offsetY + slotTop

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
    canvas?: Canvas,
    ctx?: CanvasRenderingContext2D
  ): Promise<void> {
    if (!ctx) return

    const image = await this.loadImage(element.path, files, imageCache)

    // Save context state
    ctx.save()

    // Calculate dimensions
    const width = (element.width || image.width) * this.CANVAS_SCALE_FACTOR
    const height = (element.height || image.height) * this.CANVAS_SCALE_FACTOR
    const scale = element.scale || 1
    const angle = element.angle || 0

    // Move to element position (center point for rotation)
    const centerX = (element.position.x + (width * scale) / 2) * this.CANVAS_SCALE_FACTOR
    const centerY = (element.position.y + (height * scale) / 2) * this.CANVAS_SCALE_FACTOR

    ctx.translate(centerX, centerY)
    ctx.rotate((angle * Math.PI) / 180)
    ctx.scale(scale, scale)

    // // Apply grayscale filter if needed
    // if (element.grayscale && element.grayscale > 0) {
    //   ;(ctx as any).filter = `grayscale(${element.grayscale})`
    // }

    // // Apply clip path if exists
    // if (element.clippath && element.clippath.type === "circle") {
    //   const radius = Math.min(width, height) / 2
    //   ctx.beginPath()
    //   ctx.arc(0, 0, radius, 0, Math.PI * 2)
    //   ctx.clip()
    // }

    // Draw image (centered at origin due to transforms)
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
    canvas?: Canvas,
    ctx?: CanvasRenderingContext2D
  ): Promise<void> {
    if (!ctx) return

    // Fetch sticker from domain
    const stickerUrl = this.toStoredURL(element.path, files, true)

    const image = await this.loadImage(stickerUrl, files, imageCache)

    // Save context state
    ctx.save()

    // Calculate dimensions
    const width = (element.width || image.width) * this.CANVAS_SCALE_FACTOR
    const height = (element.height || image.height) * this.CANVAS_SCALE_FACTOR
    const scale = element.scale || 1
    const angle = element.angle || 0

    // Move to element position
    const centerX = (element.position.x + (width * scale) / 2) * this.CANVAS_SCALE_FACTOR
    const centerY = (element.position.y + (height * scale) / 2) * this.CANVAS_SCALE_FACTOR

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
    canvas?: Canvas,
    ctx?: CanvasRenderingContext2D
  ): Promise<void> {
    if (!ctx) return

    // Save context state
    ctx.save()

    // Calculate dimensions
    const scale = element.scale || 1
    const angle = element.angle || 0
    const fontSize = element.fontSize || 16

    // Move to element position
    ctx.translate(element.position.x, element.position.y)
    ctx.rotate((angle * Math.PI) / 180)
    ctx.scale(scale, scale)

    // Set text properties
    const fontWeight = element.fontWeight || "normal"
    const fontFamily = element.fontFamily || "Arial"
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`
    ctx.fillStyle = element.textColor || "#000000"
    ctx.textBaseline = "top"

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
    canvas?: Canvas,
    ctx?: CanvasRenderingContext2D
  ): void {
    if (!ctx) return

    const offsetX = printArea.x - wrapper.x
    const offsetY = printArea.y - wrapper.y

    ctx.save()
    ctx.strokeStyle = "#3b82f6"
    ctx.lineWidth = 1.5
    ctx.setLineDash([5, 5])
    ctx.strokeRect(offsetX, offsetY, printArea.width, printArea.height)
    ctx.restore()
  }

  /**
   * Export canvas to PNG file
   */
  private async exportCanvas(
    mockupId: string,
    canvas?: Canvas,
    ctx?: CanvasRenderingContext2D
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
    }
    // Handle local paths
    else {
      imagePath = path.resolve(url)
    }

    // Load image using node-canvas
    const image = await loadImage(imagePath)

    // Cache it
    imageCache.set(url, image)

    return image
  }

  /**
   * Download remote image
   */
  private async downloadRemoteImage(url: string): Promise<Buffer> {
    console.log(`>>> [canvas] Downloading image: ${url}`)
    const response = await axios.get(url, { responseType: "arraybuffer" })
    return Buffer.from(response.data)
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
