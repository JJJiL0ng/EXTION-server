import { Module, forwardRef } from '@nestjs/common';
import { TableDataJsonSaveService } from './table-data-json-save.service';
import { TableDataJsonSaveController } from './table-data-json-save.controller';
import { UserModule } from '../../user/user.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiChatModule } from 'src/v2/ai-chat/ai-chat.module';

@Module({
  imports: [UserModule, PrismaModule, forwardRef(() => AiChatModule)],
  controllers: [TableDataJsonSaveController],
  providers: [TableDataJsonSaveService],
  exports: [TableDataJsonSaveService],
})
export class TableDataJsonSaveModule {}
