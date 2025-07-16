import { Test, TestingModule } from '@nestjs/testing';
import { MainAiService } from './main-ai.service';

describe('MainAiService', () => {
  let service: MainAiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MainAiService],
    }).compile();

    service = module.get<MainAiService>(MainAiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
