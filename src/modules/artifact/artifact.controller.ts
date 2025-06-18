// // src/modules/artifact/artifact.controller.ts
// import { Controller, Post, Body, HttpStatus, HttpCode, BadRequestException, Logger, UsePipes, ValidationPipe, InternalServerErrorException, Get, Param, Query } from '@nestjs/common';
// import { ArtifactService } from './artifact.service';
// import { GenerateArtifactDto, ArtifactResponseDto } from './dto/generate-artifact.dto';

// @Controller('artifact')
// // ValidationPipe를 컨트롤러 레벨에 적용하여 모든 핸들러에 적용합니다.
// @UsePipes(new ValidationPipe({
//   transform: true,
//   whitelist: true,
//   forbidNonWhitelisted: true,
// }))
// export class ArtifactController {
//   private readonly logger = new Logger(ArtifactController.name);
  
//   constructor(private readonly artifactService: ArtifactService) {}

//   @Post('generate')
//   @HttpCode(HttpStatus.OK)
//   async generateArtifact(
//     @Body() generateArtifactDto: GenerateArtifactDto
//   ): Promise<ArtifactResponseDto> {
//     const startTime = Date.now();
//     this.logger.log('아티팩트 생성 요청 시작', { 
//       userId: generateArtifactDto.userId,
//       chatId: generateArtifactDto.chatId || '새 채팅',
//       userInputLength: generateArtifactDto.userInput.length,
//     });

//     if (generateArtifactDto.spreadsheetData) {
//       const { fileName, activeSheet, sheets } = generateArtifactDto.spreadsheetData;
//       this.logger.log('스프레드시트 데이터 제공됨', { fileName, activeSheet, totalSheets: sheets?.length || 0 });
//     }

//     try {
//       const result = await this.artifactService.generateArtifact(generateArtifactDto);

//       const processingTime = Date.now() - startTime;
//       this.logger.log(`아티팩트 생성 성공 (${processingTime}ms)`, {
//         chatId: result.chatId,
//         success: result.success,
//         codeLength: result.code?.length || 0,
//       });
      
//       if (!result.success) {
//         this.logger.error(`서비스 로직 실패: ${result.explanation?.korean}`);
//       }
//       return result;

//     } catch (error) {
//       this.logger.error(`아티팩트 생성 실패: ${error.message}`, error.stack);

//       // 서비스에서 던진 특정 HTTP 예외는 그대로 전달합니다.
//       if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
//         throw error;
//       }

//       // 그 외 예상치 못한 모든 오류는 일반적인 서버 오류로 처리합니다.
//       throw new InternalServerErrorException('아티팩트 생성 중 예상치 못한 서버 오류가 발생했습니다.');
//     }
//   }

//   // @Get('chats/by-spreadsheet/:spreadsheetId')
//   // async getChatsBySpreadsheetId(
//   //   @Param('spreadsheetId') spreadsheetId: string,
//   //   @Query('userId') userId: string
//   // ) {
//   //   // @Query 파라미터는 DTO를 사용하지 않으면 파이프가 기본적으로 검증하지 않으므로 수동 검사가 필요합니다.
//   //   if (!userId) {
//   //     throw new BadRequestException('사용자 ID(userId) 쿼리 파라미터가 필요합니다.');
//   //   }
//   //   this.logger.log(`스프레드시트(${spreadsheetId})에 연결된 채팅 목록 조회 (사용자: ${userId})`);
//   //   const chats = await this.artifactService.getChatsBySpreadsheetId(spreadsheetId, userId);
    
//   //   return {
//   //     success: true,
//   //     spreadsheetId,
//   //     chats,
//   //     totalCount: chats.length
//   //   };
//   // }

//   // @Get('spreadsheet/by-chat/:chatId')
//   // async getSpreadsheetIdByChat(@Param('chatId') chatId: string) {
//   //   this.logger.log(`채팅(${chatId})에 연결된 스프레드시트 ID 조회`);
//   //   const spreadsheetId = await this.artifactService.getSpreadsheetIdByChat(chatId);
    
//   //   return {
//   //     success: true,
//   //     chatId,
//   //     spreadsheetId,
//   //     hasSpreadsheet: !!spreadsheetId
//   //   };
//   // }
// }
