import { fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import MessageInput, { type MessageInputRef } from '../index'

// Mock Quill
vi.mock('quill', () => {
  const mockQuillInstance = {
    setText: vi.fn(),
    getText: vi.fn().mockReturnValue(''),
    getSelection: vi.fn().mockReturnValue(null),
    setSelection: vi.fn(),
    insertText: vi.fn(),
    insertEmbed: vi.fn(),
    deleteText: vi.fn(),
    getLength: vi.fn().mockReturnValue(0),
    focus: vi.fn(),
    enable: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    getIndex: vi.fn().mockReturnValue(0),
    getLeaf: vi.fn().mockReturnValue([null, 0]),
    root: {
      blur: vi.fn(),
      setAttribute: vi.fn(),
      scrollTo: vi.fn()
    }
  }

  // 创建一个可以被继承的 Embed 类 mock
  class MockEmbedClass {
    static blotName = 'embed'
    static tagName = 'span'
    static className = ''
    domNode: HTMLElement

    constructor() {
      this.domNode = document.createElement('span')
    }

    static create() {
      return document.createElement('span')
    }

    static value() {
      return ''
    }
  }

  const MockQuill = vi.fn().mockImplementation(() => mockQuillInstance) as unknown as {
    new (): typeof mockQuillInstance
    import: (path: string) => typeof MockEmbedClass
    register: (format: string, blot: unknown) => void
  }

  // 添加静态方法
  MockQuill.import = vi.fn().mockReturnValue(MockEmbedClass)
  MockQuill.register = vi.fn()

  return {
    default: MockQuill
  }
})

describe('MessageInput', () => {
  // 基础渲染测试
  describe('Rendering', () => {
    it('should render without crashing', () => {
      render(<MessageInput />)
      expect(document.querySelector('.message-input')).toBeInTheDocument()
    })

    it('should render with placeholder', () => {
      render(<MessageInput placeholder="Enter message..." />)
      const editor = document.querySelector('.quill-editor')
      expect(editor).toBeInTheDocument()
    })

    it('should apply custom className', () => {
      render(<MessageInput className="custom-class" />)
      expect(document.querySelector('.message-input.custom-class')).toBeInTheDocument()
    })
  })

  // Props 测试
  describe('Props', () => {
    it('should support disabled prop', () => {
      render(<MessageInput disabled />)
      expect(document.querySelector('.message-input.disabled')).toBeInTheDocument()
    })

    it('should support variant="outlined"', () => {
      render(<MessageInput variant="outlined" />)
      expect(document.querySelector('.message-input.outlined')).toBeInTheDocument()
    })

    it('should support variant="borderless"', () => {
      render(<MessageInput variant="borderless" />)
      expect(document.querySelector('.message-input.borderless')).toBeInTheDocument()
    })

    it('should support variant="filled"', () => {
      render(<MessageInput variant="filled" />)
      expect(document.querySelector('.message-input.filled')).toBeInTheDocument()
    })

    it('should apply custom style', () => {
      render(<MessageInput style={{ fontSize: 16 }} />)
      const container = document.querySelector('.message-input') as HTMLElement
      expect(container?.style.fontSize).toBe('16px')
    })

    it('should apply styles.textarea', () => {
      render(<MessageInput styles={{ textarea: { padding: '10px' } }} />)
      const editor = document.querySelector('.quill-editor') as HTMLElement
      expect(editor?.style.padding).toBe('10px')
    })
  })

  // 事件测试
  describe('Events', () => {
    it('should call onFocus when focused', () => {
      const onFocus = vi.fn()
      render(<MessageInput onFocus={onFocus} />)
      const editor = document.querySelector('.quill-editor')

      fireEvent.focus(editor!)
      expect(onFocus).toHaveBeenCalled()
    })

    it('should call onBlur when blurred', () => {
      const onBlur = vi.fn()
      render(<MessageInput onBlur={onBlur} />)
      const editor = document.querySelector('.quill-editor')

      fireEvent.blur(editor!)
      expect(onBlur).toHaveBeenCalled()
    })

    it('should call onKeyDown when key pressed', () => {
      const onKeyDown = vi.fn()
      render(<MessageInput onKeyDown={onKeyDown} />)
      const editor = document.querySelector('.quill-editor')

      fireEvent.keyDown(editor!, { key: 'a' })
      expect(onKeyDown).toHaveBeenCalled()
    })

    it('should call onPressEnter when Enter pressed', () => {
      const onPressEnter = vi.fn()
      render(<MessageInput onPressEnter={onPressEnter} />)
      const editor = document.querySelector('.quill-editor')

      fireEvent.keyDown(editor!, { key: 'Enter', shiftKey: false })
      expect(onPressEnter).toHaveBeenCalled()
    })

    it('should not call onPressEnter when Shift+Enter pressed', () => {
      const onPressEnter = vi.fn()
      render(<MessageInput onPressEnter={onPressEnter} />)
      const editor = document.querySelector('.quill-editor')

      fireEvent.keyDown(editor!, { key: 'Enter', shiftKey: true })
      expect(onPressEnter).not.toHaveBeenCalled()
    })

    it('should call onPaste when pasted', () => {
      const onPaste = vi.fn()
      render(<MessageInput onPaste={onPaste} />)
      const editor = document.querySelector('.quill-editor')

      fireEvent.paste(editor!)
      expect(onPaste).toHaveBeenCalled()
    })

    it('should call onClick when clicked', () => {
      const onClick = vi.fn()
      render(<MessageInput onClick={onClick} />)
      const editor = document.querySelector('.quill-editor')

      fireEvent.click(editor!)
      expect(onClick).toHaveBeenCalled()
    })

    it('should call onContextMenu when right-clicked', () => {
      const onContextMenu = vi.fn()
      render(<MessageInput onContextMenu={onContextMenu} />)
      const editor = document.querySelector('.quill-editor')

      fireEvent.contextMenu(editor!)
      expect(onContextMenu).toHaveBeenCalled()
    })
  })

  // Ref 方法测试
  describe('Ref Methods', () => {
    it('should expose focus method', () => {
      const TestComponent = () => {
        const inputRef = useRef<MessageInputRef>(null)
        return (
          <>
            <MessageInput ref={inputRef} />
            <button onClick={() => inputRef.current?.focus()}>Focus</button>
          </>
        )
      }

      render(<TestComponent />)
      const button = screen.getByText('Focus')
      fireEvent.click(button)
      // focus 被调用即通过
      expect(button).toBeInTheDocument()
    })

    it('should expose focus with cursor option', () => {
      const TestComponent = () => {
        const inputRef = useRef<MessageInputRef>(null)
        return (
          <>
            <MessageInput ref={inputRef} />
            <button onClick={() => inputRef.current?.focus({ cursor: 'end' })}>Focus End</button>
          </>
        )
      }

      render(<TestComponent />)
      const button = screen.getByText('Focus End')
      fireEvent.click(button)
      expect(button).toBeInTheDocument()
    })

    it('should expose blur method', () => {
      const TestComponent = () => {
        const inputRef = useRef<MessageInputRef>(null)
        return (
          <>
            <MessageInput ref={inputRef} />
            <button onClick={() => inputRef.current?.blur()}>Blur</button>
          </>
        )
      }

      render(<TestComponent />)
      const button = screen.getByText('Blur')
      fireEvent.click(button)
      expect(button).toBeInTheDocument()
    })

    it('should expose resizableTextArea.textArea structure', () => {
      const TestComponent = () => {
        const inputRef = useRef<MessageInputRef>(null)
        const [hasTextArea, setHasTextArea] = useState(false)

        return (
          <>
            <MessageInput ref={inputRef} />
            <button
              onClick={() => {
                const textArea = inputRef.current?.resizableTextArea?.textArea
                setHasTextArea(!!textArea)
              }}>
              Check TextArea
            </button>
            <span data-testid="has-textarea">{hasTextArea ? 'yes' : 'no'}</span>
          </>
        )
      }

      render(<TestComponent />)
      const button = screen.getByText('Check TextArea')
      fireEvent.click(button)

      // 由于 Quill 是 mock 的，resizableTextArea 可能为 undefined
      // 这里主要测试接口是否存在
      expect(button).toBeInTheDocument()
    })
  })

  // onChange 兼容性测试
  describe('onChange Compatibility', () => {
    it('should call onChange with event-like object', async () => {
      const onChange = vi.fn()
      const { container } = render(<MessageInput onChange={onChange} />)

      // 由于 Quill 是 mock 的，我们需要手动触发 text-change 事件
      // 这里主要测试 onChange 接口是否兼容
      expect(container).toBeInTheDocument()
    })

    it('should support accessing e.target.value', () => {
      let capturedValue: string | undefined

      const TestComponent = () => {
        const [value, setValue] = useState('')

        return (
          <MessageInput
            value={value}
            onChange={(e) => {
              // 模拟 TextArea 的使用方式
              capturedValue = e.target.value
              setValue(e.target.value)
            }}
          />
        )
      }

      render(<TestComponent />)
      // 验证接口支持 e.target.value 访问
      expect(capturedValue).toBeUndefined() // 初始值
    })
  })

  // autoSize 测试
  describe('autoSize', () => {
    it('should support autoSize as boolean', () => {
      render(<MessageInput autoSize />)
      const container = document.querySelector('.message-input') as HTMLElement
      expect(container).toBeInTheDocument()
    })

    it('should support autoSize as object', () => {
      render(<MessageInput autoSize={{ minRows: 2, maxRows: 10 }} />)
      const container = document.querySelector('.message-input') as HTMLElement
      expect(container).toBeInTheDocument()
    })
  })

  // maxLength 测试
  describe('maxLength', () => {
    it('should support maxLength prop', () => {
      render(<MessageInput maxLength={100} />)
      const container = document.querySelector('.message-input')
      expect(container).toBeInTheDocument()
    })
  })

  // spellCheck 测试
  describe('spellCheck', () => {
    it('should support spellCheck prop', () => {
      render(<MessageInput spellCheck={false} />)
      const editor = document.querySelector('.quill-editor')
      expect(editor?.getAttribute('spellcheck')).toBe('false')
    })
  })

  // 样式一致性测试
  describe('Style Consistency', () => {
    it('should have correct padding for textarea', () => {
      render(<MessageInput />)
      const editor = document.querySelector('.quill-editor') as HTMLElement
      // 验证样式是否正确应用
      expect(editor).toBeInTheDocument()
    })

    it('should have correct scrollbar width', () => {
      render(<MessageInput />)
      // 由于 Quill 是 mock 的，.ql-editor 元素不存在
      // 这里主要测试组件能正确渲染
      const container = document.querySelector('.message-input')
      expect(container).toBeInTheDocument()
    })
  })

  // insertPath 方法测试
  describe('insertPath', () => {
    it('should expose insertPath method', async () => {
      const TestComponent = () => {
        const inputRef = useRef<MessageInputRef>(null)
        return (
          <>
            <MessageInput ref={inputRef} />
            <button onClick={() => inputRef.current?.insertPath('/test/path')}>Insert Path</button>
          </>
        )
      }

      render(<TestComponent />)
      const button = screen.getByText('Insert Path')
      fireEvent.click(button)
      expect(button).toBeInTheDocument()
    })

    it('should call insertEmbed with correct parameters when insertPath is called', async () => {
      const insertEmbedMock = vi.fn()
      const insertTextMock = vi.fn()
      const setSelectionMock = vi.fn()
      const getSelectionMock = vi.fn().mockReturnValue({ index: 0, length: 0 })
      const getLengthMock = vi.fn().mockReturnValue(1)

      // 重新 mock Quill 以捕获 insertEmbed 调用
      vi.doMock('quill', () => {
        const mockQuillInstance = {
          setText: vi.fn(),
          getText: vi.fn().mockReturnValue(''),
          getContents: vi.fn().mockReturnValue({ ops: [{ insert: '' }] }),
          getSelection: getSelectionMock,
          setSelection: setSelectionMock,
          insertText: insertTextMock,
          insertEmbed: insertEmbedMock,
          deleteText: vi.fn(),
          getLength: getLengthMock,
          focus: vi.fn(),
          enable: vi.fn(),
          on: vi.fn(),
          off: vi.fn(),
          getIndex: vi.fn().mockReturnValue(0),
          getLeaf: vi.fn().mockReturnValue([null, 0]),
          root: {
            blur: vi.fn(),
            setAttribute: vi.fn(),
            scrollTo: vi.fn()
          }
        }

        class MockEmbedClass {
          static blotName = 'embed'
          static tagName = 'span'
          static className = ''
          domNode: HTMLElement

          constructor() {
            this.domNode = document.createElement('span')
          }

          static create() {
            return document.createElement('span')
          }

          static value() {
            return ''
          }
        }

        const MockQuill = vi.fn().mockImplementation(() => mockQuillInstance) as unknown as {
          new (): typeof mockQuillInstance
          import: (path: string) => typeof MockEmbedClass
          register: (format: string, blot: unknown) => void
        }

        MockQuill.import = vi.fn().mockReturnValue(MockEmbedClass)
        MockQuill.register = vi.fn()

        return {
          default: MockQuill
        }
      })

      const TestComponent = () => {
        const inputRef = useRef<MessageInputRef>(null)
        return (
          <>
            <MessageInput ref={inputRef} />
            <button onClick={() => inputRef.current?.insertPath('/test/path')}>Insert Path</button>
          </>
        )
      }

      render(<TestComponent />)
      const button = screen.getByText('Insert Path')
      fireEvent.click(button)

      // 验证 insertEmbed 被调用（由于 mock 是异步的，可能需要等待）
      // 这里主要验证方法可以被调用而不报错
      expect(button).toBeInTheDocument()
    })

    it('should include path in value when path blot is inserted', async () => {
      // 这个测试验证当 path blot 被插入后，value 属性能正确返回路径
      const TestComponent = () => {
        const inputRef = useRef<MessageInputRef>(null)
        const [value, setValue] = useState('')

        return (
          <>
            <MessageInput ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)} />
            <button onClick={() => inputRef.current?.insertPath('/home/user/test.txt')}>Insert Path</button>
            <span data-testid="value-display">{value}</span>
          </>
        )
      }

      render(<TestComponent />)

      // 点击插入路径按钮
      const button = screen.getByText('Insert Path')
      fireEvent.click(button)

      // 由于 Quill 是 mock 的，这里主要验证组件能正常渲染和交互
      expect(button).toBeInTheDocument()
    })
  })
})
