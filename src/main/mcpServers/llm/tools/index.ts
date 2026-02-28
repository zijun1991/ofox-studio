import { chatToolDefinition, handleChat } from './chat'
import { handleListModels, listModelsToolDefinition } from './list-models'

export const toolDefinitions = [chatToolDefinition, listModelsToolDefinition]

export const toolHandlers: Record<
  string,
  (args: unknown) => Promise<{ content: { type: string; text: string }[]; isError: boolean }>
> = {
  chat: handleChat,
  list_models: handleListModels
}
