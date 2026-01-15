import { NextFunction, Request, Response, Router } from "express"
import { mockupController } from "../controllers/mockup.controller"
import multer from "multer"
import path from "path"
import fs from "fs"
import { mkdir, rm } from "fs/promises"
import { mockupStoredFilesManager } from "../configs/mockup-stored-files-manager"

// File upload setup
const createUploadDir = (): string => {
  const uploadDir = path.resolve("storage/uploads")
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true })
  }
  return uploadDir
}
const uploadDir = createUploadDir()
const createTempDir = (): string => {
  const tempDir = path.resolve("storage/temp")
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }
  return tempDir
}
const tempDir = createTempDir()

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      if (!req.mockupId) {
        cb(new Error("Missing mockup ID in request"), uploadDir)
      } else {
        const destination = mockupStoredFilesManager.getMockupStoragePath(req.mockupId)
        if (destination) {
          cb(null, destination)
        } else {
          cb(new Error("Invalid mockup ID"), uploadDir)
        }
      }
    } catch (error) {
      cb(new Error("Failed to determine destination"), uploadDir)
    }
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname)
  },
})

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only images allowed"))
      return
    }
    cb(null, true)
  },
})

const cleanup = async () => {
  try {
    // Xoá thư mục nếu tồn tại
    await rm(tempDir, { recursive: true, force: true })
    await rm(uploadDir, { recursive: true, force: true })
    console.log(">>> [routes] Directories cleaned:", { uploadDir, tempDir })

    // Tạo lại thư mục
    await mkdir(uploadDir, { recursive: true })
    await mkdir(tempDir, { recursive: true })
    console.log(">>> [routes] Directories created:", { uploadDir, tempDir })
  } catch (e) {
    console.error(">>> [routes] Warning cleaning directories:", e)
  }
}

const setupRequestSession = async (req: Request, res: Response, next: NextFunction) => {
  await cleanup()
  await mockupStoredFilesManager.createMockupStoragePath(req, uploadDir)
  next()
}

const setupMulterMiddleware = upload.fields([
  { name: "local_blob_urls" }, // nhiều blob
])

const router = Router()

router.post("/restore", setupRequestSession, setupMulterMiddleware, (req, res) =>
  mockupController.restoreMockup(req, res)
)

export default router
