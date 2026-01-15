import { existsSync, mkdirSync } from "fs"

// File upload setup
const createUploadDir = (): string => {
  const uploadDir = "storage/uploads"
  if (!existsSync(uploadDir)) {
    mkdirSync(uploadDir, { recursive: true })
  }
  return uploadDir
}
export const uploadDir = createUploadDir()

const createTempDir = (): string => {
  const tempDir = "storage/temp"
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true })
  }
  return tempDir
}
export const tempDir = createTempDir()
