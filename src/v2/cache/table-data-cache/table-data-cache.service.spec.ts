import { Test, TestingModule } from '@nestjs/testing';
import { TableDataCacheService } from './table-data-cache.service';

describe('TableDataCacheService', () => {
  let service: TableDataCacheService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TableDataCacheService],
    }).compile();

    service = module.get<TableDataCacheService>(TableDataCacheService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
