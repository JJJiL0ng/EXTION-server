import { Controller } from '@nestjs/common';
import { MultiturnChattingService } from './multiturn-chatting.service';

@Controller('multiturn-chatting')
export class MultiturnChattingController {
  constructor(private readonly multiturnChattingService: MultiturnChattingService) {}
}
