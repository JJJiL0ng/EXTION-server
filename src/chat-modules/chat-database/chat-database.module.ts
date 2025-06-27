import { Module } from '@nestjs/common';
import { ChatDatabaseService } from './chat-database.service';
import { ChatDatabaseController } from './chat-database.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../../auth-modules/auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ChatDatabaseController],
  providers: [ChatDatabaseService],
  exports: [ChatDatabaseService],
})
export class ChatDatabaseModule {}
