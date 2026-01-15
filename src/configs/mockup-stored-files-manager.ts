import { Request } from "express"
import { mkdir } from "fs/promises"
import path from "path"
import { TMockupId } from "../types/api"

type TMockupSessionData = {
  destination: string
}

class MockupStoredFilesManager {
  private storedFiles: Map<TMockupId, TMockupSessionData> = new Map()

  createMockupStoragePath = async (req: Request, uploadDir: string): Promise<string> => {
    // Lấy location từ FormData
    const location = (req.query.from_location as string) || "unknown"
    console.log(">>> [stored] location:", location)

    // Tạo path theo pattern: location/year/month/day/hour
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, "0")
    const day = String(now.getDate()).padStart(2, "0")
    const hour = String(now.getHours()).padStart(2, "0")

    console.log('>>> [stored] req.body:', req.body)
    const mainData = JSON.parse(req.body.main_data || "{}")
    console.log(">>> [stored] mainData:", mainData)

    const mockupId = mainData.mockupId
    if (!mockupId || typeof mockupId !== "string") {
      throw new Error("Invalid or missing mockupId in main_data")
    }

    req.mockupId = mockupId

    const destination = path.join(uploadDir, location, String(year), month, day, hour, mockupId)
    this.saveMockupStoragePath(mockupId, destination)
    await this.createMockupDirectory(destination)

    console.log(">>> [stored] Saving file to:", destination)
    return destination
  }

  getMockupStoragePath = (mockupId: TMockupId): string | null => {
    const data = this.storedFiles.get(mockupId)
    return data ? data.destination : null
  }

  saveMockupStoragePath = (mockupId: TMockupId, destination: string) => {
    this.storedFiles.set(mockupId, { destination })
  }

  removeMockupStoragePath = (mockupId: TMockupId) => {
    this.storedFiles.delete(mockupId)
  }

  async createMockupDirectory(destination: string) {
    await mkdir(destination, { recursive: true })
  }
}
export const mockupStoredFilesManager = new MockupStoredFilesManager()
