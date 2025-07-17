import { Test, TestingModule } from '@nestjs/testing';
import { MainChatService } from './main-chat.service';

describe('MainChatService', () => {
  let service: MainChatService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MainChatService],
    }).compile();

    service = module.get<MainChatService>(MainChatService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
