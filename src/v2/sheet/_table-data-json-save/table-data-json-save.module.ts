import { Module } from '@nestjs/common';
import { TableDataJsonSaveService } from './table-data-json-save.service';
import { TableDataJsonSaveController } from './table-data-json-save.controller';
import { UserModule } from '../../user/user.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiChatService } from 'src/v2/ai-chat/ai-chat.service';

@Module({
  imports: [UserModule, PrismaModule, AiChatService],
  controllers: [TableDataJsonSaveController],
  providers: [TableDataJsonSaveService],
  exports: [TableDataJsonSaveService],
})
export class TableDataJsonSaveModule {}
