import { Controller, Post, Body } from '@nestjs/common';
import { AiutilsService } from './aiutils.service';
import { MarkdownProcessDto, ProcessedResponseDto } from './dto/markdown-process.dto';

@Controller('aiutils')
export class AiutilsController {
  constructor(private readonly aiutilsService: AiutilsService) {}

  /**
   * 마크다운 텍스트를 플레인 텍스트로 변환하는 엔드포인트
   * @param markdownProcessDto - 변환할 마크다운 텍스트
   * @returns ProcessedResponseDto - 변환된 플레인 텍스트와 원본 텍스트
   */
  @Post('process-markdown')
  processMarkdown(@Body() markdownProcessDto: MarkdownProcessDto): ProcessedResponseDto {
    return this.aiutilsService.processMarkdownToPlainText(markdownProcessDto);
  }
} 