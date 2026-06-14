import { TaskManagerOutput } from 'src/v2/ai-agent/types/taskManager.types';
import { rollbackMessageRes } from '../types/aiChat.types';

export const AI_CHAT_EVENTS = {
  AI_JOB_ERROR: 'ai_job_error',
  AI_JOB_PLANNED: 'ai_job_planned',
  AI_TASKS_EXECUTED: 'ai_tasks_executed',
  AI_JOB_CANCELLED: 'ai_job_cancelled',
  AI_JOB_TIMEOUT: 'ai_job_timeout',
  ROLLBACK_MESSAGE_RESPONSE: 'rollback_message_response',
  ROLLBACK_MESSAGE_ERROR: 'rollback_message_error',
} as const;

export interface AiJobErrorEvent {
  jobId?: string;
  message?: string;
  code: string;
  retryAfter?: number;
  executionTime?: number;
  timestamp?: string;
}

export interface AiJobPlannedEvent {
  jobId: string;
  plan: TaskManagerOutput;
}

export interface AiJobCancelledEvent {
  jobId: string;
}

export interface AiJobTimeoutEvent {
  jobId: string;
  message: 'JOB_TIMEOUT';
}

export type RollbackMessageResponseEvent = rollbackMessageRes;
