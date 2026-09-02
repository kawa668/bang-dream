export type RequestId = string

export function createRequestId(prefix: string): RequestId {
  const random = Math.random().toString(36).slice(2, 10)
  return `${prefix}-${Date.now().toString(36)}-${random}`
}
