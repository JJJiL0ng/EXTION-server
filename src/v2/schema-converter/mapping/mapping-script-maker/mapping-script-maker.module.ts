import { Module } from '@nestjs/common';
import { MappingScriptMakerService } from './mapping-script-maker.service';
import { MappingScriptMakerController } from './mapping-script-maker.controller';

@Module({
  controllers: [MappingScriptMakerController],
  providers: [MappingScriptMakerService],
})
export class MappingScriptMakerModule {}
