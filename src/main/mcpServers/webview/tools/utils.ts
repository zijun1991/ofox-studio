export function successResponse(text: string) {
  return {
    content: [{ type: 'text', text }],
    isError: false
  }
}

export function errorResponse(error: Error | string) {
  const message = error instanceof Error ? error.message : error
  return {
    content: [{ type: 'text', text: message }],
    isError: true
  }
}

export function jsonResponse(data: unknown) {
  return successResponse(JSON.stringify(data, null, 2))
}

export function imageResponse(base64: string, mimeType = 'image/png') {
  return {
    content: [{ type: 'image', data: base64, mimeType }],
    isError: false
  }
}
