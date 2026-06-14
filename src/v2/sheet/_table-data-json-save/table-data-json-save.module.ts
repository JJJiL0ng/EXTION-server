import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TableDataJsonSaveService } from './table-data-json-save.service';
import { TableDataJsonSaveController } from './table-data-json-save.controller';
import { UserModule } from '../../user/user.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiChatModule } from 'src/v2/ai-chat/ai-chat.module';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { RateLimitCleanupService } from './services/rate-limit-cleanup.service';
import { SpreadsheetRepository } from '../repositories/spreadsheet.repository';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    UserModule,
    PrismaModule,
    forwardRef(() => AiChatModule),
  ],
  controllers: [TableDataJsonSaveController],
  providers: [
    TableDataJsonSaveService,
    SpreadsheetRepository,
    RateLimitGuard,
    RateLimitCleanupService,
  ],
  exports: [TableDataJsonSaveService],
})
export class TableDataJsonSaveModule {}
