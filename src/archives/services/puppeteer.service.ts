import { read } from "fs"
import puppeteer, { Browser, Page } from "puppeteer"
import sharp from "sharp"

class PuppeteerService {
  private browser: Browser | null = null
  private isInitialized = false

  /**
   * Khởi tạo browser instance (singleton)
   */
  async initialize() {
    if (this.isInitialized && this.browser) {
      return
    }

    console.log("🚀 Initializing Puppeteer browser...")

    this.browser = await puppeteer.launch({
      headless: process.env.PUPPETEER_HEADLESS === "true",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
      ],
      defaultViewport: null,
    })

    this.isInitialized = true
    console.log("✅ Browser initialized")
  }

  /**
   * Tạo page mới
   */
  async createPage(): Promise<Page> {
    if (!this.browser) {
      await this.initialize()
    }

    const page = await this.browser!.newPage()

    // Set timeout
    const timeout = parseInt(process.env.BROWSER_TIMEOUT || "30000")
    page.setDefaultTimeout(timeout)
    page.setDefaultNavigationTimeout(timeout)

    return page
  }

  /**
   * Render HTML và screenshot element
   */
  async captureElement(
    htmlContent: string,
    selector: string,
    options: {
      format?: "png" | "jpeg" | "webp"
      quality?: number
      transparent?: boolean
      deviceScaleFactor?: number
      viewport?: { width: number; height: number }
      crop?: { x: number; y: number; width: number; height: number }
      resize?: {
        width: number
        height: number
        kernel?: "nearest" | "cubic" | "mitchell" | "lanczos2" | "lanczos3"
      }
    } = {}
  ): Promise<Buffer> {
    const startTime = performance.now()
    const page = await this.createPage()

    try {
      // Set viewport
      if (options.viewport) {
        // Puppeteer requires INTEGER values for width/height
        const width = Math.ceil(options.viewport.width)
        const height = Math.ceil(options.viewport.height)

        console.log(">>> Setting viewport:", {
          width,
          height,
          originalWidth: options.viewport.width,
          originalHeight: options.viewport.height,
          deviceScaleFactor: options.deviceScaleFactor || 1,
        })

        await page.setViewport({
          width,
          height,
          deviceScaleFactor: 8,
        })
      } else {
        console.log("⚠️  No viewport set, using default (800x600)")
      }

      console.log(">>> Loading HTML content...")
      console.log(">>> HTML length:", htmlContent.length, "characters")
      const loadStartTime = performance.now()

      // Load HTML
      await page.setContent(htmlContent, {
        waitUntil: "networkidle0",
        timeout: 30000,
      })

      const loadEndTime = performance.now()
      console.log(`>>> HTML loaded in ${(loadEndTime - loadStartTime).toFixed(0)}ms`)

      console.log(">>> Waiting for images to load...")

      // Kiểm tra số lượng images
      const imageStats = await page.evaluate(() => {
        const images = Array.from(document.images)
        return {
          total: images.length,
          loaded: images.filter((img) => img.complete).length,
          pending: images.filter((img) => !img.complete).length,
          sources: images.map((img) => ({
            src: img.src.substring(0, 100) + (img.src.length > 100 ? "..." : ""),
            complete: img.complete,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
          })),
        }
      })

      console.log(">>> Total images:", imageStats.total)
      console.log(">>> Already loaded:", imageStats.loaded)
      console.log(">>> Pending:", imageStats.pending)
      imageStats.sources.forEach((img, i) => {
        console.log(
          `   [${i + 1}] ${img.complete ? "✅" : "⏳"} ${img.src} (${img.naturalWidth}x${
            img.naturalHeight
          })`
        )
      })

      if (imageStats.pending > 0) {
        console.log(`   ⏳ Waiting for ${imageStats.pending} images...`)
        const imageLoadStart = performance.now()

        // Chờ tất cả images load
        await page.evaluate(() => {
          return Promise.all(
            Array.from(document.images)
              .filter((img) => !img.complete)
              .map(
                (img) =>
                  new Promise((resolve) => {
                    img.onload = img.onerror = resolve
                  })
              )
          )
        })

        const imageLoadEnd = performance.now()
        console.log(`>>> All images loaded in ${(imageLoadEnd - imageLoadStart).toFixed(0)}ms`)
      } else {
        console.log(">>> All images already loaded")
      }

      // Chờ fonts load
      console.log(">>> Waiting for fonts to load...")
      const fontLoadStart = performance.now()

      const fontStats = await page.evaluate(() => {
        return {
          ready: document.fonts.ready,
          status: document.fonts.status,
        }
      })

      console.log(`>>> Fonts detected: ${fontStats.ready} (status: ${fontStats.status})`)

      await page.evaluateHandle("document.fonts.ready")

      const fontLoadEnd = performance.now()
      console.log(`>>> Fonts ready in ${(fontLoadEnd - fontLoadStart).toFixed(0)}ms`)

      console.log(">>> Taking screenshot...")
      console.log(`>>> Looking for element: "${selector}"`)

      // Tìm element
      const element = await page.$(selector)
      if (!element) {
        // Debug: List all elements in page
        const availableElements = await page.evaluate(() => {
          return {
            ids: Array.from(document.querySelectorAll("[id]")).map((el) => "#" + el.id),
            classes: Array.from(
              new Set(
                Array.from(document.querySelectorAll("[class]")).flatMap((el) =>
                  Array.from(el.classList).map((c) => "." + c)
                )
              )
            ).slice(0, 10),
          }
        })
        console.error(">>> Element not found!")
        console.error(">>> Available IDs:", availableElements.ids)
        console.error(">>> Available classes:", availableElements.classes)
        throw new Error(`Element "${selector}" not found in HTML`)
      }

      // Get element dimensions
      const elementBox = await element.boundingBox()
      if (elementBox) {
        console.log(">>> Element found:")
        console.log(`>>> Position: (${elementBox.x}, ${elementBox.y})`)
        console.log(`>>> Size: ${elementBox.width}x${elementBox.height}px`)
      } else {
        console.log(">>> Element found but has no bounding box (hidden?)")
      }

      // Screenshot
      console.log(">>> Screenshot options:", {
        type: options.format || "png",
        quality: options.format === "jpeg" ? options.quality || 90 : undefined,
        omitBackground: options.transparent || false,
      })

      const screenshotStart = performance.now()
      let imageBuffer = await element.screenshot({
        type: options.format || "png",
        quality: options.format === "jpeg" ? options.quality || 90 : undefined,
        omitBackground: options.transparent || false,
      })
      const screenshotEnd = performance.now()

      console.log(
        `✅ Screenshot captured successfully in ${(screenshotEnd - screenshotStart).toFixed(0)}ms`
      )
      console.log(`>>> Buffer size: ${(imageBuffer.length / 1024).toFixed(2)} KB`)

      // Crop nếu có crop option
      if (options.crop) {
        console.log("✂️ Cropping image...", {
          x: options.crop.x,
          y: options.crop.y,
          width: options.crop.width,
          height: options.crop.height,
        })

        const cropStart = performance.now()

        imageBuffer = await sharp(imageBuffer)
          .extract({
            left: Math.floor(options.crop.x),
            top: Math.floor(options.crop.y),
            width: Math.floor(options.crop.width),
            height: Math.floor(options.crop.height),
          })
          .toBuffer()

        const cropEnd = performance.now()
        console.log(`✅ Image cropped in ${(cropEnd - cropStart).toFixed(0)}ms`)
        console.log(`>>> New buffer size: ${(imageBuffer.length / 1024).toFixed(2)} KB`)
      }

      const endTime = performance.now()
      console.log(`>>> Total capture time: ${(endTime - startTime).toFixed(0)}ms`)
      return imageBuffer as Buffer
    } catch (error) {
      console.error("❌ Error capturing element:", error)
      console.error(">>> Context:", {
        selector,
        hasViewport: !!options.viewport,
        format: options.format || "png",
        htmlLength: htmlContent.length,
      })

      // Debug: Save HTML to file for inspection
      try {
        const fs = require("fs")
        const debugPath = `./debug-error-${Date.now()}.html`
        fs.writeFileSync(debugPath, htmlContent)
        console.error(`   💾 HTML saved to ${debugPath} for debugging`)
      } catch (saveError) {
        console.error("   Failed to save debug HTML:", saveError)
      }

      throw error
    } finally {
      await page.close()
    }
  }

  /**
   * Đóng browser
   */
  async close() {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
      this.isInitialized = false
      console.log("🔒 Browser closed")
    }
  }

  /**
   * Cleanup khi server shutdown
   */
  async cleanup() {
    await this.close()
  }

  /**
   * 🔍 DEBUG: Save HTML to file
   */
  async debugSaveHtml(htmlContent: string, filename?: string): Promise<string> {
    const fs = require("fs")
    const path = require("path")
    const debugDir = path.join(process.cwd(), "debug")

    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true })
    }

    const filePath = path.join(debugDir, filename || `debug-${Date.now()}.html`)
    fs.writeFileSync(filePath, htmlContent)
    console.log(`🔍 DEBUG: HTML saved to ${filePath}`)
    return filePath
  }

  /**
   * 🔍 DEBUG: Take full page screenshot
   */
  async debugFullPageScreenshot(htmlContent: string): Promise<Buffer> {
    const page = await this.createPage()

    try {
      await page.setContent(htmlContent, { waitUntil: "networkidle0" })
      const screenshot = await page.screenshot({ fullPage: true })
      console.log("🔍 DEBUG: Full page screenshot captured")
      return screenshot as Buffer
    } finally {
      await page.close()
    }
  }

  /**
   * 🔍 DEBUG: Get page HTML after render
   */
  async debugGetRenderedHtml(htmlContent: string): Promise<string> {
    const page = await this.createPage()

    try {
      await page.setContent(htmlContent, { waitUntil: "networkidle0" })
      const renderedHtml = await page.content()
      console.log("🔍 DEBUG: Rendered HTML captured")
      return renderedHtml
    } finally {
      await page.close()
    }
  }
}

// Export singleton instance
export const puppeteerService = new PuppeteerService()
