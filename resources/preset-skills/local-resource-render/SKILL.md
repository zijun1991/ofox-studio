---
name: local-resource-render
description: 指导如何在对话中正确渲染本地多媒体资源（图片、视频、音频、PDF 等）。当需要向用户展示、预览、显示本地文件时使用此 skill。
---

# 本地资源渲染

在对话中向用户展示本地多媒体资源（图片、视频、音频、PDF 等）的完整规范。

## 适用场景

- 用户要求展示、预览、查看本地图片或截图
- 需要在回复中嵌入本地视频、音频播放器
- 展示 PDF 文档预览
- 任何需要在 Markdown 消息中引用本地文件的场景

## 核心原理

用户的对话界面是一个 Electron 应用内的 Markdown 渲染器。本地文件无法通过 `file://` 协议访问，必须通过内置的 file-reader API 代理访问。渲染器使用 `react-markdown` + `rehype-raw`，对 HTML 标签的支持有特定限制。

## 路径构建规则

### API 端点

所有本地文件通过以下 API 访问：

```
{apiBaseUrl}/internal/file-reader/{绝对路径}
```

系统提示中已提供 `apiBaseUrl`，直接使用即可。

### 路径处理

1. **必须使用绝对路径**：将相对路径拼接当前工作目录得到绝对路径
2. **URL 编码**：路径中的空格和特殊字符需要进行 URL 编码
   - 空格 → `%20`
   - 中文字符 → 对应的 percent-encoding
   - 例：`/Users/test/my file.png` → `/Users/test/my%20file.png`
3. **不要添加前导斜杠**：API 路径已包含斜杠，直接拼接文件绝对路径
   - 正确：`{apiBaseUrl}/internal/file-reader/Users/zijun/photo.png`
   - 错误：`{apiBaseUrl}/internal/file-reader//Users/zijun/photo.png`

## 各类型文件渲染方式

### 图片（推荐使用 Markdown 语法）

使用 Markdown 图片语法可获得 **ImageViewer 增强功能**（预览、缩放、旋转、复制、下载），最大显示尺寸 500x500：

```markdown
![描述文字]({apiBaseUrl}/internal/file-reader/Users/zijun/screenshot.png)
```

也可以使用 HTML `<img>` 标签（但不会获得 ImageViewer 增强）：

```html
<div><img src="{apiBaseUrl}/internal/file-reader/Users/zijun/photo.jpg" alt="照片" /></div>
```

### 视频

**必须用 `<div>` 包裹**，否则渲染器无法解析：

```html
<div>
  <video controls width="600">
    <source src="{apiBaseUrl}/internal/file-reader/Users/zijun/demo.mp4" type="video/mp4" />
  </video>
</div>
```

### 音频

**必须用 `<div>` 包裹**：

```html
<div>
  <audio controls>
    <source src="{apiBaseUrl}/internal/file-reader/Users/zijun/music.mp3" type="audio/mpeg" />
  </audio>
</div>
```

### PDF

使用 `<embed>` 标签嵌入预览，**必须用 `<div>` 包裹**：

```html
<div>
  <embed src="{apiBaseUrl}/internal/file-reader/Users/zijun/document.pdf" type="application/pdf" width="100%" height="600" />
</div>
```

如果嵌入不可用，提供下载链接作为 fallback：

```markdown
[下载 document.pdf]({apiBaseUrl}/internal/file-reader/Users/zijun/document.pdf)
```

### 其他文件

对于不可直接渲染的文件，提供 Markdown 下载链接：

```markdown
[下载 data.zip]({apiBaseUrl}/internal/file-reader/Users/zijun/data.zip)
```

## 重要限制

### `<div>` 包裹要求

渲染器的 `rehype-raw`（HTML 解析插件）**仅在内容包含特定标签时才激活**。`<video>`、`<audio>`、`<embed>` 不在激活列表中，必须用 `<div>` 包裹才能触发 `rehype-raw` 解析。

激活 `rehype-raw` 的标签包括：`style`、`p`、`div`、`span`、`b`、`i`、`strong`、`em`、`ul`、`ol`、`li`、`table`、`tr`、`td`、`th`、`thead`、`tbody`、`h1-h6`、`blockquote`、`pre`、`code`、`br`、`hr`、`svg` 相关标签、`sub`、`sup`、`details`、`summary`。

### 禁止使用的标签

以下标签会被渲染器直接过滤，不会显示：

- `<iframe>` — 被禁止
- `<script>` — 被禁止

### 协议限制

渲染器的 URL 转换器仅允许以下协议：

- `http://` 和 `https://`（file-reader API 使用此协议）
- `data:image/png` 和 `data:image/jpeg`

**`file://` 协议不可用**，这是必须使用 file-reader API 的根本原因。

## 常见场景示例

### 展示代码生成的图表

```markdown
我已经生成了图表，请查看：

![销售数据图表]({apiBaseUrl}/internal/file-reader/Users/zijun/workspace/charts/sales-2024.png)
```

### 播放用户指定的视频

```markdown
这是你要求播放的视频：

<div>
  <video controls width="600">
    <source src="{apiBaseUrl}/internal/file-reader/Users/zijun/Videos/demo.mp4" type="video/mp4" />
  </video>
</div>
```

### 展示多张图片

```markdown
以下是处理后的图片对比：

| 处理前 | 处理后 |
|--------|--------|
| ![原图]({apiBaseUrl}/internal/file-reader/Users/zijun/before.png) | ![处理后]({apiBaseUrl}/internal/file-reader/Users/zijun/after.png) |
```

## 错误处理

| HTTP 状态码 | 含义 | 处理方式 |
|-------------|------|----------|
| 404 | 文件不存在 | 检查路径是否正确，是否使用了绝对路径 |
| 403 | 权限不足 | 提示用户检查文件权限 |
| 400 | 路径是目录 | 检查路径是否指向具体文件而非目录 |
| 500 | 服务器错误 | 提示用户重试或检查文件是否损坏 |

## 注意事项

- 优先使用 Markdown `![](url)` 语法展示图片，可获得 ImageViewer 增强体验
- `<video>`、`<audio>`、`<embed>` 标签**必须**用 `<div>` 包裹
- **不要**使用 `<iframe>` 或 `<script>` 标签
- **不要**使用 `file://` 协议
- 路径中有空格或特殊字符时，务必进行 URL 编码
- file-reader API 会自动检测文件 MIME 类型并设置正确的 Content-Type
