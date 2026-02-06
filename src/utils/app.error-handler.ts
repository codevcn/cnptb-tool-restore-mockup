import { NextFunction, Request, Response } from "express"

class AppErrorHandler {
  handleUncaughtError() {
    process.on("uncaughtException", (err) => {
      console.error("Uncaught Exception:", err)
      process.exit(1)
    })
  }

  handleUnhandledRejection() {
    process.on("unhandledRejection", (reason) => {
      console.error("Unhandled Rejection:", reason)
      process.exit(1)
    })
  }

  handleInternalError(error: any, req: Request, res: Response, next: NextFunction) {
    console.log(">>> App Error:", error)
    res.status(error.statusCode || 500).json({
      message: error.message || "Internal Server Error",
      error: error.message,
    })
  }
}

export const appErrorHandler = new AppErrorHandler()
