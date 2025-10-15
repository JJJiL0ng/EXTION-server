import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SchemaConverterService } from './schema-converter.service';
import { SchemaConverterController } from './schema-converter.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MappingService } from './mapping/mapping.service';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [SchemaConverterController],
  providers: [SchemaConverterService, MappingService],
})
export class SchemaConverterModule {}
