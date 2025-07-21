import { Module } from '@nestjs/common';
import { TableDataJsonSaveService } from './table-data-json-save.service';
import { TableDataJsonSaveController } from './table-data-json-save.controller';
import { UserModule } from 'src/v2/user/user.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [UserModule, PrismaModule],
  controllers: [TableDataJsonSaveController],
  providers: [TableDataJsonSaveService],
})
export class TableDataJsonSaveModule {}
