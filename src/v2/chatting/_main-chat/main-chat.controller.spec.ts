import { Test, TestingModule } from '@nestjs/testing';
import { MainChatController } from './main-chat.controller';
import { MainChatService } from './main-chat.service';

describe('MainChatController', () => {
  let controller: MainChatController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MainChatController],
      providers: [MainChatService],
    }).compile();

    controller = module.get<MainChatController>(MainChatController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
