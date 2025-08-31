import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { AiAgentService } from './ai-agent.service';
import { CreateAiAgentDto } from './dto/create-ai-agent.dto';
import { UpdateAiAgentDto } from './dto/update-ai-agent.dto';

@Controller('ai-agent')
export class AiAgentController {
  constructor(private readonly aiAgentService: AiAgentService) {}

  @Post()
  create(@Body() createAiAgentDto: CreateAiAgentDto) {
    return this.aiAgentService.create(createAiAgentDto);
  }

  @Get()
  findAll() {
    return this.aiAgentService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.aiAgentService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateAiAgentDto: UpdateAiAgentDto) {
    return this.aiAgentService.update(+id, updateAiAgentDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.aiAgentService.remove(+id);
  }
}
