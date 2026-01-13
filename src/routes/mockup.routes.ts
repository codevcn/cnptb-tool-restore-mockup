import { NextFunction, Request, Response, Router } from "express"
import { mockupController } from "../controllers/mockup.controller"
import multer from "multer"
import path from "path"
import fs from "fs"
import { mkdir, rm } from "fs/promises"

// File upload setup
const uploadDir = path.resolve("storage/uploads")
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir)
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
    console.log(">>> [multer] File filter:", file)
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only images allowed"))
      return
    }
    cb(null, true)
  },
})

const cleanup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // làm sạch các thư mục
    const canvasDir = "storage/canvas"
    const htmlDir = "storage/html"
    const uploadsDir = "storage/uploads"
    const tempDir = "storage/temp"

    // Xoá thư mục nếu tồn tại
    await rm(tempDir, { recursive: true, force: true })
    await rm(uploadsDir, { recursive: true, force: true })
    await rm(canvasDir, { recursive: true, force: true })
    await rm(htmlDir, { recursive: true, force: true })
    console.log(">>> [resm] Directories cleaned:", { uploadsDir, canvasDir, htmlDir })
    await mkdir(uploadsDir, { recursive: true })
    await mkdir(canvasDir, { recursive: true })
    await mkdir(htmlDir, { recursive: true })
    await mkdir(tempDir, { recursive: true })
    console.log(">>> [resm] Directories created:", { uploadsDir, canvasDir, htmlDir })
  } catch (e) {
    console.error(">>> [resm] Warning cleaning directories:", e)
  }
  next()
}

const setupMulter = () => {
  return upload.fields([
    { name: "local_blob_urls" }, // nhiều blob
  ])
}

const router = Router()

router.post("/restore", cleanup, setupMulter(), (req, res) =>
  mockupController.restoreMockup(req, res)
)
router.get("/health", (req, res) => mockupController.healthCheck(req, res))

export default router
