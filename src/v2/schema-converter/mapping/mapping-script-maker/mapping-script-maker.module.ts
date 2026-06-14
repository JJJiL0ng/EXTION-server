import { Module } from '@nestjs/common';
import { MappingScriptMakerService } from './mapping-script-maker.service';
import { MappingScriptMakerController } from './mapping-script-maker.controller';
import { PrismaModule } from '../../../../v2/prisma/prisma.module';
import { AiAgentModule } from '../../../ai-agent/ai-agent.module';

@Module({
  imports: [PrismaModule, AiAgentModule],
  controllers: [MappingScriptMakerController],
  providers: [MappingScriptMakerService],
})
export class MappingScriptMakerModule {}
