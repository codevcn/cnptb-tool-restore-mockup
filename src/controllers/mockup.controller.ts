import { Request, Response } from "express"
import { TRestoreMockupBodySchema } from "../types/api"
import { htmlGeneratorService } from "../services/html-generator.service"
import { canvasPainterService } from "../services/canvas-generator.service"
import { restoreMockupService } from "../services/restore-mockup.service"

type TLocalBlobURLField = {
  local_blobs: Express.Multer.File[]
}

export class MockupController {
  async restoreMockup(req: Request, res: Response) {
    const startTime = performance.now()
    try {
      const data = JSON.parse(req.body.main_data) as TRestoreMockupBodySchema
      console.log(">>> [controller] input data:", data)

      const files = req.files as TLocalBlobURLField
      console.log(">>> [controller] input files:", files)

      await restoreMockupService.restoreMockup(data, files.local_blobs)

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
