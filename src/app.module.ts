import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './common/config/env.validation';
import { PrismaModule } from './v2/prisma/prisma.module';
import { AuthModule } from './v2/auth/_auth/auth.module';

import { TableDataJsonSaveModule } from './v2/sheet/_table-data-json-save/table-data-json-save.module';
import { UserModule } from './v2/user/user.module';
import { AiAgentModule } from './v2/ai-agent/ai-agent.module';
import { AiChatModule } from './v2/ai-chat/ai-chat.module';
import { VerifyInviteModule } from './v2/auth/verify-invite/verify-invite.module';
import { InviteCodeModule } from './v2/admin/invite-code/invite-code.module';
import { SchemaConverterModule } from './v2/schema-converter/schema-converter.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),
    PrismaModule,
    AuthModule,
    TableDataJsonSaveModule,
    UserModule,
    AiAgentModule,
    AiChatModule,
    VerifyInviteModule,
    InviteCodeModule,
    SchemaConverterModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
