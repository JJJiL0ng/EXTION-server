import { Module } from '@nestjs/common';
import { ChatDatabaseService } from './chat-database.service';
import { ChatDatabaseController } from './chat-database.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ChatDatabaseController],
  providers: [ChatDatabaseService],
  exports: [ChatDatabaseService],
})
export class ChatDatabaseModule {}
