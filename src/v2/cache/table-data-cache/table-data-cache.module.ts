import { Module } from '@nestjs/common';
import { TableDataCacheService } from './table-data-cache.service';
import { TableDataCacheController } from './table-data-cache.controller';

@Module({
  controllers: [TableDataCacheController],
  providers: [TableDataCacheService],
})
export class TableDataCacheModule {}
