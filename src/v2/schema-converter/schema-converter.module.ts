import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SchemaConverterService } from './schema-converter.service';
import { SchemaConverterController } from './schema-converter.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MappingService } from './mapping/mapping.service';
import { MappingScriptMakerModule } from './mapping/mapping-script-maker/mapping-script-maker.module';
import { MultiturnChattingModule } from './mapping/multiturn-chatting/multiturn-chatting.module';
import { AiAgentModule } from '../ai-agent/ai-agent.module';

@Module({
  imports: [PrismaModule, ConfigModule, AiAgentModule, MappingScriptMakerModule, MultiturnChattingModule],
  controllers: [SchemaConverterController],
  providers: [SchemaConverterService, MappingService],
})
export class SchemaConverterModule {}
