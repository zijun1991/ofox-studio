/**
 * Agent Services Module
 *
 * This module provides service classes for managing agents, sessions, and session messages.
 * All services extend BaseService and provide database operations with proper error handling.
 */

// Service classes
export { AgentService } from './AgentService'
export { SchedulerService } from './SchedulerService'
export { SessionMessageService } from './SessionMessageService'
export { SessionService } from './SessionService'

// Service instances (singletons)
export { agentService } from './AgentService'
export { schedulerService } from './SchedulerService'
export { sessionMessageService } from './SessionMessageService'
export { sessionService } from './SessionService'

// Type definitions for service requests and responses
export type { AgentEntity, AgentSessionEntity, CreateAgentRequest, UpdateAgentRequest } from '@types'
export type {
  AgentSessionMessageEntity,
  CreateSessionRequest,
  GetAgentSessionResponse,
  ListOptions as SessionListOptions,
  UpdateSessionRequest
} from '@types'

// Scheduler types
export type {
  CreateSchedulerRequest,
  ListSchedulerLogsOptions,
  ListSchedulersOptions,
  SchedulerEntity,
  SchedulerLogEntity,
  UpdateSchedulerRequest
} from './SchedulerService'
