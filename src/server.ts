import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import path from "path"
import mockupRoutes from "./routes/mockup.routes"

// Load env
dotenv.config()

const app = express()
const PORT = process.env.PORT || 4000

// Middleware
app.use(cors())
app.use(express.json({ limit: "50mb" }))
app.use(express.urlencoded({ extended: true, limit: "50mb" }))

// Static files - Match với URL từ client
app.use("/storage/uploads", express.static(path.join(__dirname, "..", "storage", "uploads")))
app.use("/storage/canvas", express.static(path.join(__dirname, "..", "storage", "canvas")))
app.use("/storage/html", express.static(path.join(__dirname, "..", "storage", "html")))

// Routes
app.use("/api/mockup", mockupRoutes)

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: Date.now() })
})

// Error handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error("Server error:", err)
  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: err.message || "Internal server error",
    },
  })
})

// Initialize và start server
async function start() {
  app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`)
    console.log(`📡 API endpoint: http://localhost:${PORT}/api/mockup/restore`)
  })
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down server...")
  process.exit(0)
})

process.on("SIGTERM", async () => {
  console.log("\n🛑 Shutting down server...")
  process.exit(0)
})

start()
