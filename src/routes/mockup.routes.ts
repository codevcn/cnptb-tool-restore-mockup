import { NextFunction, Request, Response, Router } from "express"
import { mockupController } from "../controllers/mockup.controller"
import multer from "multer"
import { mockupStoredFilesManager } from "../configs/mockup-stored-files-manager"
import { ERequestPayloadFields } from "../configs/contants"
import { mkdir, rm } from "fs/promises"
import { tempDir, uploadDir } from "../configs/upload-file"

const diskStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      if (!req.mockupId) {
        return cb(new Error("Missing mockupId in request"), "")
      }
      const storagePath = mockupStoredFilesManager.getMockupStoragePath(req.mockupId)
      console.log(">>> [routes] Storage path:", storagePath)
      if (!storagePath) {
        return cb(new Error("Invalid mockup storage path"), "")
      }
      const mediaPath = `${storagePath}/media`
      await mkdir(mediaPath, { recursive: true })
      cb(null, mediaPath)
    } catch (error) {
      cb(new Error("Failed to determine destination"), "")
    }
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname)
  },
})

const uploadToDisk = multer({
  storage: diskStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === ERequestPayloadFields.LOCAL_BLOBS) {
      if (!file.mimetype.startsWith("image/")) {
        return cb(new Error("local_blobs must be images"))
      }
      return cb(null, true)
    }
    if (
      file.fieldname === ERequestPayloadFields.MAIN_DATA ||
      file.fieldname === ERequestPayloadFields.USER_AGENT_DATA
    ) {
      // chấp nhận json / text
      if (!["application/json", "text/plain", "application/octet-stream"].includes(file.mimetype)) {
        return cb(new Error(`${file.fieldname} must be json/text`))
      }
      return cb(null, true)
    }
    cb(new Error(`Unexpected field: ${file.fieldname}`))
  },
})

const cleanup = async () => {
  try {
    // Xoá thư mục nếu tồn tại
    await rm(tempDir, { recursive: true, force: true })
    await rm(uploadDir, { recursive: true, force: true })
    console.log(">>> [routes] Directories cleaned:", { uploadDir, tempDir })

    // Tạo lại thư mục
    await mkdir(tempDir, { recursive: true })
    await mkdir(uploadDir, { recursive: true })
    console.log(">>> [routes] Directories created:", { uploadDir, tempDir })
  } catch (e) {
    console.error(">>> [routes] Warning cleaning directories:", e)
  }
}

const setupRequestSession = async (req: Request, res: Response, next: NextFunction) => {
  await cleanup()
  try {
    await mockupStoredFilesManager.createMockupStoragePathByRequest(req)
  } catch (error) {
    next(error)
    return
  }
  next()
}

const saveFilesFormRequest = uploadToDisk.fields([
  { name: ERequestPayloadFields.LOCAL_BLOBS }, // Nhiều file ảnh
  { name: ERequestPayloadFields.MAIN_DATA }, // 1 file JSON nhỏ
  { name: ERequestPayloadFields.USER_AGENT_DATA }, // 1 file JSON nhỏ
])

const router = Router()

router.post("/restore", setupRequestSession, saveFilesFormRequest, (req, res) =>
  mockupController.restoreMockup(req, res)
)

export default router
