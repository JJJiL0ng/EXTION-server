import { Injectable } from '@nestjs/common';
import { TaskManagerOutput } from 'src/v2/ai-agent/types/taskManager.types';
import {
  aiChatApiReq,
  PreviousChatMessage,
} from '../types/aiChat.types';

export interface AiChatJob {
  aiReq: aiChatApiReq;
  plan: TaskManagerOutput;
  clientId: string;
  createdAt: number;
  previousMessages: PreviousChatMessage[];
  fileName?: string;
}

export interface AiChatJobEntry extends AiChatJob {
  jobId: string;
}

@Injectable()
export class AiChatJobRegistryService {
  private readonly jobs = new Map<string, AiChatJob>();

  get(jobId: string): AiChatJob | undefined {
    return this.jobs.get(jobId);
  }

  set(jobId: string, job: AiChatJob): void {
    this.jobs.set(jobId, job);
  }

  delete(jobId: string): boolean {
    return this.jobs.delete(jobId);
  }

  deleteByClientId(clientId: string): string[] {
    const deletedJobIds: string[] = [];

    for (const [jobId, job] of this.jobs.entries()) {
      if (job.clientId === clientId) {
        this.jobs.delete(jobId);
        deletedJobIds.push(jobId);
      }
    }

    return deletedJobIds;
  }

  deleteExpiredJobs(maxJobAgeMs: number, now = Date.now()): AiChatJobEntry[] {
    const expiredJobs: AiChatJobEntry[] = [];

    for (const [jobId, job] of this.jobs.entries()) {
      if (now - job.createdAt > maxJobAgeMs) {
        this.jobs.delete(jobId);
        expiredJobs.push({ jobId, ...job });
      }
    }

    return expiredJobs;
  }
}
