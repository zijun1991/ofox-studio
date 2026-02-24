import './styles.css'

import { useMemoizedFn } from 'ahooks'
import Quill from 'quill'
import React, { useEffect, useImperativeHandle, useRef, useState } from 'react'
import styled from 'styled-components'

// Quill 内部类型
interface QuillRange {
  index: number
  length: number
}

// Path Blot 类型定义
interface PathBlotValue {
  path: string
  type: 'directory' | 'file' | 'unknown'
  name: string
}

// 声明 Quill Embed 类型
interface EmbedBlotClass {
  new (): EmbedBlotInstance
  blotName: string
  tagName: string
  className: string
  create(value: PathBlotValue): HTMLElement
  value(node: HTMLElement): string
}

interface EmbedBlotInstance {
  domNode: HTMLElement
}

// 导入 Quill 的 Embed blot
const Embed = Quill.import('blots/embed') as EmbedBlotClass

// Path Blot - 自定义 blot 用于显示文件/目录路径
class PathBlot extends (Embed as unknown as { new (): EmbedBlotInstance }) {
  static blotName = 'path'
  static tagName = 'span'
  static className = 'ql-path-tag'

  static create(value: PathBlotValue): HTMLElement {
    const node = document.createElement('span')

    // 设置数据属性
    node.setAttribute('data-path', value.path)
    node.setAttribute('data-type', value.type)
    node.setAttribute('data-name', value.name)

    // 添加样式类
    node.classList.add('ql-path-tag')
    node.classList.add(value.type === 'unknown' ? 'path-unknown' : 'path-exists')

    // 构建内容
    const typeSpan = document.createElement('span')
    typeSpan.className = 'path-type-prefix'
    typeSpan.textContent = value.type === 'directory' ? '目录:' : value.type === 'file' ? '文件:' : '未知:'

    const nameSpan = document.createElement('span')
    nameSpan.className = 'path-name'
    nameSpan.textContent = value.name

    node.appendChild(typeSpan)
    node.appendChild(nameSpan)

    // 添加 tooltip
    const tooltip = document.createElement('div')
    tooltip.className = 'path-tooltip'
    tooltip.textContent = value.path
    node.appendChild(tooltip)

    // 添加 tooltip 箭头
    const tooltipArrow = document.createElement('div')
    tooltipArrow.className = 'path-tooltip-arrow'
    node.appendChild(tooltipArrow)

    // 鼠标进入时计算并设置 tooltip 位置
    node.addEventListener('mouseenter', () => {
      const rect = node.getBoundingClientRect()
      const tooltipEl = node.querySelector('.path-tooltip') as HTMLElement
      const arrowEl = node.querySelector('.path-tooltip-arrow') as HTMLElement

      if (tooltipEl) {
        // 计算 tooltip 位置：在 tag 上方居中
        const tooltipRect = tooltipEl.getBoundingClientRect()
        const top = rect.top - tooltipRect.height - 6 // 6px 间距
        const left = rect.left + rect.width / 2 - tooltipRect.width / 2

        tooltipEl.style.top = `${top}px`
        tooltipEl.style.left = `${Math.max(10, left)}px`
      }

      if (arrowEl) {
        // 箭头位置：在 tag 上方居中
        const arrowTop = rect.top - 6 // 6px 间距
        const arrowLeft = rect.left + rect.width / 2 - 5 // 5px 是箭头宽度的一半

        arrowEl.style.top = `${arrowTop}px`
        arrowEl.style.left = `${arrowLeft}px`
      }
    })

    // 阻止编辑
    node.setAttribute('contenteditable', 'false')

    return node
  }

  static value(node: HTMLElement): string {
    return node.getAttribute('data-path') || ''
  }
}

// 注册 PathBlot
Quill.register('formats/path', PathBlot)

// 模拟 HTMLTextAreaElement 的接口
interface MockTextArea extends HTMLDivElement {
  value: string
  selectionStart: number
  selectionEnd: number
  setSelectionRange(start: number, end: number): void
  scrollTo(x: number, y: number): void
  scrollTo(options: ScrollToOptions): void
}

// 样式容器
const EditorContainer = styled.div<{
  $variant?: 'outlined' | 'borderless' | 'filled'
  $disabled?: boolean
  $focused?: boolean
}>`
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  background-color: transparent;
  transition: all 0.2s ease;

  /* 变体样式 - outlined (默认) */
  border: 0.5px solid var(--color-border);
  border-radius: 6px;

  &:hover {
    border-color: var(--color-primary);
  }

  &.focused {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px var(--color-primary-mute);
  }

  /* 变体样式 - borderless */
  &.borderless,
  &[data-variant='borderless'] {
    border: none;
    background-color: transparent;
  }

  &.borderless.focused,
  &[data-variant='borderless'].focused {
    box-shadow: none;
  }

  /* 变体样式 - filled */
  &.filled,
  &[data-variant='filled'] {
    border: none;
    background-color: var(--color-background-soft);
  }

  &.filled:hover,
  &[data-variant='filled']:hover {
    background-color: var(--color-hover);
  }

  &.filled.focused,
  &[data-variant='filled'].focused {
    background-color: var(--color-background);
    box-shadow: 0 0 0 2px var(--color-primary-mute);
  }

  /* 禁用状态 */
  &.disabled {
    background-color: var(--color-background-soft);
    cursor: not-allowed;
    opacity: 0.6;
  }
`

// TextArea 样式类型
export interface TextAreaStyleProps {
  fontSize?: number | string
  height?: number | string
  minHeight?: number | string
  maxHeight?: number | string
  resize?: 'none' | 'both' | 'horizontal' | 'vertical'
}

// 模拟 ChangeEvent
interface MockChangeEvent {
  target: {
    value: string
  }
  currentTarget: {
    value: string
  }
}

// 与 Ant Design TextArea 一致的 props 接口
export interface MessageInputProps {
  /** 输入框内容 */
  value?: string
  /** 输入框占位符 */
  placeholder?: string
  /** 是否自动聚焦 */
  autoFocus?: boolean
  /** 是否禁用 */
  disabled?: boolean
  /** 是否只读 */
  readOnly?: boolean
  /** 是否显示边框（已废弃，使用 variant） */
  bordered?: boolean
  /** 变体样式 */
  variant?: 'outlined' | 'borderless' | 'filled'
  /** 行数（仅用于计算最小高度） */
  rows?: number
  /** 是否自动调整高度 */
  autoSize?: boolean | { minRows?: number; maxRows?: number }
  /** 是否启用拼写检查 */
  spellCheck?: boolean
  /** 最大长度 */
  maxLength?: number
  /** 输入框样式 */
  style?: React.CSSProperties
  /** textarea 样式 */
  styles?: { textarea?: React.CSSProperties }
  /** 自定义类名 */
  className?: string
  /** 内容变化回调 - 兼容 TextArea 的签名 */
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement> | MockChangeEvent) => void
  /** 键盘事件回调 */
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void
  /** 聚焦回调 */
  onFocus?: (e: React.FocusEvent<HTMLDivElement>) => void
  /** 失焦回调 */
  onBlur?: (e: React.FocusEvent<HTMLDivElement>) => void
  /** 粘贴事件回调 */
  onPaste?: (e: React.ClipboardEvent<HTMLDivElement>) => void
  /** 输入事件回调 */
  onInput?: (e: React.FormEvent<HTMLDivElement>) => void
  /** 点击事件回调 */
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void
  /** 右键菜单事件回调 */
  onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void
  /** 按下回车回调 */
  onPressEnter?: (e: React.KeyboardEvent<HTMLDivElement>) => void
}

// 暴露的方法接口 - 兼容 Ant Design TextAreaRef
export interface MessageInputRef {
  /** 聚焦输入框 - 支持 options */
  focus: (options?: { cursor?: 'start' | 'end' | 'all' }) => void
  /** 失焦输入框 */
  blur: () => void
  /** 获取 Quill 实例 */
  getEditor: () => Quill | null
  /** 获取选中的文本 */
  getSelectedText: () => string
  /** 插入文本 */
  insertText: (index: number, text: string, formats?: Record<string, unknown>) => void
  /** 设置选区 */
  setSelection: (index: number, length?: number) => void
  /** 获取选区 */
  getSelection: () => { index: number; length: number } | null
  /** 获取内容长度 */
  getLength: () => number
  /** 清空内容 */
  clear: () => void
  /** 插入路径标签 */
  insertPath: (absolutePath: string) => Promise<void>
  /** 模拟 TextArea 的 resizableTextArea.textArea 结构 */
  resizableTextArea?: {
    textArea: MockTextArea
  }
}

// 计算行高（像素）
const calculateLineHeight = (fontSize: number | string = 14): number => {
  const size = typeof fontSize === 'string' ? parseInt(fontSize, 10) || 14 : fontSize
  return Math.round(size * 1.5)
}

// 计算最小/最大高度
const calculateHeight = (rows: number, fontSize: number | string, padding: number = 8): number => {
  const lineHeight = calculateLineHeight(fontSize)
  return rows * lineHeight + padding * 2
}

export const MessageInput = ({
  ref,
  value = '',
  placeholder = '',
  autoFocus = false,
  disabled = false,
  readOnly = false,
  variant = 'outlined',
  rows = 2,
  autoSize = false,
  spellCheck = true,
  maxLength,
  style = {},
  styles = {},
  className = '',
  onChange,
  onKeyDown,
  onFocus,
  onBlur,
  onPaste,
  onInput,
  onClick,
  onContextMenu,
  onPressEnter
}: MessageInputProps & { ref?: React.RefObject<MessageInputRef | null> }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const quillRef = useRef<Quill | null>(null)
  const mockTextAreaRef = useRef<MockTextArea | null>(null)
  const [isFocused, setIsFocused] = useState(false)
  const internalValueRef = useRef(value)
  const isUpdatingRef = useRef(false)

  // 提取样式属性
  const textareaStyle = styles.textarea || {}
  const fontSize = (style.fontSize || textareaStyle.fontSize || 14) as number | string
  const lineHeight = calculateLineHeight(fontSize)

  // 计算高度
  const getHeightConfig = () => {
    const padding = 8
    let minRows = rows
    let maxRows: number | undefined

    if (typeof autoSize === 'object') {
      minRows = autoSize.minRows || rows
      maxRows = autoSize.maxRows
    } else if (autoSize === true) {
      minRows = 2
      maxRows = 20
    }

    const minHeight = calculateHeight(minRows, fontSize, padding)
    const maxHeight = maxRows ? calculateHeight(maxRows, fontSize, padding) : undefined

    return { minHeight, maxHeight }
  }

  const { minHeight, maxHeight } = getHeightConfig()

  // 辅助函数：将 Delta 转换为纯文本，包含 embed 的 value
  const deltaToText = (delta: { ops?: Array<{ insert?: string | object }> }): string => {
    if (!delta || !delta.ops) return ''

    return delta.ops
      .map((op) => {
        if (typeof op.insert === 'string') {
          return op.insert
        }
        // 处理 embed（如 path blot）
        if (typeof op.insert === 'object' && op.insert !== null) {
          // 对于 path blot，返回其 path 值，前后加空格
          const embed = op.insert as { path?: string }
          return embed.path ? ` ${embed.path} ` : ''
        }
        return ''
      })
      .join('')
      .replace(/\n$/, '') // 移除末尾换行符
  }

  // 创建 MockTextArea 对象
  const createMockTextArea = (editorElement: HTMLDivElement): MockTextArea => {
    const mock = editorElement as MockTextArea

    Object.defineProperty(mock, 'value', {
      get: () => {
        const quill = quillRef.current
        if (!quill) {
          return ''
        }
        // 使用 getContents 获取 Delta，然后转换为文本（包含 embed value）
        const delta = quill.getContents()
        const text = deltaToText(delta as { ops?: Array<{ insert?: string | object }> })
        return text
      },
      set: (newValue: string) => {
        if (quillRef.current) {
          quillRef.current.setText(newValue)
        }
      },
      configurable: true
    })

    Object.defineProperty(mock, 'selectionStart', {
      get: () => quillRef.current?.getSelection()?.index || 0,
      configurable: true
    })

    Object.defineProperty(mock, 'selectionEnd', {
      get: () => {
        const selection = quillRef.current?.getSelection()
        return selection ? selection.index + selection.length : 0
      },
      configurable: true
    })

    mock.setSelectionRange = (start: number, end: number) => {
      const length = end - start
      quillRef.current?.setSelection(start, length, 'user')
    }

    mock.scrollTo = (xOrOptions: number | ScrollToOptions, y?: number) => {
      if (typeof xOrOptions === 'number' && y !== undefined) {
        editorElement.scrollTo(xOrOptions, y)
      } else if (typeof xOrOptions === 'object') {
        editorElement.scrollTo(xOrOptions)
      }
    }

    return mock
  }

  // 初始化 Quill
  useEffect(() => {
    if (!editorRef.current || quillRef.current) return

    const quill = new Quill(editorRef.current, {
      theme: 'snow',
      placeholder,
      readOnly: disabled || readOnly,
      modules: {
        toolbar: false,
        keyboard: {
          bindings: {
            enter: {
              key: 'Enter',
              shiftKey: false,
              handler: () => {
                return true
              }
            },
            'shift enter': {
              key: 'Enter',
              shiftKey: true,
              handler: (range: QuillRange) => {
                const quill = quillRef.current
                if (quill) {
                  quill.insertText(range.index, '\n', 'user')
                  quill.setSelection(range.index + 1, 0, 'user')
                }
                return false
              }
            }
          }
        }
      },
      formats: ['path']
    })
    quillRef.current = quill

    // 创建 MockTextArea
    if (editorRef.current) {
      mockTextAreaRef.current = createMockTextArea(editorRef.current)
    }

    if (value) {
      quill.setText(value)
    }

    quill.on('text-change', (_delta, _oldDelta, source) => {
      if (source === 'user' && !isUpdatingRef.current) {
        // 使用 getContents 获取 Delta，然后转换为文本（包含 embed value）
        const fullDelta = quill.getContents()
        const text = deltaToText(fullDelta as { ops?: Array<{ insert?: string | object }> })
        internalValueRef.current = text

        // 应用 maxLength 限制
        if (maxLength && text.length > maxLength) {
          const truncated = text.slice(0, maxLength)
          quill.setText(truncated)
          internalValueRef.current = truncated
        }

        const mockEvent: MockChangeEvent = {
          target: { value: internalValueRef.current },
          currentTarget: { value: internalValueRef.current }
        }
        onChange?.(mockEvent)
      }
    })

    quill.on('selection-change', (range, _oldRange, source) => {
      if (range && source === 'user') {
        setIsFocused(true)
      }
    })

    if (autoFocus) {
      quill.focus()
    }

    return () => {
      quill.off('text-change', () => {})
      quill.off('selection-change', () => {})
      quillRef.current = null
      mockTextAreaRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 同步外部 value 变化
  useEffect(() => {
    const quill = quillRef.current
    if (!quill || value === internalValueRef.current) return

    isUpdatingRef.current = true
    const currentText = quill.getText().replace(/\n$/, '')

    if (value !== currentText) {
      const selection = quill.getSelection()
      quill.setText(value || '')
      internalValueRef.current = value

      if (selection) {
        const newIndex = Math.min(selection.index, quill.getLength() - 1)
        quill.setSelection(newIndex, 0, 'silent')
      }
    }
    isUpdatingRef.current = false
  }, [value])

  // 更新 placeholder
  useEffect(() => {
    if (quillRef.current) {
      const root = quillRef.current.root
      root.setAttribute('data-placeholder', placeholder)
    }
  }, [placeholder])

  // 更新禁用状态
  useEffect(() => {
    if (quillRef.current) {
      quillRef.current.enable(!disabled && !readOnly)
    }
  }, [disabled, readOnly])

  // 暴露方法
  useImperativeHandle(ref, () => ({
    focus: (options?: { cursor?: 'start' | 'end' | 'all' }) => {
      const quill = quillRef.current
      if (!quill) return

      quill.focus()

      if (options?.cursor) {
        const length = quill.getLength()
        switch (options.cursor) {
          case 'start':
            quill.setSelection(0, 0, 'user')
            break
          case 'end':
            quill.setSelection(length - 1, 0, 'user')
            break
          case 'all':
            quill.setSelection(0, length - 1, 'user')
            break
        }
      }
    },
    blur: () => {
      if (quillRef.current) {
        const root = quillRef.current.root
        root.blur()
      }
    },
    getEditor: () => quillRef.current,
    getSelectedText: () => {
      const quill = quillRef.current
      if (!quill) return ''
      const selection = quill.getSelection()
      if (!selection) return ''
      return quill.getText(selection.index, selection.length)
    },
    insertText: (index: number, text: string, formats?: Record<string, unknown>) => {
      if (quillRef.current) {
        quillRef.current.insertText(index, text, formats || {}, 'user')
      }
    },
    setSelection: (index: number, length: number = 0) => {
      quillRef.current?.setSelection(index, length, 'user')
    },
    getSelection: () => {
      const selection = quillRef.current?.getSelection()
      return selection ? { index: selection.index, length: selection.length } : null
    },
    getLength: () => {
      return quillRef.current?.getLength() || 0
    },
    clear: () => {
      quillRef.current?.setText('')
    },
    insertPath: async (absolutePath: string) => {
      const quill = quillRef.current
      if (!quill) {
        return
      }

      // 获取路径名
      const pathParts = absolutePath.split(/[/\\]/)
      const name = pathParts[pathParts.length - 1] || absolutePath

      // 检查路径类型
      let type: 'directory' | 'file' | 'unknown' = 'unknown'
      try {
        const isDir = await window.api.file.isDirectory(absolutePath)
        type = isDir ? 'directory' : 'file'
      } catch {
        type = 'unknown'
      }

      // 获取当前选区
      const selection = quill.getSelection()
      const index = selection ? selection.index : quill.getLength() - 1

      // 插入路径 blot
      const embedValue = { path: absolutePath, type, name }
      quill.insertEmbed(index, 'path', embedValue, 'user')

      // 在 blot 后插入一个空格
      quill.insertText(index + 1, ' ', 'user')

      // 移动光标到空格后
      quill.setSelection(index + 2, 0, 'user')
    },
    resizableTextArea: mockTextAreaRef.current
      ? {
          textArea: mockTextAreaRef.current
        }
      : undefined
  }))

  // 处理键盘事件
  const handleKeyDown = useMemoizedFn((e: React.KeyboardEvent<HTMLDivElement>) => {
    const quill = quillRef.current

    // 处理退格键删除 path blot
    if (e.key === 'Backspace' && quill) {
      const selection = quill.getSelection()
      if (selection && selection.length === 0 && selection.index > 0) {
        // 获取当前光标前一个位置的 blot
        const [blot] = quill.getLeaf(selection.index - 1)
        if (blot && blot.domNode) {
          const node = blot.domNode as HTMLElement
          // 检查是否是 path blot
          if (node.classList?.contains('ql-path-tag') || node.closest?.('.ql-path-tag')) {
            e.preventDefault()
            e.stopPropagation()

            // 找到 path blot 的父节点（embed blot）
            const pathNode = node.classList?.contains('ql-path-tag') ? node : node.closest('.ql-path-tag')
            if (pathNode) {
              // 获取 blot 的索引
              const blotIndex = quill.getIndex(blot)
              // 删除整个 blot（长度为 1）
              quill.deleteText(blotIndex, 1, 'user')
              // 删除后面的空格（如果存在）
              const text = quill.getText(blotIndex, 1)
              if (text === ' ') {
                quill.deleteText(blotIndex, 1, 'user')
              }
              // 设置光标位置
              quill.setSelection(blotIndex, 0, 'user')
            }
            return
          }
        }
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      onPressEnter?.(e)
    }
    onKeyDown?.(e)
  })

  // 处理聚焦
  const handleFocus = useMemoizedFn((e: React.FocusEvent<HTMLDivElement>) => {
    setIsFocused(true)
    onFocus?.(e)
  })

  // 处理失焦
  const handleBlur = useMemoizedFn((e: React.FocusEvent<HTMLDivElement>) => {
    setIsFocused(false)
    onBlur?.(e)
  })

  // 处理粘贴
  const handlePaste = useMemoizedFn((e: React.ClipboardEvent<HTMLDivElement>) => {
    onPaste?.(e)
  })

  // 处理输入
  const handleInput = useMemoizedFn((e: React.FormEvent<HTMLDivElement>) => {
    onInput?.(e)
  })

  // 处理点击
  const handleClick = useMemoizedFn((e: React.MouseEvent<HTMLDivElement>) => {
    onClick?.(e)
  })

  // 处理右键菜单
  const handleContextMenu = useMemoizedFn((e: React.MouseEvent<HTMLDivElement>) => {
    onContextMenu?.(e)
  })

  // 计算容器样式
  const containerStyle: React.CSSProperties = {
    ...style,
    minHeight,
    maxHeight,
    fontSize,
    lineHeight: `${lineHeight}px`
  }

  return (
    <EditorContainer
      ref={containerRef}
      className={`message-input ${className} ${isFocused ? 'focused' : ''} ${disabled ? 'disabled' : ''} ${variant}`}
      $variant={variant}
      $disabled={disabled}
      $focused={isFocused}
      data-variant={variant}
      style={containerStyle}>
      <div
        ref={editorRef}
        className="quill-editor"
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onPaste={handlePaste}
        onInput={handleInput}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        spellCheck={spellCheck}
        style={{
          ...textareaStyle,
          minHeight,
          maxHeight: maxHeight || 'none',
          fontSize,
          lineHeight: `${lineHeight}px`
        }}
      />
    </EditorContainer>
  )
}

MessageInput.displayName = 'MessageInput'

export default MessageInput
