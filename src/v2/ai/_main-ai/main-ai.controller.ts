import { Controller } from '@nestjs/common';
import { MainAiService } from './main-ai.service';

@Controller('main-ai')
export class MainAiController {
  constructor(private readonly mainAiService: MainAiService) {}
}
