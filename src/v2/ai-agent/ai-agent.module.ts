import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiAgentService } from './ai-agent.service';
import { LlmModelFactoryService } from './model/llm-model-factory.service';

@Module({
  imports: [ConfigModule],
  providers: [AiAgentService, LlmModelFactoryService],
  exports: [AiAgentService, LlmModelFactoryService],
})
export class AiAgentModule {}
