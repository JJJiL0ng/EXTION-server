import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './v2/prisma/prisma.module';
import { AuthModule } from './v2/auth/_auth/auth.module';

import { TableDataJsonSaveModule } from './v2/sheet/_table-data-json-save/table-data-json-save.module';
import { UserModule } from './v2/user/user.module';
import { TableDataJsonParserModule } from './v2/sheet/_table-data-json-parser/_table-data-json-parser.module';
import { AiAgentModule } from './v2/ai-agent/ai-agent.module';
import { AiChatModule } from './v2/ai-chat/ai-chat.module';
import { EventsGateway } from './events/events.gateway';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    AuthModule,
    TableDataJsonSaveModule,
    UserModule,
    // TableDataCacheModule,
    TableDataJsonParserModule,
    AiAgentModule,
    AiChatModule,
  ],
  controllers: [AppController],
  providers: [AppService, EventsGateway],
})
export class AppModule {}