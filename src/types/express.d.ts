declare global {
  namespace Express {
    interface Request {
      mockupId?: string
    }
  }
}

export {}
