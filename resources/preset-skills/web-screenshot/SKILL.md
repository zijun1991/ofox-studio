---
name: web-screenshot
description: Take screenshots of web pages using the @ofox/webview MCP server. Use when the user asks to screenshot, capture, snapshot, or save an image of a webpage, website, or URL. Supports full-page capture, viewport-only capture, mobile viewport emulation, and batch screenshots.
---

# Web Screenshot

Take screenshots of web pages using the `@ofox/webview` MCP server tools.

## When to Use

- User asks to "screenshot", "capture", "snapshot", or "save an image of" a webpage
- User wants a visual record of a URL or website
- User needs to compare how pages look or verify page content visually
- User asks to capture a full page, specific viewport, or mobile view of a site

## Default Behavior

1. **Viewport capture by default** - Capture only the visible viewport area (1920x1080), not the full scrollable page, unless the user explicitly asks for full-page capture
2. **Default viewport 1920x1080** - Always create webview with `width: 1920, height: 1080`
3. **Save to file** - Save screenshots to the `screenshots/` subdirectory under the current working directory
4. **One-off webview** - Create a new webview, take the screenshot, then close the webview
5. **PNG format** - Use PNG format unless the user specifies otherwise
6. **Basic info only** - After capturing, provide only the basic image information (file path, size, dimensions) without displaying the image or performing any analysis

## Standard Screenshot Flow

Follow these 5 steps in order. All tools are from the `@ofox/webview` MCP server.

### Step 1: Create a webview and navigate to the URL

```
webview_create({ url: "<TARGET_URL>", name: "screenshot", width: 1920, height: 1080 })
```

Save the returned `id` as `WEBVIEW_ID`.

### Step 2: Wait for page load

Wait briefly (1-2 seconds) for dynamic content to render:

```
webview_evaluate({ webviewId: "WEBVIEW_ID", expression: "document.readyState" })
```

If the page has lazy-loaded content or SPAs, consider a longer wait:

```
webview_evaluate({
  webviewId: "WEBVIEW_ID",
  expression: "new Promise(r => setTimeout(r, 2000)).then(() => document.readyState)"
})
```

### Step 3: Take the screenshot

Build the save path as an absolute path: `<CWD>/screenshots/<filename>.png`

```
webview_screenshot({
  webviewId: "WEBVIEW_ID",
  format: "png",
  savePath: "/absolute/path/to/screenshots/example-com.png"
})
```

The `savePath` **must** be an absolute path. The parent directory is created automatically.

### Step 4: Close the webview

```
webview_close({ webviewId: "WEBVIEW_ID" })
```

### Step 5: Provide basic image information

Return only the essential file information without displaying or analyzing the image:

```
Screenshot captured successfully:
- File: /absolute/path/to/screenshots/example-com.png
- Size: 1.2 MB
- Dimensions: 1920x1080 pixels
- Format: PNG
```

For batch screenshots, list all captured files:

```
Batch screenshots completed:
1. /absolute/path/to/screenshots/page-a.png (800x600, 450KB)
2. /absolute/path/to/screenshots/page-b.png (1920x1080, 1.1MB)
```

## Advanced Scenarios

### Full-Page Screenshot

When the user explicitly asks for a full-page or entire-page screenshot, expand the viewport to the full page dimensions before capturing:

1. After Step 2 (wait for page load), get full page dimensions:
   ```
   webview_evaluate({
     webviewId: "WEBVIEW_ID",
     expression: "JSON.stringify({ scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight })"
   })
   ```
2. Resize viewport to full page size via CDP:
   ```
   cdp_send({
     webviewId: "WEBVIEW_ID",
     method: "Emulation.setDeviceMetricsOverride",
     params: {
       width: <scrollWidth>,
       height: <scrollHeight>,
       deviceScaleFactor: 1,
       mobile: false
     }
   })
   ```
3. Then proceed with Steps 3-5 (screenshot, close, display).

### Custom Viewport Size

Specify `width` and `height` when creating the webview (default is 1920x1080):

```
webview_create({ url: "<URL>", width: 1440, height: 900 })
```

### Mobile Viewport Emulation

Create a narrower webview and use CDP to set mobile device metrics:

```
webview_create({ url: "<URL>", width: 375, height: 812, name: "mobile-screenshot" })
```

Then optionally set a mobile user agent via CDP:

```
cdp_send({
  webviewId: "WEBVIEW_ID",
  method: "Emulation.setDeviceMetricsOverride",
  params: { width: 375, height: 812, deviceScaleFactor: 3, mobile: true }
})
```

Then proceed with the standard screenshot flow (Steps 2-5).

### JPEG Format with Quality

```
webview_screenshot({
  webviewId: "WEBVIEW_ID",
  format: "jpeg",
  quality: 90,
  savePath: "/absolute/path/to/screenshots/example-com.jpg"
})
```

### Login-Required Pages

If the target page requires authentication:

1. Create the webview and navigate to the login page
2. Use `webview_input` to fill in credentials and submit
3. Wait for navigation to complete
4. Navigate to the target page
5. Proceed with the standard screenshot flow

### Batch Screenshots (Multiple URLs)

Reuse the same webview for multiple URLs to save resources:

1. `webview_create` once
2. For each URL:
   - `webview_navigate` to the URL
   - Wait for page load (Step 2), then screenshot (Step 3)
3. `webview_close` when all done

### Screenshot with Interaction

If you need to click, scroll, or interact before capturing:

1. Create webview and navigate
2. Use `webview_evaluate` to run JavaScript (click buttons, dismiss modals, scroll, etc.)
3. Wait for the desired state
4. Proceed with screenshot

## Tool Reference

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `webview_create` | Create a new webview | `url`, `name`, `width`, `height`, `userAgent`, `showWindow` |
| `webview_navigate` | Navigate to a URL | `webviewId`, `url`, `timeout` |
| `webview_evaluate` | Run JavaScript in page | `webviewId`, `expression`, `timeout` |
| `cdp_send` | Send raw CDP command | `webviewId`, `method`, `params` |
| `webview_screenshot` | Capture screenshot | `webviewId`, `format`, `quality`, `savePath` |
| `webview_close` | Destroy the webview | `webviewId` |
| `webview_input` | Simulate user input | `webviewId`, ... |

All tools belong to the `@ofox/webview` MCP server.

## Error Handling

| Problem | Solution |
|---------|----------|
| Page not fully loaded | Increase wait time in Step 2; use `Promise` with longer timeout |
| `savePath` error | Ensure the path is **absolute**, not relative |
| Webview limit reached (max 10) | Close unused webviews with `webview_close` or `webview_list` to check |
| CDP domain blocked | Only these domains are allowed: Page, Runtime, DOM, Network, Input, Storage, Emulation, Target, Console, Performance, Overlay, Fetch, CSS, Log |
| Dynamic content missing | Wait longer or use `webview_evaluate` to check for specific elements before capturing |
| Very tall page screenshot fails | Some pages may have extremely large scroll heights; consider capping height or splitting into sections |
