// import { webkit, Browser, Page } from "playwright"
// import sharp from "sharp"

// class WebKitService {
//   private browser: Browser | null = null
//   private isInitialized = false

//   /**
//    * Khởi tạo WebKit browser (Safari engine)
//    */
//   async initialize() {
//     if (this.isInitialized && this.browser) {
//       return
//     }

//     console.log("🚀 Initializing WebKit browser (Safari engine)...")

//     this.browser = await webkit.launch({
//       headless: true,
//     })

//     this.isInitialized = true
//     console.log("✅ WebKit browser initialized")
//   }

//   /**
//    * Tạo page mới
//    */
//   async createPage(): Promise<Page> {
//     if (!this.browser) {
//       await this.initialize()
//     }

//     const page = await this.browser!.newPage()

//     // Set timeout
//     const timeout = parseInt(process.env.BROWSER_TIMEOUT || "30000")
//     page.setDefaultTimeout(timeout)

//     return page
//   }

//   /**
//    * Render HTML và screenshot element (WebKit/Safari rendering)
//    */
//   async captureElement(
//     htmlContent: string,
//     selector: string,
//     options: {
//       format?: "png" | "jpeg" | "webp"
//       quality?: number
//       transparent?: boolean
//       deviceScaleFactor?: number
//       viewport?: { width: number; height: number }
//       crop?: { x: number; y: number; width: number; height: number }
//       resize?: { width: number; height: number; kernel?: "nearest" | "cubic" | "mitchell" | "lanczos2" | "lanczos3" }
//     } = {}
//   ): Promise<Buffer> {
//     const startTime = performance.now()
//     const page = await this.createPage()

//     try {
//       // Set viewport
//       if (options.viewport) {
//         const width = Math.ceil(options.viewport.width)
//         const height = Math.ceil(options.viewport.height)

//         console.log(">>> Setting WebKit viewport:", {
//           width,
//           height,
//           deviceScaleFactor: options.deviceScaleFactor || 1,
//         })

//         await page.setViewportSize({
//           width,
//           height,
//         })
//       }

//       console.log(">>> Loading HTML content in WebKit...")
//       const loadStartTime = performance.now()

//       await page.setContent(htmlContent, {
//         waitUntil: "networkidle",
//         timeout: 30000,
//       })

//       const loadEndTime = performance.now()
//       console.log(`>>> HTML loaded in ${(loadEndTime - loadStartTime).toFixed(0)}ms`)

//       // Wait for images
//       console.log(">>> Waiting for images to load...")
//       await page.waitForLoadState("networkidle")

//       console.log(">>> Taking screenshot with WebKit/Safari rendering...")

//       // Tìm element
//       const element = await page.$(selector)
//       if (!element) {
//         throw new Error(`Element "${selector}" not found in HTML`)
//       }

//       // Screenshot
//       let imageBuffer = await element.screenshot({
//         type: options.format || "png",
//         quality: options.format === "jpeg" ? options.quality || 90 : undefined,
//         omitBackground: options.transparent || false,
//       })

//       console.log(`>>> Buffer size: ${(imageBuffer.length / 1024).toFixed(2)} KB`)

//       // Crop nếu có crop option
//       if (options.crop) {
//         console.log("✂️ Cropping image...")
//         imageBuffer = await sharp(imageBuffer)
//           .extract({
//             left: Math.floor(options.crop.x),
//             top: Math.floor(options.crop.y),
//             width: Math.floor(options.crop.width),
//             height: Math.floor(options.crop.height),
//           })
//           .toBuffer()
//       }

//       // Resize nếu có resize option
//       if (options.resize) {
//         console.log("🔧 Resizing image...")
//         imageBuffer = await sharp(imageBuffer)
//           .resize(options.resize.width, options.resize.height, {
//             kernel: options.resize.kernel || "lanczos3",
//             fit: "fill",
//           })
//           .toBuffer()
//       }

//       const endTime = performance.now()
//       console.log(`✅ WebKit capture completed in ${(endTime - startTime).toFixed(0)}ms`)

//       return imageBuffer as Buffer
//     } catch (error) {
//       console.error("❌ Error capturing with WebKit:", error)
//       throw error
//     } finally {
//       await page.close()
//     }
//   }

//   /**
//    * Đóng browser
//    */
//   async close() {
//     if (this.browser) {
//       await this.browser.close()
//       this.browser = null
//       this.isInitialized = false
//       console.log("🔒 WebKit browser closed")
//     }
//   }

//   async cleanup() {
//     await this.close()
//   }
// }

// // Export singleton instance
// export const webkitService = new WebKitService()
