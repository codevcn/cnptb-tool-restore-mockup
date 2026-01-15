import { Request, Response } from "express"
import { TRestoreMockupBodySchema } from "../types/api"
import { htmlGeneratorService } from "../services/html-generator.service"
import { canvasPainterService } from "../services/canvas-painter.service"

type TLocalBlobURLField = {
  local_blob_urls: Express.Multer.File[]
}

export class MockupController {
  async restoreMockup(req: Request, res: Response) {
    const startTime = performance.now()
    try {
      const data = JSON.parse(req.body.main_data) as TRestoreMockupBodySchema
      console.log(">>> [controller] input data:", data)

      const files = req.files as TLocalBlobURLField
      console.log(">>> [controller] input files:", files.local_blob_urls)

      try {
        await Promise.all([
          (async () => {
            const htmlStartTime = performance.now()
            await htmlGeneratorService.generateMockupHTML(
              structuredClone(data),
              files.local_blob_urls
            )
            const htmlEndTime = performance.now()
            console.log(
              `>>> ✅ [controller] HTML generation took ${Math.round(
                htmlEndTime - htmlStartTime
              )}ms`
            )
          })(),
          (async () => {
            const canvasStartTime = performance.now()
            await canvasPainterService.generateMockupImage(
              structuredClone(data),
              files.local_blob_urls
            )
            const canvasEndTime = performance.now()
            console.log(
              `>>> ✅ [controller] Canvas generation took ${Math.round(
                canvasEndTime - canvasStartTime
              )}ms`
            )
          })(),
        ])
      } catch (err) {
        console.log(">>> ❌ [controller] Canvas error:", err)
        throw new Error("Error generating mockup canvas or HTML")
      }

      const endTime = performance.now()
      const processingTime = Math.round(endTime - startTime)
      console.log(`>>> ✅ [controller] Total processing took ${processingTime}ms`)

      return res.json({
        success: true,
        metadata: {
          processingTime,
        },
      })
    } catch (error) {
      if (error instanceof Error) {
        console.error(">>> ❌ [controller] Error restoring mockup:", error)
        return res.status(500).json({ success: false, error: error.message })
      }
      return res.status(500).json({ success: false, error: "Unknown error restoring mockup" })
    }
  }
}

export const mockupController = new MockupController()
