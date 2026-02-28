import QuickPhrasesButton from '@renderer/pages/home/Inputbar/tools/components/QuickPhrasesButton'
import { defineTool, registerTool, TopicType } from '@renderer/pages/home/Inputbar/types'

const TURBO_AGENT_ID = 'agent_turbo_system'

const quickPhrasesTool = defineTool({
  key: 'quick_phrases',
  label: (t) => t('settings.quickPhrase.title'),

  visibleInScopes: [TopicType.Chat, TopicType.Session, 'mini-window'],
  condition: (context) => context.session?.agentId !== TURBO_AGENT_ID,

  dependencies: {
    actions: ['onTextChange', 'resizeTextArea'] as const
  },

  render: (context) => {
    const { assistant, actions, quickPanel } = context

    return (
      <QuickPhrasesButton
        quickPanel={quickPanel}
        setInputValue={actions.onTextChange}
        resizeTextArea={actions.resizeTextArea}
        assistantId={assistant.id}
      />
    )
  }
})

registerTool(quickPhrasesTool)

export default quickPhrasesTool
