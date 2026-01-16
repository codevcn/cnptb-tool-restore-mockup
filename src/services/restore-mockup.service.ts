import { unlink } from "fs/promises"
import { mockupStoredFilesManager } from "../configs/mockup-stored-files-manager"
import { TRestoreMockupBodySchema } from "../types/api"
import { TMulterFiles, TUsedStoredFileNames } from "../types/global"
import { canvasPainterService } from "./canvas-generator.service"
import { htmlGeneratorService } from "./html-generator.service"
import path from "path"

class RestoreMockupService {
  async restoreMockup(data: TRestoreMockupBodySchema, storedFiles: TMulterFiles): Promise<void> {
    const usedStoredFileNames: TUsedStoredFileNames = new Set()
    try {
      await Promise.allSettled([
        (async () => {
          const htmlStartTime = performance.now()
          await htmlGeneratorService.generateMockupHTML(
            structuredClone(data),
            storedFiles,
            usedStoredFileNames
          )
          const htmlEndTime = performance.now()
          console.log(
            `>>> ✅ [controller] HTML generation took ${Math.round(htmlEndTime - htmlStartTime)}ms`
          )
        })(),
        (async () => {
          const canvasStartTime = performance.now()
          await canvasPainterService.generateMockupImage(
            structuredClone(data),
            storedFiles,
            usedStoredFileNames
          )
          const canvasEndTime = performance.now()
          console.log(
            `>>> ✅ [controller] Canvas generation took ${Math.round(
              canvasEndTime - canvasStartTime
            )}ms`
          )
        })(),
      ])
      await this.cleanupAfterRestore(data.mockupId, storedFiles, usedStoredFileNames)
    } catch (err) {
      console.log(">>> ❌ [controller] Canvas error:", err)
      throw new Error("Error generating mockup canvas or HTML")
    }
  }

  async cleanupAfterRestore(
    mockupId: string,
    storedFiles: TMulterFiles,
    usedStoredFileNames: TUsedStoredFileNames
  ): Promise<void> {
    const storagePath = mockupStoredFilesManager.getMockupStoragePath(mockupId)

    mockupStoredFilesManager.logForDebug()
    mockupStoredFilesManager.removeStoredMockup(mockupId)
    mockupStoredFilesManager.logForDebug()

    if (!storagePath) {
      throw new Error("Invalid mockup storage path for cleanup")
    }

    const unused = storedFiles.filter((f) => !usedStoredFileNames.has(f.filename))

    const results = await Promise.allSettled(
      unused.map(async (file) => {
        const filePath = path.join(storagePath, "media", file.filename)
        try {
          await unlink(filePath)
          console.log(`>>> 🗑️ Deleted unused file: ${filePath}`)
        } catch (err) {
          if ((err as any)?.code !== "ENOENT") {
            throw new Error(`Failed to delete unused file: ${filePath}`)
          }
        }
      })
    )

    const failed = results.filter((r) => r.status === "rejected")
    if (failed.length > 0) throw new Error(`Failed to delete ${failed.length} unused files`)
  }
}

export const restoreMockupService = new RestoreMockupService()
