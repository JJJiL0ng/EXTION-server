import { Module } from '@nestjs/common';
import { VisualizationGenerateChatService } from './visualization-generate-chat.service';

@Module({
  controllers: [],
  providers: [VisualizationGenerateChatService],
})
export class VisualizationGenerateChatModule {}
