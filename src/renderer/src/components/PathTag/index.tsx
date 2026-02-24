import { useMemoizedFn } from 'ahooks'
import React, { useRef } from 'react'
import styled from 'styled-components'

export interface PathTagProps {
  /** 完整路径 */
  path: string
  /** 路径是否存在（决定颜色：蓝色=存在，红色=未知） */
  exists?: boolean
  /** 路径类型 */
  type?: 'file' | 'directory' | 'unknown'
  /** 自定义类名 */
  className?: string
  /** 点击回调 */
  onClick?: (path: string) => void
}

/**
 * 路径标签组件
 * 用于在消息卡片中渲染绝对路径为 tag 样式
 * 蓝色表示路径存在，红色表示路径不存在
 */
export const PathTag: React.FC<PathTagProps> = ({ path, exists = true, type: propType, className, onClick }) => {
  const tagRef = useRef<HTMLSpanElement>(null)

  // 自动检测路径类型
  const type = useMemoizedFn(() => {
    if (propType) return propType
    if (!exists) return 'unknown'
    // 简单判断：以 / 或 \ 结尾的是目录
    if (path.endsWith('/') || path.endsWith('\\')) return 'directory'
    return 'file'
  })()

  // 获取路径显示名称（文件名或目录名）
  const name = useMemoizedFn(() => {
    // 统一使用 / 作为分隔符处理
    const normalizedPath = path.replace(/\\/g, '/')
    const parts = normalizedPath.split('/').filter(Boolean)
    if (parts.length === 0) return path

    // 如果是目录，返回最后一级目录名
    // 如果是文件，返回文件名
    return parts[parts.length - 1] || path
  })()

  // 获取类型前缀文本
  const typePrefix = useMemoizedFn(() => {
    switch (type) {
      case 'directory':
        return '目录:'
      case 'file':
        return '文件:'
      default:
        return '未知:'
    }
  })()

  return (
    <TagContainer className={className}>
      <Tag
        ref={tagRef}
        className={`path-tag ${exists ? 'path-exists' : 'path-unknown'}`}
        onClick={() => onClick?.(path)}>
        <TypePrefix>{typePrefix}</TypePrefix>
        <Name>{name}</Name>
      </Tag>
      {/* 纯 CSS Tooltip */}
      <Tooltip className="path-tooltip">{path}</Tooltip>
    </TagContainer>
  )
}

// 标签容器 - 用于定位 tooltip
const TagContainer = styled.span`
  display: inline-flex;
  position: relative;
  vertical-align: middle;
  margin: 0 2px;
`

// 标签样式
const Tag = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  cursor: default;
  user-select: none;
  vertical-align: middle;

  &.path-exists {
    background-color: #1890ff;
    color: white;
  }

  &.path-unknown {
    background-color: #ff4d4f;
    color: white;
  }

  /* Hover 时显示 tooltip */
  &:hover + .path-tooltip {
    opacity: 1;
    visibility: visible;
  }
`

// 类型前缀样式
const TypePrefix = styled.span`
  color: rgba(255, 255, 255, 0.7);
  margin-right: 4px;
`

// 文件名样式
const Name = styled.span`
  color: white;
`

// Tooltip 样式 - 纯 CSS 实现，相对于 TagContainer 定位
const Tooltip = styled.span`
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 10px;
  background-color: rgba(0, 0, 0, 0.85);
  color: white;
  font-size: 12px;
  border-radius: 4px;
  white-space: nowrap !important;
  z-index: 99999;
  opacity: 0;
  visibility: hidden;
  transition:
    opacity 0.2s,
    visibility 0.2s;
  pointer-events: none;
  margin-bottom: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);

  /* 箭头 */
  &::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 5px solid transparent;
    border-top-color: rgba(0, 0, 0, 0.85);
  }
`

export default PathTag
