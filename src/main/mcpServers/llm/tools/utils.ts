export function successResponse(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
    isError: false
  }
}

export function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true
  }
}

export function jsonResponse(data: unknown) {
  return successResponse(JSON.stringify(data, null, 2))
}
