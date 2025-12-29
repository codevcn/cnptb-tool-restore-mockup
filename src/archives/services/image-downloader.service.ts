import axios from "axios"
import fs from "fs"

export class ImageDownloaderService {
  async downloadImage(imageUrl: string, outputPath: string): Promise<string> {
    const response = await axios.get(imageUrl, {
      responseType: "arraybuffer",
    })

    const buffer = Buffer.from(response.data)
    fs.writeFileSync(outputPath, buffer)

    return outputPath
  }

  async saveBase64Image(base64Data: string, outputPath: string): Promise<string> {
    const buffer = Buffer.from(base64Data, "base64")
    fs.writeFileSync(outputPath, buffer)

    return outputPath
  }
}

export const imageDownloaderService = new ImageDownloaderService()
