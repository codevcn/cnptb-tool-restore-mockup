import { TMockupRequest } from "../../types/global"

export const validateMockupRequest = (data: any): data is TMockupRequest => {
  if (!data || typeof data !== "object") {
    return false
  }

  if (!data.imageUrl || typeof data.imageUrl !== "string") {
    return false
  }

  return true
}

export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}
