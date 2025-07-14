import { Test, TestingModule } from '@nestjs/testing';
import { TableDataJsonSaveController } from './table-data-json-save.controller';
import { TableDataJsonSaveService } from './table-data-json-save.service';

describe('TableDataJsonSaveController', () => {
  let controller: TableDataJsonSaveController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TableDataJsonSaveController],
      providers: [TableDataJsonSaveService],
    }).compile();

    controller = module.get<TableDataJsonSaveController>(TableDataJsonSaveController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
