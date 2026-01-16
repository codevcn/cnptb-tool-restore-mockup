import { Request } from "express"
import { mkdir } from "fs/promises"
import path from "path"
import { TMockupId } from "../types/api"
import { uploadDir } from "./upload-file"
import { EClientRequestHeaders } from "./contants"
import { normalizePath } from "../utils/helpers"

type TMockupSessionData = {
  destination: string // đường dẫn lưu trữ mockup: upload dir / location / year / month / day / hour / mockupId / (canvas, html, media)
}

class MockupStoredFilesManager {
  private storedMockups: Map<TMockupId, TMockupSessionData> = new Map()

  createMockupStoragePathByRequest = async (req: Request): Promise<string> => {
    const location = req.get(EClientRequestHeaders.FROM_LOCATION) as string | undefined
    console.log(">>> [stored] location:", location)
    if (!location || typeof location !== "string") {
      throw new Error("Invalid or missing location in headers")
    }

    const mockupId = req.get(EClientRequestHeaders.APP_MOCKUP_ID) as string | undefined
    console.log(">>> [stored] mockupId:", mockupId)
    if (!mockupId || typeof mockupId !== "string") {
      throw new Error("Invalid or missing mockupId in headers")
    }
    req.mockupId = mockupId

    return this.createMockupStoragePath(mockupId, location)
  }

  createMockupStoragePath = async (mockupId: TMockupId, location: string): Promise<string> => {
    if (this.checkIfMockupStored(mockupId)) {
      return this.getMockupStoragePath(mockupId)!
    }

    const destination = this.buildMockupStoragePath(mockupId, location)!
    await this.createMockupDirectory(destination)
    this.saveMockupStoragePath(mockupId, destination)

    console.log(">>> [stored] Saving file to:", destination)
    return destination
  }

  buildMockupStoragePath = (mockupId: TMockupId, location: string): string | null => {
    // Tạo path theo pattern: location/year/month/day/hour/mockupId
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, "0")
    const day = String(now.getDate()).padStart(2, "0")
    const hour = String(now.getHours()).padStart(2, "0")

    const destination = path.join(uploadDir, location, String(year), month, day, hour, mockupId)
    return normalizePath(destination)
  }

  getMockupStoragePath = (mockupId: TMockupId): string | null => {
    const data = this.storedMockups.get(mockupId)
    return data ? data.destination : null
  }

  saveMockupStoragePath = (mockupId: TMockupId, destination: string) => {
    this.storedMockups.set(mockupId, { destination })
  }

  removeStoredMockup = (mockupId: TMockupId) => {
    this.storedMockups.delete(mockupId)
  }

  checkIfMockupStored = (mockupId: TMockupId): boolean => {
    return this.storedMockups.has(mockupId)
  }

  createMockupDirectory = async (destination: string) => {
    await mkdir(destination, { recursive: true })
  }

  logForDebug = () => {
    console.log(">>> [stored] Current stored mockups:", [...this.storedMockups.entries()])
  }
}
export const mockupStoredFilesManager = new MockupStoredFilesManager()
