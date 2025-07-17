import { Module } from '@nestjs/common';
import { TableDataJsonSaveService } from './table-data-json-save.service';
import { TableDataJsonSaveController } from './table-data-json-save.controller';
import { UserModule } from 'src/v2/user/user.module';

@Module({
  imports: [UserModule],
  controllers: [TableDataJsonSaveController],
  providers: [TableDataJsonSaveService],
})
export class TableDataJsonSaveModule {}
