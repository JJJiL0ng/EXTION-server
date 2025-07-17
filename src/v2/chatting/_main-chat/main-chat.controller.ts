import { Controller } from '@nestjs/common';
import { MainChatService } from './main-chat.service';

@Controller('main-chat')
export class MainChatController {
  constructor(private readonly mainChatService: MainChatService) {}
}
