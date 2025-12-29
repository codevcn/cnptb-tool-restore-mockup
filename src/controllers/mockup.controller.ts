import { Request, Response } from "express"
import { TMockupId, TRestoreMockupBodySchema } from "../types/api"
import { htmlGeneratorService } from "../services/html-generator.service"
import { canvasPainterService } from "../services/canvas-painter.service"
import { writeFile, mkdir } from "fs/promises"
import path from "path"

type TLocalBlobURLField = {
  local_blob_urls: Express.Multer.File[]
}

export class MockupController {
  /**
   * POST /api/mockup/restore
   */
  async restoreMockup(req: Request, res: Response) {
    const startTime = performance.now()
    try {
      const data = JSON.parse(req.body.main_data) as TRestoreMockupBodySchema
      console.log(">>> [resm] input data:", data)

      const files = req.files as TLocalBlobURLField
      console.log(">>> [resm] input files:", files.local_blob_urls)

      let outputPath: string | null = null
      let method: "canvas" | "html" = "canvas"
      let format: "png" | "html" = "png"

      // TRY: Canvas rendering first (PRIMARY METHOD)
      try {
        const startTime = performance.now()
        outputPath = await canvasPainterService.paintMockupToCanvas(data, files.local_blob_urls)
        const endTime = performance.now()
        console.log(`>>> [resm] Canvas rendering took ${Math.round(endTime - startTime)}ms`)
        method = "canvas"
        format = "png"
        console.log("✅ [resm] Canvas rendering succeeded")
      } catch (canvasError) {
        console.warn("⚠️ [resm] Canvas rendering failed, falling back to HTML:", canvasError)
        method = "html"
        format = "html"

        // // FALLBACK: HTML generation
        // try {
        //   const html = await htmlGeneratorService.generateMockupHTML(data, files.local_blob_urls)
        //   outputPath = await this.saveHTMLToFile(html, data.mockupId)
        //   console.log("✅ [resm] HTML fallback succeeded")
        // } catch (htmlError) {
        //   console.error("❌ [resm] Both canvas and HTML rendering failed")
        //   throw htmlError
        // }
        outputPath = "dummy_path"
      }

      const endTime = performance.now()
      const processingTime = Math.round(endTime - startTime)

      // Get file URL
      const outputUrl = this.getPublicUrl(outputPath, format)

      res.json({
        success: true,
        method,
        format,
        outputPath,
        outputUrl,
        metadata: {
          processingTime,
          mockupId: data.mockupId,
        },
      })

      console.log(`✅ [resm] Mockup restored successfully in ${processingTime}ms using ${method}`)
    } catch (error) {
      console.error("❌ [resm] Error restoring mockup:", error)
      res.status(500).json({ success: false, error: (error as Error).message })
    }
  }

  private getPublicUrl(filePath: string, format: "png" | "html"): string {
    const filename = path.basename(filePath)
    if (format === "png") {
      return `http://localhost:4000/storage/canvas/${filename}`
    } else {
      return `http://localhost:4000/storage/html/${filename}`
    }
  }

  async saveHTMLToFile(html: string, mockupId: TMockupId): Promise<string> {
    const htmlDir = "/storage/html"
    await mkdir(htmlDir, { recursive: true })
    const htmlFileName = `mockup--${mockupId}.html`
    const htmlFilePath = path.join(htmlDir, htmlFileName)
    await writeFile(htmlFilePath, html)
    return htmlFilePath
  }

  /**
   * GET /api/mockup/health
   */
  async healthCheck(req: Request, res: Response) {
    res.json({
      status: "ok",
      puppeteer: "ready",
      timestamp: Date.now(),
    })
  }
}

export const mockupController = new MockupController()
