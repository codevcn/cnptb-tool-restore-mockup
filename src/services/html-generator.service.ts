import { domains } from "../configs/contants"
import {
  TAllowedPrintArea,
  TLayoutMode,
  TMockupId,
  TPrintAreaContainerWrapper,
  TPrintedImageVisualState,
  TPrintLayout,
  TRestoreMockupBodySchema,
  TStickerVisualState,
  TTextVisualState,
} from "../types/api"
import {
  TBrowserViewport,
  TElementType,
  TElementVisualBaseState,
  TMulterFiles,
  TReactCSSProperties,
} from "../types/global"
import path from "path"
import { generateFullBlobFilePathByDate } from "../utils/helpers"
import { mkdir, writeFile } from "fs/promises"
import { mockupStoredFilesManager } from "../configs/mockup-stored-files-manager"

type TStoredMediaFiles = TMulterFiles

class HtmlGeneratorService {
  /**
   * Generate complete HTML from mockup data
   */
  async generateMockupHTML(
    data: TRestoreMockupBodySchema,
    storedFiles: TStoredMediaFiles
  ): Promise<void> {
    const {
      allowedPrintArea,
      layout,
      printAreaContainerWrapper,
      product,
      printedImageElements,
      stickerElements,
      textElements,
      layoutMode,
      devicePixelRatio,
      mockupId,
    } = data

    const viewport: TBrowserViewport = {
      width: printAreaContainerWrapper.width,
      height: printAreaContainerWrapper.height,
    }

    const printContainerBorderWidth: number = parseFloat(printAreaContainerWrapper.borderWidth)
    const allowedAreaBorderWidth: number = parseFloat(allowedPrintArea.borderWidth)
    const layoutSlotBorderWidth: number = parseFloat(data.layoutSlotBorderWidth)

    const realPrintContainerBorderWidth: number = Math.round(
      printContainerBorderWidth / devicePixelRatio
    )

    const defaultFontFamily = "Roboto"
    const defaultFontURL = `${domains.publicAssetsEndpoint}/fonts/Roboto/Roboto-VariableFont_wdth,wght.ttf`

    console.log(">>> [html] border widths:", {
      printContainerBorderWidth,
      allowedAreaBorderWidth,
      layoutSlotBorderWidth,
      realPrintContainerBorderWidth,
    })

    const htmlResult = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Mockup Restoration</title>
          <style>
            ${this.generateCSS(
              printContainerBorderWidth,
              allowedAreaBorderWidth,
              layoutSlotBorderWidth,
              defaultFontFamily,
              defaultFontURL
            )}
          </style>
        </head>
        <body
          style="
            width: ${viewport.width}px;
            height: ${viewport.height}px;
          "
        >
          <div
            style="
              width: ${printAreaContainerWrapper.width}px;
              height: ${printAreaContainerWrapper.height}px;
            "
            class="NAME-print-area-container"
          >
            ${this.generateBackgroundImage(product.mockup.imageURL, storedFiles)}
            ${this.generateAllowedPrintArea(
              storedFiles,
              printAreaContainerWrapper,
              allowedPrintArea,
              layoutMode,
              realPrintContainerBorderWidth,
              layout || undefined
            )}
            ${
              printedImageElements
                ? printedImageElements
                    .map((el) => this.generatePrintedImageElement(el, storedFiles))
                    .join("\n")
                : ""
            }
            ${
              stickerElements
                ? stickerElements
                    .map((el) => this.generateStickerElement(el, storedFiles))
                    .join("\n")
                : ""
            }
            ${textElements ? textElements.map((el) => this.generateTextElement(el)).join("\n") : ""}
          </div>
        </body>
        ${this.generateScript()}
      </html>
    `

    await this.saveHTMLToFile(htmlResult, mockupId)
  }

  private generateScript(): string {
    return `
      <script>
        const fitLayoutSlots = () => {
          const displayer = document.body.querySelector(".NAME-slots-displayer")
          if (!displayer) return
          if (displayer.getAttribute("data-layout-type") === "full") return
          for (const slot of displayer.querySelectorAll(".NAME-layout-slot") || []) {
            const { height, width } = slot.getBoundingClientRect()
            let newHeight = height
            let newWidth = width
            if (newHeight > newWidth) {
              newHeight = newWidth
            } else {
              newWidth = newHeight
            }
            slot.style.height = newHeight + "px"
            slot.style.width = newWidth + "px"
          }
          displayer.style.height = "fit-content"
          displayer.style.width = "fit-content"
        }
        fitLayoutSlots()
      </script>
    `
  }

  private toStoredURL(url: string, files: TMulterFiles): string {
    if (url.startsWith("blob:")) {
      const pathname = path.basename(url).slice(1) // remove leading '/'
      const file = files.find((f) => f.originalname.includes(pathname))
      if (file) return generateFullBlobFilePathByDate(file.originalname)
    }
    return url
  }

  /**
   * Generate CSS styles
   */
  private generateCSS(
    printContainerBorderWidth: number,
    allowedAreaBorderWidth: number,
    layoutSlotBorderWidth: number,
    defaultFontFamily: string,
    defaultFontURL: string
  ): string {
    return `
      @font-face {
        font-family: "${defaultFontFamily}";
        src: url("${defaultFontURL}") format("truetype-variations");
        font-weight: 100 900;
        font-style: normal;
        font-display: swap;
      }

      :root {
        --vcn-allowed-print-area-boundary: #3b82f6;
      }

      * {
        box-sizing: border-box;
      }

      p,
      h1,
      h2,
      h3,
      h4,
      h5,
      h6 {
        margin: 0;
      }

      body {
        font-family: "${defaultFontFamily}", system-ui, -apple-system, sans-serif;
        background-color: transparent;
        overflow: hidden;
        margin: 0;
        padding: 0;
      }

      .NAME-print-area-container {
        position: relative;
        overflow: hidden;
        border: ${printContainerBorderWidth}px solid lightgray;
      }

      .NAME-product-image {
        position: relative;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 4;
        object-fit: contain;
        object-position: center;
      }

      .NAME-print-area-allowed {
        display: flex;
        justify-content: center;
        align-items: center;
        position: absolute;
        z-index: 6;
        border: ${allowedAreaBorderWidth}px dashed var(--vcn-allowed-print-area-boundary);
      }

      .NAME-slots-displayer {
        position: relative;
        padding: 2px;
        width: 100%;
        height: 100%;
      }

      .NAME-layout-slot {
        position: relative;
        overflow: hidden;
        place-self: center;
        display: flex;
        justify-content: center;
        align-items: center;
        border: ${layoutSlotBorderWidth}px dashed #4a5565;
      }

      .NAME-frame-placed-image {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center;
        z-index: 10;
      }

      .NAME-root-element {
        position: absolute;
        z-index: 30;
        height: fit-content;
        width: fit-content;
      }

      .NAME-element-main-box {
        height: 100%;
        width: 100%;
        position: relative;
        transform-origin: center;
      }

      .NAME-element-main-box.NAME-main-box-text {
        color: inherit;
        height: auto;
        width: auto;
      }

      .NAME-element-display {
        width: 100%;
        height: 100%;
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      }

      .NAME-displayed-text-content {
        font-weight: bold;
        white-space: nowrap;
        user-select: none;
        line-height: 1;
        padding: 4px 0;
      }
    `
  }

  /**
   * Generate background image
   */
  private generateBackgroundImage(url: string, files: TMulterFiles): string {
    const fileUrl = this.toStoredURL(url, files)
    return `
      <img 
        class="NAME-product-image" 
        src="${this.escapeHtml(fileUrl)}" 
        alt="Background Image"
      />
    `
  }

  private generateAllowedPrintArea(
    files: TMulterFiles,
    printAreaContainerWrapper: TPrintAreaContainerWrapper,
    allowedPrintArea: TAllowedPrintArea,
    layoutMode: TLayoutMode,
    realPrintContainerBorderWidth: number,
    layout?: TPrintLayout
  ): string {
    return `
      <div
        style="
          width: ${allowedPrintArea.width}px;
          height: ${allowedPrintArea.height}px; 
          left: ${
            allowedPrintArea.x - printAreaContainerWrapper.x - realPrintContainerBorderWidth
          }px; 
          top: ${
            allowedPrintArea.y - printAreaContainerWrapper.y - realPrintContainerBorderWidth
          }px;
        "
        class="NAME-print-area-allowed"
      >
        ${layoutMode !== "no-layout" && layout ? this.generateLayoutHTML(layout, files) : ""}
      </div>
    `
  }

  /**
   * Generate layout HTML
   */
  private generateLayoutHTML(layout: TPrintLayout, files: TMulterFiles): string {
    if (!layout.slotConfigs?.length) return ""

    const slots = layout.slotConfigs
      .map((slot) => {
        const styleStr = this.styleObjectToString(slot.style)
        const placedImage = slot.placedImage
        const imageHTML = placedImage
          ? `<img
              style="object-fit: ${placedImage.isOriginalFrameImage ? "contain" : "cover"};"
              class="NAME-frame-placed-image"
              src="${this.escapeHtml(this.toStoredURL(placedImage.url, files))}"
              alt="Slot ${slot.id}"
            />`
          : ""

        return `
          <div class="NAME-layout-slot" style="${styleStr}">
            ${imageHTML}
          </div>
        `
      })
      .join("\n")

    const slotsContainerStyle = this.styleObjectToString(layout.layoutContainerConfigs.style)
    return `
      <div
        data-layout-type="${layout.layoutType}"
        style="${slotsContainerStyle}"
        class="NAME-slots-displayer"
      >
        ${slots}
      </div>
    `
  }

  /**
   * Generate base style for element
   */
  private initRootElementBaseStyle(element: TElementVisualBaseState, type: TElementType): string {
    const { position, scale, angle, zindex, height, width } = element

    let styles: Record<string, string> = {}
    if (position) {
      styles.left = `${position.x}px`
      styles.top = `${position.y}px`
    }
    if (zindex) styles["z-index"] = `${zindex}`
    if (width) {
      if (type === "text") styles.width = "auto"
      else styles.width = `${width}px`
    }
    if (height) styles.height = `${height}px`

    let transforms: string[] = []
    if (scale && scale !== 1) transforms.push(`scale(${scale})`)
    if (angle && angle !== 0) transforms.push(`rotate(${angle}deg)`)
    if (transforms.length > 0) styles.transform = transforms.join(" ")

    let styleString = this.styleObjectToString(styles)

    return styleString
  }

  private initElementDisplayImageStyle = (grayscale?: number): string => {
    let imgStyle = ""
    if (grayscale && grayscale > 0) {
      imgStyle = `filter: grayscale(${grayscale}%)`
    }
    return imgStyle
  }

  private initElementMainBoxStyle = (element: TElementVisualBaseState): string => {
    const { clippath } = element
    let styles: Record<string, string> = {}
    if (clippath) {
      styles["clip-path"] = clippath
    }
    let styleString = this.styleObjectToString(styles)
    return styleString
  }

  /**
   * Generate printed-image element
   */
  private generatePrintedImageElement(
    element: TPrintedImageVisualState,
    files: TMulterFiles
  ): string {
    const fileUrl = this.toStoredURL(element.path, files)
    const baseStyle = this.initRootElementBaseStyle(element, "printed-image")
    const imgStyle = this.initElementDisplayImageStyle(element.grayscale)
    const mainBoxStyle = this.initElementMainBoxStyle(element)
    return `
      <div
        ${baseStyle ? `style="${baseStyle}"` : ""}
        class="NAME-root-element NAME-element-type-printed-image"
      >
        <div ${mainBoxStyle ? `style="${mainBoxStyle}"` : ""} class="NAME-element-main-box">
          <img
            class="NAME-element-display"
            src="${this.escapeHtml(fileUrl)}"
            alt="Printed Image ${element.id}"
            ${imgStyle ? `style="${imgStyle}"` : ""}
          />
        </div>
      </div>
    `
  }

  /**
   * Generate sticker element
   */
  private generateStickerElement(element: TStickerVisualState, files: TMulterFiles): string {
    const fileUrl = this.toStoredURL(element.path, files)
    const baseStyle = this.initRootElementBaseStyle(element, "sticker")
    const imgStyle = this.initElementDisplayImageStyle(element.grayscale)
    const mainBoxStyle = this.initElementMainBoxStyle(element)
    return `
      <div
        ${baseStyle ? `style="${baseStyle}"` : ""}
        class="NAME-root-element NAME-element-type-sticker"
      >
        <div ${mainBoxStyle ? `style="${mainBoxStyle}"` : ""} class="NAME-element-main-box">
          <img
          class="NAME-element-display"
          src="${domains.publicAssetsEndpoint}${this.escapeHtml(fileUrl)}"
          alt="Sticker ${element.id}"
          ${imgStyle ? `style="${imgStyle}"` : ""}
        />
        </div>
      </div>
    `
  }

  /**
   * Generate text element
   */
  private generateTextElement(element: TTextVisualState): string {
    const baseStyle = this.initRootElementBaseStyle(element, "text")
    const mainBoxStyle = this.initElementMainBoxStyle(element)
    const textStyles = [
      `color: ${element.textColor}`,
      `font-family: ${element.fontFamily}`,
      `font-weight: ${element.fontWeight}`,
      element.fontSize ? `font-size: ${element.fontSize}px` : "",
    ]
      .filter((rule) => rule)
      .join("; ")
    return `
      <div
        ${baseStyle ? `style="${baseStyle}"` : ""}
        class="NAME-root-element NAME-element-type-text"
      >
        <div
          ${mainBoxStyle ? `style="${mainBoxStyle}"` : ""}
          class="NAME-element-main-box NAME-main-box-text"
        >
          <p style="${textStyles}" class="NAME-displayed-text-content">
            ${this.escapeHtml(element.content)}
          </p>
        </div>
      </div>
    `
  }

  /**
   * Convert style object to string
   * @param styleObj Style object
   * @returns Style string
   */
  private styleObjectToString(styleObj: TReactCSSProperties): string {
    let result = ""
    for (const key in styleObj) {
      const value = styleObj[key]
      if (value) {
        if (result) result += "; "
        result += `${this.camelToKebab(key)}: ${value}`
      }
    }
    return result
  }

  /**
   * Convert camelCase to kebab-case
   * @param str Input string
   * @returns Kebab-case string
   */
  private camelToKebab(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
  }

  /**
   * Escape HTML to prevent XSS
   * @param text Input text
   * @returns Escaped text
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }
    return text.replace(/[&<>"']/g, (m) => map[m])
  }

  /**
   * Save generated HTML to a file
   * @param html Generated HTML content
   * @param mockupId Identifier for the mockup
   * @returns Path to the saved HTML file
   */
  private async saveHTMLToFile(html: string, mockupId: TMockupId): Promise<string> {
    const pathToStoredFileDir = mockupStoredFilesManager.getMockupStoragePath(mockupId)
    if (!pathToStoredFileDir) {
      throw new Error("Invalid stored file path")
    }
    const dirToStore = `${pathToStoredFileDir}/html`
    await mkdir(dirToStore, { recursive: true })
    const htmlFileName = `mockup--${mockupId}.html`
    const htmlFilePath = path.join(dirToStore, htmlFileName)
    await writeFile(htmlFilePath, html)
    return htmlFilePath
  }
}

export const htmlGeneratorService = new HtmlGeneratorService()
