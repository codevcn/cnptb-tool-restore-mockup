import { domains } from "../configs/contants"
import crypto from "crypto"

export const generateBlobFilePathByDate = (fileName: string, extensionWithDot?: string): string => {
  return `/storage/uploads/${fileName}${extensionWithDot ? "." + extensionWithDot : ""}`
}

export const generateFullBlobFilePathByDate = (
  fileName: string,
  extensionWithDot?: string
): string => {
  return `${domains.serverDomain}${generateBlobFilePathByDate(fileName, extensionWithDot)}`
}

export const generateFilename = (extension: string): string => {
  return `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${extension}`
}

export const hashUrl = (url: string): string => {
  return crypto.createHash("sha1").update(url).digest("hex")
}
