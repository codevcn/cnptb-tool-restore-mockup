declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PORT: string
      NODE_ENV: "development"
      PUBLIC_ASSETS_ENDPOINT: string
      SERVER_ENDPOINT: string
    }
  }
}

export {}
