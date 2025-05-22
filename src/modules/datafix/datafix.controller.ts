import { Controller, Post, Body, Logger } from '@nestjs/common';
import { DataFixService } from './datafix.service';
import { ProcessDataDto, DataFixResponseDto } from './dto/process-data.dto';

@Controller('datafix')
export class DataFixController {
  private readonly logger = new Logger(DataFixController.name);

  constructor(private readonly dataFixService: DataFixService) {}

  @Post('process')
  async processData(@Body() processDataDto: ProcessDataDto): Promise<DataFixResponseDto> {
    this.logger.log(`데이터 수정 요청 받음: ${processDataDto.userInput}`);
    return this.dataFixService.processData(processDataDto);
  }
}
