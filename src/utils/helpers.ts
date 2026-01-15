import crypto from "crypto"
import { endpoints } from "../configs/contants"
import { TMockupId } from "../types/api"
import { mockupStoredFilesManager } from "../configs/mockup-stored-files-manager"

export const generateFilename = (extension: string): string => {
  return `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${extension}`
}

export const hashUrl = (url: string): string => {
  return crypto.createHash("sha1").update(url).digest("hex")
}

export const safePath = (inputPath: string): string => {
  // Chặn ../
  if (inputPath.includes("..")) {
    throw new Error("Invalid path")
  }
  return inputPath.replace(/\\/g, "/")
}

export const normalizePath = (inputPath: string): string => {
  return inputPath.replace(/\\/g, "/").replace(/\/+/g, "/")
}

export const generateMediaURLByStoredFilePath = (filename: string, mockupId: TMockupId): string => {
  return `${endpoints.serverEndpoint}/${mockupStoredFilesManager.getMockupStoragePath(
    mockupId
  )}/media/${filename}`
}
