import "./types"
import "dotenv/config"
import express, { NextFunction, Request, Response } from "express"
import cors from "cors"
import path from "path"
import mockupRoutes from "./routes/mockup.routes"
import { HttpStatusCode } from "axios"

const app = express()
const PORT = process.env.PORT || 4000

// Middleware
app.use(
  cors({
    origin: "*",
  })
)
app.use(express.json({ limit: "50mb" }))
app.use(express.urlencoded({ extended: true, limit: "50mb" }))

// Static files - Match với URL từ client
app.use("/storage/uploads", express.static(path.join(__dirname, "..", "storage", "uploads")))

// Routes
app.use("/api/mockup", mockupRoutes)

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: Date.now() })
})

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(">>> Server error:", err)
  res.status(500).json({
    success: false,
    error: {
      code: HttpStatusCode.InternalServerError,
      message: err.message || "Internal server error",
    },
  })
})

// Initialize và start server
async function start() {
  app.listen(PORT, () => {
    console.log(`>>> ✅ Server running on http://localhost:${PORT}`)
  })
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n>>> 🛑 Shutting down server...")
  process.exit(0)
})

process.on("SIGTERM", async () => {
  console.log("\n>>> 🛑 Shutting down server...")
  process.exit(0)
})

start()
