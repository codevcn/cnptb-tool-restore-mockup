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
import { mockupStoredFilesManager } from "../configs/mockup-stored-files-manager"

type TStoredMediaFiles = TMulterFiles

type TSingleElementInAll = {
  type: "printed-image" | "sticker" | "text"
  element: TPrintedImageVisualState | TStickerVisualState | TTextVisualState
}

class CanvasPainterService {
  private readonly CANVAS_OUTPUT_WIDTH: number = 3840 // pixels (4K)

  constructor() {}

  /**
   * Main method: Paint mockup to canvas and export PNG
   */
  async generateMockupImage(
    data: TRestoreMockupBodySchema,
    storedFiles: TStoredMediaFiles
  ): Promise<void> {
    console.log(">>> [canvas] Starting canvas painting with node-canvas...")

    const {
      printAreaContainerWrapper: originalContainer,
      product,
      allowedPrintArea,
      printedImageElements,
      stickerElements,
      textElements,
      layout,
      layoutMode,
    } = data

    // Tính toán trước khi vẽ lên canvas
    const originalRatio = originalContainer.width / originalContainer.height
    const viewportWidth = this.CANVAS_OUTPUT_WIDTH
    const viewportHeight = viewportWidth / originalRatio
    const upScale = viewportWidth / originalContainer.width

    // 1. Create base canvas
    const canvas = createCanvas(viewportWidth, viewportHeight)
    const ctx = canvas.getContext("2d")
    ctx.imageSmoothingEnabled = true
    ctx.scale(upScale, upScale)
    ctx.save()
    console.log(`>>> [canvas] Canvas created: ${viewportWidth}x${viewportHeight}`)

    const imageCache = new Map<string, Image>()

    try {
      // 2. Draw background image if exists
      await this.drawBackgroundImage(
        product.mockup.imageURL,
        storedFiles,
        imageCache,
        originalContainer,
        ctx
      )
      console.log(">>> [canvas] Background image drawn")

      // 3. Draw allowed print area outline
      this.drawAllowedPrintAreaOutline(allowedPrintArea, originalContainer, canvas, ctx)

      // 4. Draw layout slots if exists
      if (layoutMode !== "no-layout" && layout) {
        await this.drawLayoutSlots(
          layout,
          data.layoutSlotsForCanvas,
          allowedPrintArea,
          originalContainer,
          storedFiles,
          imageCache,
          canvas,
          ctx
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
        element.position.x += 0.8 // for original container border
        element.position.y += 0.8 // for original container border
        try {
          if (type === "printed-image") {
            await this.drawPrintedImageElement(
              element as TPrintedImageVisualState,
              storedFiles,
              imageCache,
              canvas,
              ctx
            )
          } else if (type === "sticker") {
            await this.drawStickerElement(
              element as TStickerVisualState,
              storedFiles,
              imageCache,
              canvas,
              ctx
            )
          } else if (type === "text") {
            await this.drawTextElement(element as TTextVisualState, canvas, ctx)
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

      this.clearCache(imageCache)

      // 7. Export to file
      await this.exportCanvas(data.mockupId, canvas)
    } catch (error) {
      console.error(">>> ❌ [canvas] Error during canvas painting:", error)
      throw error
    } finally {
      this.clearCache(imageCache)
    }
  }

  private toStoredURL(url: string, files: TMulterFiles, isSticker?: boolean): string {
    if (url.startsWith("blob:")) {
      const pathname = path.basename(url).slice(1) // remove leading '/'
      const file = files.find((f) => f.originalname.includes(pathname))
      if (file) return generateFullBlobFilePathByDate(file.originalname)
      else throw new Error(`File not found for blob URL: ${url}`) // nếu client gửi thiếu data cho blob
    } else if (isSticker) {
      return `${domains.publicAssetsEndpoint}${url}`
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
    originalContainer: TPrintAreaContainerWrapper,
    ctx: CanvasRenderingContext2D
  ): Promise<void> {
    const image = await this.loadImage(imageUrl, files, imageCache)

    // Draw image to fill canvas (contain mode)
    const originalContainerRatio = originalContainer.width / originalContainer.height
    const imageRatio = image.width / image.height

    let drawWidth = originalContainer.width
    let drawHeight = originalContainer.height
    let offsetX = 0
    let offsetY = 0

    if (imageRatio > originalContainerRatio) {
      // Image is wider
      drawHeight = originalContainer.width / imageRatio
      offsetY = (originalContainer.height - drawHeight) / 2
    } else {
      // Image is taller
      drawWidth = originalContainer.height * imageRatio
      offsetX = (originalContainer.width - drawWidth) / 2
    }

    ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight)
  }

  /**
   * Draw outline for allowed print area (dashed border)
   */
  private drawAllowedPrintAreaOutline(
    printArea: TAllowedPrintArea,
    originalContainer: TPrintAreaContainerWrapper,
    canvas: Canvas,
    ctx: CanvasRenderingContext2D
  ): void {
    if (!ctx) return

    const offsetX = printArea.x - originalContainer.x + 0.4 // vì gốc vẽ line của canvas là ở giữa line (left center CỦA LINE), nên phải cộng thêm 0.4 để line nằm trong vùng in
    const offsetY = printArea.y - originalContainer.y + 0.4 // vì gốc vẽ line của canvas là ở giữa line (top center CỦA LINE), nên phải cộng thêm 0.4 để line nằm trong vùng in

    ctx.save()
    ctx.strokeStyle = "#3b82f6"
    ctx.lineWidth = 0.8
    ctx.setLineDash([5, 5])
    ctx.strokeRect(offsetX, offsetY, printArea.width, printArea.height)
    ctx.restore()
  }

  private async drawLayoutSlotOutline(
    startX: number,
    startY: number,
    width: number,
    height: number,
    canvas: Canvas,
    ctx: CanvasRenderingContext2D
  ): Promise<void> {
    ctx.save()
    ctx.strokeStyle = "#ff0000"
    ctx.lineWidth = 0.8
    ctx.setLineDash([5, 5])
    ctx.strokeRect(startX, startY, width, height)
    ctx.restore()
  }

  /**
   * Draw layout slots
   */
  private async drawLayoutSlots(
    layout: TPrintLayout,
    layoutSlotsForCanvas: TLayoutSlotForCanvas[],
    allowedPrintArea: TAllowedPrintArea,
    originalContainer: TPrintAreaContainerWrapper,
    files: TMulterFiles,
    imageCache: Map<string, Image>,
    canvas: Canvas,
    ctx: CanvasRenderingContext2D
  ): Promise<void> {
    if (!layout.slotConfigs || layout.slotConfigs.length === 0) return
    ctx.save()
    for (const slot of layoutSlotsForCanvas) {
      const { placedImage, height, width, x, y } = slot
      const image = await this.loadImage(placedImage.imageURL, files, imageCache)

      const slotLeft = x - originalContainer.x
      const slotTop = y - originalContainer.y

      const realSlotWidth = width - 1.6
      const realSlotHeight = height - 1.6
      let drawWidth = realSlotWidth
      let drawHeight = realSlotHeight
      let drawX = slotLeft + 0.8
      let drawY = slotTop + 0.8

      if (placedImage.isOriginalFrameImage) {
        // CONTAIN MODE -> fit ảnh
        const slotRatio = drawWidth / drawHeight
        const imageRatio = image.width / image.height
        if (imageRatio > slotRatio) {
          drawHeight = drawWidth / imageRatio
          drawY += (realSlotHeight - drawHeight) / 2
        } else {
          drawWidth = drawHeight * imageRatio
          drawX += (realSlotWidth - drawWidth) / 2
        }
        ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight)
      } else {
        // COVER MODE -> crop ảnh
        const slotRatio = drawWidth / drawHeight
        const imageRatio = image.width / image.height

        let sx = 0
        let sy = 0
        let sWidth = image.width
        let sHeight = image.height

        if (imageRatio > slotRatio) {
          // crop ngang
          sWidth = image.height * slotRatio
          sx = (image.width - sWidth) / 2
        } else {
          // crop dọc
          sHeight = image.width / slotRatio
          sy = (image.height - sHeight) / 2
        }
        ctx.drawImage(image, sx, sy, sWidth, sHeight, drawX, drawY, drawWidth, drawHeight)
      }

      this.drawLayoutSlotOutline(
        slotLeft + 0.4,
        slotTop + 0.4,
        width - 0.8,
        height - 0.8,
        canvas,
        ctx
      )
    }
    ctx.restore()
  }

  /**
   * Draw printed image element
   */
  private async drawPrintedImageElement(
    element: TPrintedImageVisualState,
    files: TMulterFiles,
    imageCache: Map<string, Image>,
    canvas: Canvas,
    ctx: CanvasRenderingContext2D
  ): Promise<void> {
    console.log(">>> [canvas] printed image element:", element)

    // Fetch sticker from domain
    const printedImageUrl = this.toStoredURL(element.path, files, true)

    const image = await this.loadImage(printedImageUrl, files, imageCache)

    // Save context state
    ctx.save()

    // Calculate dimensions
    const width = element.width || image.width
    const height = element.height || image.height
    const scale = element.scale || 1
    const angle = element.angle || 0

    // Move to element position center
    const centerX = element.position.x + width / 2
    const centerY = element.position.y + height / 2

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
    ctx: CanvasRenderingContext2D
  ): Promise<void> {
    console.log(">>> [canvas] sticker element:", element)

    // Fetch sticker from domain
    const stickerUrl = this.toStoredURL(element.path, files, true)

    const image = await this.loadImage(stickerUrl, files, imageCache)

    // Save context state
    ctx.save()

    // Calculate dimensions
    const width = element.width || image.width
    const height = element.height || image.height
    const scale = element.scale || 1
    const angle = element.angle || 0

    // Move to element position center
    const centerX = element.position.x + width / 2
    const centerY = element.position.y + height / 2

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
    ctx: CanvasRenderingContext2D
  ): Promise<void> {
    console.log(">>> [canvas] text element:", element)
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
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`
    // ctx.fillStyle = element.textColor || "#000000"
    ctx.textBaseline = "middle" // Align "start point to draw text" to center
    ctx.textAlign = "center"

    const scale = element.scale || 1
    const angle = element.angle || 0

    // Move to element position top-left
    const centerX = element.position.x + dimensionOnCollect.width / 2
    const centerY = element.position.y + dimensionOnCollect.height / 2

    ctx.translate(centerX, centerY)
    ctx.scale(scale, scale)
    ctx.rotate((angle * Math.PI) / 180)

    // ctx.fillStyle = "#ff0000" // màu đỏ
    // ctx.fillRect(
    //   -dimensionOnCollect.width / 2,
    //   -dimensionOnCollect.height / 2,
    //   dimensionOnCollect.width,
    //   dimensionOnCollect.height
    // )

    // Draw text
    ctx.fillStyle = element.textColor || "#000000"
    ctx.fillText(element.content, 0, 0)

    // Restore context
    ctx.restore()
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

  /**
   * Export canvas to PNG file
   */
  private async exportCanvas(mockupId: string, canvas: Canvas): Promise<string> {
    const pathToStoredFileDir = mockupStoredFilesManager.getMockupStoragePath(mockupId)
    if (!pathToStoredFileDir) {
      throw new Error("Invalid stored file path")
    }
    const dirToStore = `${pathToStoredFileDir}/canvas`
    await mkdir(dirToStore, { recursive: true })

    const filename = `mockup--${mockupId}.png`
    const outputPath = path.join(dirToStore, filename)

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
}

export const canvasPainterService = new CanvasPainterService()
