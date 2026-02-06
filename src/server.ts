import "./types"
import "dotenv/config"
import express from "express"
import cors from "cors"
import path from "path"
import mockupRoutes from "./routes/mockup.routes"
import { EClientRequestHeaders } from "./configs/contants"
import { appErrorHandler } from "./utils/app.error-handler"

const PORT = process.env.PORT || "4000"
const LISTEN_ADDRESS = "0.0.0.0"

const app = express()

// Middleware
app.use(
  cors({
    origin: [
      "https://connect-photobooth-demo-ptm.vercel.app",
      "https://connect-photobooth-ptm.vercel.app",
      "https://project-to-test-api.vercel.app",
      "https://hoppscotch.io",
      "http://localhost:3000",
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", EClientRequestHeaders.FROM_LOCATION],
  }),
)
app.use(express.json({ limit: "50mb" }))
app.use(express.urlencoded({ extended: true, limit: "50mb" }))

// Static files - Match với URL từ client
app.use("/storage/uploads", express.static(path.join(__dirname, "..", "storage", "uploads")))

// Routes
app.use("/api/v1/mockup", mockupRoutes)

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: Date.now() })
})

app.use(appErrorHandler.handleInternalError)

function start() {
  app.listen(parseInt(PORT), LISTEN_ADDRESS, () => {
    console.log(`>>> Server running at http://${LISTEN_ADDRESS}:${PORT}`)
  })
}

appErrorHandler.handleUncaughtError()
appErrorHandler.handleUnhandledRejection()

start()
