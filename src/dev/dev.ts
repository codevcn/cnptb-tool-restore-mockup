import { mkdir, rm } from "fs/promises"
import { tempDir, uploadDir } from "../configs/upload-file"

export const cleanup = async () => {
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
