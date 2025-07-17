import { Test, TestingModule } from '@nestjs/testing';
import { TableDataJsonParsingController } from './table-data-json-parsing.controller';
import { TableDataJsonParsingService } from './table-data-json-parsing.service';

describe('TableDataJsonParsingController', () => {
  let controller: TableDataJsonParsingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TableDataJsonParsingController],
      providers: [TableDataJsonParsingService],
    }).compile();

    controller = module.get<TableDataJsonParsingController>(TableDataJsonParsingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
