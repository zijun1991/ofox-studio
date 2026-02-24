import { HStack } from '@renderer/components/Layout'
import ModelTagsWithLabel from '@renderer/components/ModelTagsWithLabel'
import { getModelLogo } from '@renderer/config/models'
import { useProviders } from '@renderer/hooks/useProvider'
import type { Model } from '@renderer/types'
import { getFancyProviderName } from '@renderer/utils'
import { isFreeModel } from '@renderer/utils/model'
import { Avatar, Empty, Input } from 'antd'
import { first, sortBy } from 'lodash'
import type { FC } from 'react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

const formatPrice = (price: number | undefined): string => {
  if (price === undefined || price === null) return '--'
  return `$${price.toFixed(2)}`
}

const ModelsByProvider: FC = () => {
  const { t } = useTranslation()
  const { providers } = useProviders()
  const [searchText, setSearchText] = useState('')

  // Filter providers that have models
  const providersWithModels = useMemo(() => {
    return providers.filter((p) => p.models && p.models.length > 0)
  }, [providers])

  // Filter models by search text
  const filteredProviders = useMemo(() => {
    if (!searchText.trim()) {
      return providersWithModels
    }

    const lowerSearch = searchText.toLowerCase()
    return providersWithModels
      .map((p) => ({
        ...p,
        models: p.models.filter(
          (m) =>
            m.name.toLowerCase().includes(lowerSearch) ||
            m.id.toLowerCase().includes(lowerSearch) ||
            getFancyProviderName(p).toLowerCase().includes(lowerSearch)
        )
      }))
      .filter((p) => p.models.length > 0)
  }, [providersWithModels, searchText])

  // Total model count
  const totalModels = useMemo(() => {
    return filteredProviders.reduce((sum, p) => sum + p.models.length, 0)
  }, [filteredProviders])

  if (providersWithModels.length === 0) {
    return (
      <EmptyContainer>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('settings.account.no_models')} />
      </EmptyContainer>
    )
  }

  return (
    <Container>
      <Header>
        <Title>
          {t('settings.account.available_models')}
          <ModelCount>{totalModels}</ModelCount>
        </Title>
        <SearchInput
          placeholder={t('settings.provider.search_placeholder')}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          allowClear
        />
      </Header>

      <ModelsList>
        {filteredProviders.map((provider) => (
          <ProviderGroup key={provider.id}>
            <GroupHeader>
              <HStack alignItems="center" gap={8}>
                <GroupTitle>{getFancyProviderName(provider)}</GroupTitle>
                <ModelBadge>{provider.models.length}</ModelBadge>
              </HStack>
            </GroupHeader>
            <ModelsGrid>
              {sortBy(provider.models, ['name']).map((model) => (
                <ModelCard key={`${provider.id}-${model.id}`} model={model} />
              ))}
            </ModelsGrid>
          </ProviderGroup>
        ))}

        {filteredProviders.length === 0 && searchText && (
          <EmptyContainer>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('common.no_results')} />
          </EmptyContainer>
        )}
      </ModelsList>
    </Container>
  )
}

// Model Card Component
const ModelCard: FC<{ model: Model }> = ({ model }) => {
  const { t } = useTranslation()
  const inputPrice = model.pricing?.input_per_million_tokens
  const outputPrice = model.pricing?.output_per_million_tokens
  const hasPricing = inputPrice !== undefined || outputPrice !== undefined
  const isFree = isFreeModel(model)

  return (
    <Card>
      <CardLeft>
        <ModelAvatar src={getModelLogo(model)} size={28}>
          {first(model.name) || 'M'}
        </ModelAvatar>
        <ModelInfo>
          <ModelNameRow>
            <ModelNameText title={model.name}>{model.name}</ModelNameText>
          </ModelNameRow>
          <ModelTagsWithLabel model={model} size={10} showLabel={true} />
        </ModelInfo>
      </CardLeft>
      <PriceInfo>
        {isFree ? (
          <PriceFree>{t('common.free')}</PriceFree>
        ) : hasPricing ? (
          <PriceRow>
            <PriceItem>
              <PriceLabel>{t('settings.model_employee.pricing.input')}</PriceLabel>
              <PriceValue>{formatPrice(inputPrice)}</PriceValue>
            </PriceItem>
            <PriceItem>
              <PriceLabel>{t('settings.model_employee.pricing.output')}</PriceLabel>
              <PriceValue>{formatPrice(outputPrice)}</PriceValue>
            </PriceItem>
          </PriceRow>
        ) : (
          <PriceUnknown>{t('common.unknown')}</PriceUnknown>
        )}
      </PriceInfo>
    </Card>
  )
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
`

const Header = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  gap: 16px;
`

const Title = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-1);
`

const ModelCount = styled.span`
  font-size: 12px;
  font-weight: normal;
  color: var(--color-text-3);
  background: var(--color-background-soft);
  padding: 2px 8px;
  border-radius: 10px;
`

const SearchInput = styled(Input)`
  width: 200px;
`

const ModelsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const ProviderGroup = styled.div`
  display: flex;
  flex-direction: column;
  border-radius: var(--list-item-border-radius);
  border: 0.5px solid var(--color-border);
  overflow: hidden;
`

const GroupHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--color-background-soft);
  border-bottom: 0.5px solid var(--color-border);
`

const GroupTitle = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-1);
`

const ModelBadge = styled.span`
  font-size: 11px;
  color: var(--color-text-3);
`

const ModelsGrid = styled.div`
  display: flex;
  flex-direction: column;
  padding: 8px;
  gap: 4px;
  background: var(--color-background);
`

const Card = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: 6px;
  transition: background-color 0.15s ease;

  &:hover {
    background: var(--color-background-soft);
  }
`

const CardLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
`

const ModelAvatar = styled(Avatar)`
  background: var(--color-background-soft);
  flex-shrink: 0;
`

const ModelInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
`

const ModelNameRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const ModelNameText = styled.span`
  font-size: 13px;
  color: var(--color-text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const EmptyContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
`

const PriceInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const PriceRow = styled.div`
  display: flex;
  gap: 16px;
`

const PriceItem = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
`

const PriceLabel = styled.span`
  font-size: 10px;
  color: var(--color-text-3);
`

const PriceValue = styled.span`
  font-size: 12px;
  color: var(--color-text-2);
  font-weight: 500;
`

const PriceFree = styled.span`
  font-size: 12px;
  color: var(--color-success);
  font-weight: 500;
`

const PriceUnknown = styled.span`
  font-size: 12px;
  color: var(--color-text-3);
`

export default ModelsByProvider
