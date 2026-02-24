import { DeleteOutlined, EditOutlined } from '@ant-design/icons'
import ModelAvatar from '@renderer/components/Avatar/ModelAvatar'
import { useAppSelector } from '@renderer/store'
import type { ModelEmployee } from '@renderer/types/modelEmployee'
import { isFreeModel } from '@renderer/utils/model'
import { getFancyProviderName } from '@renderer/utils/naming'
import { Button, Space } from 'antd'
import type { FC } from 'react'
import styled from 'styled-components'

interface EmployeeCardProps {
  employee: ModelEmployee
  onEdit: () => void
  onDelete: () => void
}

// 格式化价格显示
const formatPrice = (price: number | undefined): string => {
  if (price === undefined || price === null) return '--'
  return `$${price.toFixed(2)}`
}

const EmployeeCard: FC<EmployeeCardProps> = ({ employee, onEdit, onDelete }) => {
  const providers = useAppSelector((state) => state.llm.providers)

  // 从 Redux store 中查找最新模型价格
  const latestModel = providers
    .find((p) => p.id === employee.model.provider)
    ?.models.find((m) => m.id === employee.model.id)

  // 优先使用最新价格，回退到快照价格
  const pricing = latestModel?.pricing ?? employee.model.pricing
  const inputPrice = pricing?.input_per_million_tokens
  const outputPrice = pricing?.output_per_million_tokens
  const hasPricing = inputPrice !== undefined || outputPrice !== undefined

  // 检查是否为免费模型
  const isFree = isFreeModel(employee.model)

  return (
    <CardContainer>
      <CardRow>
        <EmployeeName>{employee.name}</EmployeeName>
        <ModelInfo>
          <ModelAvatar model={employee.model} size={14} />
          <ModelName>{employee.model.name}</ModelName>
          <Divider>|</Divider>
          <ModelProvider>{getFancyProviderName({ name: employee.model.provider } as any)}</ModelProvider>
          {isFree ? (
            <>
              <Divider>·</Divider>
              <PriceFree>免费</PriceFree>
            </>
          ) : hasPricing ? (
            <>
              <Divider>·</Divider>
              <PriceLabel $color="input">输入</PriceLabel>
              <PriceValue $color="input">{formatPrice(inputPrice)}</PriceValue>
              <PriceLabel $color="output">输出</PriceLabel>
              <PriceValue $color="output">{formatPrice(outputPrice)}</PriceValue>
            </>
          ) : (
            <>
              <Divider>·</Divider>
              <PriceUnknown>价格未知</PriceUnknown>
            </>
          )}
        </ModelInfo>
        <Space size={2}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={onEdit} />
          <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={onDelete} />
        </Space>
      </CardRow>
      <CardRow>
        <EmployeeDescription>{employee.description}</EmployeeDescription>
      </CardRow>
    </CardContainer>
  )
}

const CardContainer = styled.div`
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--color-background-soft);
  border: 0.5px solid var(--color-border);
`

const CardRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;

  &:first-child {
    margin-bottom: 4px;
  }
`

const EmployeeName = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-1);
  flex-shrink: 0;
`

const ModelInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  flex: 1;
  min-width: 0;
`

const ModelName = styled.span`
  color: var(--color-text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const ModelProvider = styled.span`
  color: var(--color-text-3);
  flex-shrink: 0;
`

const Divider = styled.span`
  color: var(--color-text-3);
  opacity: 0.5;
  flex-shrink: 0;
`

interface PriceColorProps {
  $color: 'input' | 'output'
}

const PriceLabel = styled.span<PriceColorProps>`
  color: ${(props) => (props.$color === 'input' ? '#1890ff' : '#52c41a')};
  flex-shrink: 0;
  font-size: 10px;
`

const PriceValue = styled.span<PriceColorProps>`
  color: ${(props) => (props.$color === 'input' ? '#1890ff' : '#52c41a')};
  flex-shrink: 0;
  font-family: monospace;
  font-weight: 500;
`

const PriceFree = styled.span`
  color: #52c41a;
  flex-shrink: 0;
  font-weight: 500;
`

const PriceUnknown = styled.span`
  color: var(--color-text-3);
  opacity: 0.6;
  flex-shrink: 0;
`

const EmployeeDescription = styled.div`
  font-size: 11px;
  color: var(--color-text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
`

export default EmployeeCard
