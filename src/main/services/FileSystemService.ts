import { readTextFileWithAutoEncoding } from '@main/utils/file'
import { TraceMethod } from '@mcp-trace/trace-core'
import fs from 'fs/promises'

export default class FileService {
  @TraceMethod({ spanName: 'readFile', tag: 'FileService' })
  public static async readFile(_: Electron.IpcMainInvokeEvent, pathOrUrl: string, encoding?: BufferEncoding) {
    const path = pathOrUrl.startsWith('file://') ? new URL(pathOrUrl) : pathOrUrl
    if (encoding) return fs.readFile(path, { encoding })
    return fs.readFile(path)
  }

  /**
   * 自动识别编码，读取文本文件
   * @param _ event
   * @param pathOrUrl
   * @throws 路径不存在时抛出错误
   */
  @TraceMethod({ spanName: 'readTextFileWithAutoEncoding', tag: 'FileService' })
  public static async readTextFileWithAutoEncoding(_: Electron.IpcMainInvokeEvent, path: string): Promise<string> {
    return readTextFileWithAutoEncoding(path)
  }

  /**
   * 检查文件或目录是否存在
   * @param _ event
   * @param filePath 文件或目录路径
   * @returns 如果存在返回 true，否则返回 false
   */
  @TraceMethod({ spanName: 'exists', tag: 'FileService' })
  public static async exists(_: Electron.IpcMainInvokeEvent, filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }
}
