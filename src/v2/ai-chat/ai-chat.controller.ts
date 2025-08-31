// // 채팅을 보내고 받는건 웹소켓을 활용한 ai-chat.gateway.ts에서 담당
// 이 컨트롤러에서는 fallback으로 웹소켓 연결 실패시 사용될 채팅과
// 이전 채팅을 불러오는 등에 대한 로직만 포함됩니다.

import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { AiChatService } from './ai-chat.service';
import { CreateAiChatDto } from './dto/create-ai-chat.dto';
import { UpdateAiChatDto } from './dto/update-ai-chat.dto';

@Controller('ai-chat')
export class AiChatController {
  constructor(private readonly aiChatService: AiChatService) {}

  @Post()
  create(@Body() createAiChatDto: CreateAiChatDto) {
    return this.aiChatService.create(createAiChatDto);
  }

  @Get()
  findAll() {
    return this.aiChatService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.aiChatService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateAiChatDto: UpdateAiChatDto) {
    return this.aiChatService.update(+id, updateAiChatDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.aiChatService.remove(+id);
  }
}
