import { Module } from '@nestjs/common';
import { MainAiService } from './main-ai.service';
import { TableDataCacheModule } from '../../cache/_table-data-cache/table-data-cache.module';

@Module({
  imports: [TableDataCacheModule],
  providers: [MainAiService],
  exports: [MainAiService],
})
export class MainAiModule {}
