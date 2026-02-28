import type { FC } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

import type { WebviewItem } from '../WebviewManagerApp'

interface Props {
  webviews: WebviewItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onShowWindow: (id: string) => void
}

const WebviewList: FC<Props> = ({ webviews, selectedId, onSelect, onClose, onShowWindow }) => {
  const { t } = useTranslation()

  if (webviews.length === 0) {
    return <EmptyPanel>{t('webview.manager.no_active')}</EmptyPanel>
  }

  return (
    <ListPanel>
      {webviews.map((wv) => (
        <ListItem key={wv.id} $selected={selectedId === wv.id} onClick={() => onSelect(wv.id)}>
          <ItemHeader>
            <StatusDot $locked={wv.locked} />
            <ItemName>{wv.name}</ItemName>
          </ItemHeader>
          <ItemUrl>{wv.url || 'about:blank'}</ItemUrl>
          <ItemActions>
            <LockBadge $locked={wv.locked}>
              {wv.locked ? t('webview.manager.locked') : t('webview.manager.unlocked')}
            </LockBadge>
            <WindowButton
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onShowWindow(wv.id)
              }}>
              {t('webview.manager.window')}
            </WindowButton>
            <CloseButton
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onClose(wv.id)
              }}>
              {t('common.close')}
            </CloseButton>
          </ItemActions>
        </ListItem>
      ))}
    </ListPanel>
  )
}

const EmptyPanel = styled.div`
  width: 260px;
  min-width: 260px;
  border-right: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  font-size: 13px;
  padding: 16px;
`

const ListPanel = styled.div`
  width: 260px;
  min-width: 260px;
  border-right: 1px solid var(--color-border);
  overflow-y: auto;
  background: var(--color-background-mute);
`

const ListItem = styled.div<{ $selected: boolean }>`
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--color-border);
  background: ${({ $selected }) => ($selected ? 'var(--color-primary-soft)' : 'transparent')};
  transition: background 0.15s;
`

const ItemHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
`

const StatusDot = styled.span<{ $locked: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ $locked }) => ($locked ? '#f59e0b' : '#22c55e')};
  flex-shrink: 0;
`

const ItemName = styled.span`
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
`

const ItemUrl = styled.div`
  font-size: 11px;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 4px;
`

const ItemActions = styled.div`
  display: flex;
  gap: 4px;
`

const LockBadge = styled.span<{ $locked: boolean }>`
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: ${({ $locked }) => ($locked ? 'rgba(245, 158, 11, 0.2)' : 'rgba(34, 197, 94, 0.2)')};
  color: ${({ $locked }) => ($locked ? '#f59e0b' : '#22c55e')};
`

const WindowButton = styled.button`
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
`

const CloseButton = styled.button`
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid rgba(239, 68, 68, 0.3);
  background: transparent;
  color: #ef4444;
  cursor: pointer;
`

export default WebviewList
