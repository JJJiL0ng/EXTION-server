import { Test, TestingModule } from '@nestjs/testing';
import { MainAiController } from './main-ai.controller';
import { MainAiService } from './main-ai.service';

describe('MainAiController', () => {
  let controller: MainAiController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MainAiController],
      providers: [MainAiService],
    }).compile();

    controller = module.get<MainAiController>(MainAiController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
