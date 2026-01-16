import { NextFunction, Request, Response, Router } from "express"
import { mockupController } from "../controllers/mockup.controller"
import multer from "multer"
import { mockupStoredFilesManager } from "../configs/mockup-stored-files-manager"
import { ERequestPayloadFields } from "../configs/contants"
import { mkdir } from "fs/promises"
import { cleanup } from "../dev/dev"

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
