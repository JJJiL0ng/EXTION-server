// // AI Chat REST API Controller - WebSocket 기반 ai-chat.gateway의 REST API 버전

// // curl -X POST http://localhost:8080/ai-chat/process \
// //   -H "Content-Type: application/json" \
// //   -d '{
// //     "spreadsheetId": "ff843995-962a-4761-982a-0ff13b02ec03",
// //     "chatId": "a82ba5cd-da19-48d9-bd49-2e3174d1753c",
// //     "userId": "guest_739a77a7-e872-4322-9c2f-b7d7117b7d1f",
// //     "chatMode": "agent",
// //     "userQuestionMessage": "안녕",
// //     "parsedSheetNames": ["Sheet1"],
// //     "jobId": "jobId_3c6198cd-6dcb-439b-9f96-f5db36b1a7fc"
// //   }'

// import { Controller, Post, Body, Logger, HttpException, HttpStatus } from '@nestjs/common';
// import { AiChatService } from './ai-chat.service';
// import { aiChatApiReq, aiChatApiRes } from './types/aiChat.types';
// import { dataEditCommand } from '../ai-agent/types/dataEdit.types';
// import { v4 as uuidv4 } from 'uuid';

// import { TableDataJsonSaveService } from 'src/v2/sheet/_table-data-json-save/table-data-json-save.service';

// @Controller('ai-chat')
// export class AiChatController {
//   private readonly logger = new Logger(AiChatController.name);

//   constructor(
//     private readonly aiChatService: AiChatService,
//     private readonly tableDataJsonSaveService: TableDataJsonSaveService
//   ) {}

//   /**
//    * AI Chat REST API - WebSocket 대신 사용할 수 있는 동기적 AI 채팅 엔드포인트
//    * WebSocket Gateway와 동일한 aiChatApiReq를 받아서 처리
//    */
//   @Post('process')
//   async processAiChat(@Body() aiChatReq: aiChatApiReq): Promise<aiChatApiRes> {
//     const startTime = Date.now();
    
//     // JobId가 없으면 생성
//     if (!aiChatReq.jobId) {
//       aiChatReq.jobId = uuidv4();
//     }
    
//     this.logger.log(`AI Chat REST API 요청 시작 - JobId: ${aiChatReq.jobId}, 스프레드시트: ${aiChatReq.spreadsheetId}`);

//     try {
//       // 입력 데이터 검증
//       if (!aiChatReq.spreadsheetId || !aiChatReq.chatId || !aiChatReq.userId) {
//         this.logger.error(`필수 파라미터 누락 - JobId: ${aiChatReq.jobId}`);
//         throw new HttpException(
//           {
//             message: 'MISSING_REQUIRED_PARAMETERS',
//             code: 'VALIDATION_ERROR',
//             details: 'spreadsheetId, chatId, userId는 필수 파라미터입니다.'
//           },
//           HttpStatus.BAD_REQUEST
//         );
//       }

//       // 기본값 설정
//       const processedReq: aiChatApiReq = {
//         ...aiChatReq,
//         chatMode: aiChatReq.chatMode ?? 'agent',
//         parsedSheetNames: aiChatReq.parsedSheetNames ?? [],
//         websocketClientId: 'rest-api-' + aiChatReq.jobId // REST API용 가상 클라이언트 ID
//       };

//       this.logger.log(`처리된 요청 - parsedSheetNames: ${JSON.stringify(processedReq.parsedSheetNames)}, chatMode: ${processedReq.chatMode}`);

//       // 스프레드시트 데이터 로드
//       this.logger.log(`컨트롤러에서 loadParsedSpreadsheetData 호출 전 - spreadsheetId: ${processedReq.spreadsheetId}, parsedSheetNames: ${JSON.stringify(processedReq.parsedSheetNames)}, userId: ${processedReq.userId}`);

//       const previousMessages = await this.aiChatService.loadMultiturnMessages(processedReq.chatId);


//       const dataContext = await this.aiChatService.loadParsedSpreadsheetData(
//         processedReq.spreadsheetId, 
//         processedReq.parsedSheetNames, 
//         processedReq.userId,
//         processedReq.spreadsheetVersionNumber
//       );

//       this.logger.log(`컨트롤러에서 loadParsedSpreadsheetData 호출 후 - dataContext: ${dataContext ? 'SUCCESS' : 'NULL'}`);

//       if (!dataContext) {
//         this.logger.error(`스프레드시트 데이터 로드 실패 - JobId: ${processedReq.jobId}`);
//         throw new HttpException(
//           {
//             message: 'SPREADSHEET_DATA_NOT_FOUND',
//             code: 'DATA_ERROR',
//             details: '요청한 스프레드시트 데이터를 찾을 수 없습니다.'
//           },
//           HttpStatus.NOT_FOUND
//         );
//       }

//       // (추가) 사용자 메시지 저장: previousMessages/dataContext 조회 이후, 플랜 수립 이전
//       try {
//         await this.aiChatService.saveUserMessage(processedReq);
//       } catch (saveUserErr) {
//         this.logger.error(`사용자 메시지 저장 실패 - JobId: ${processedReq.jobId}, ${(saveUserErr as Error).message}`);
//         // 실패해도 흐름 중단하지 않음
//       }

//       // 1) 계획 수립
//       const { plan } = await this.aiChatService.planTasks(processedReq, dataContext, previousMessages);

//       // 2) 작업 실행 (agent 모드인 경우에만)
//       let results: dataEditCommand[] = [];
//       if (processedReq.chatMode === 'agent') {
//         const executionResult = await this.aiChatService.runPlannedTasks(plan, dataContext, previousMessages);
//         results = executionResult.results;
//       }

//       const executionTime = Date.now() - startTime;
//       this.logger.log(`AI Chat REST API 완료 - JobId: ${processedReq.jobId}, 소요시간: ${executionTime}ms, 결과 수: ${results.length}`);
//       const apiRes: aiChatApiRes = {
//         jobId: processedReq.jobId,
//         taskManagerOutput: plan,
//         dataEditChatRes: {
//           dataEditCommands: results
//         },
//         spreadsheetVersionNumber: processedReq.spreadsheetVersionNumber + 1 // 편집 명령이 있으면 버전 번호 1 증가
//       };

//       // (추가) AI 메시지 저장: agent 모드에서 결과가 존재할 때. 비동기(논블로킹) 저장
//       if (processedReq.chatMode === 'agent' && results.length > 0) {
//         void this.aiChatService.saveAssistantMessage(processedReq.chatId, apiRes)
//           .catch(err => {
//             this.logger.error(`AI 응답 저장 실패 - JobId: ${processedReq.jobId}, ${err instanceof Error ? err.message : err}`);
//           });
//       }
//        // 백앤드에서 응답에 성공하면 새로운 버전일경우 사용하여 새로운 시트 업데이트
//       if (processedReq.newVersionSpreadSheetData) {
//         this.tableDataJsonSaveService.addNewVersionSpreadSheetData({
//           userId: processedReq.userId,
//           spreadSheetId: processedReq.spreadsheetId,
//           spreadSheetVersionNumber: processedReq.spreadsheetVersionNumber,
//           jsonData: processedReq.newVersionSpreadSheetData,
//         }).catch(err => {
//           this.logger.error(`새 버전 스프레드시트 데이터 저장 실패 - userId: ${processedReq.userId}, spreadsheetId: ${processedReq.spreadsheetId}, ${err instanceof Error ? err.message : err}`);
//         });
//       }

//       // 응답 반환 (WebSocket 응답 형식과 통일)
//       return apiRes;

//     } catch (error) {
//       const executionTime = Date.now() - startTime;
//       this.logger.error(`AI Chat REST API 실패 - JobId: ${aiChatReq.jobId}, 소요시간: ${executionTime}ms, 에러: ${error instanceof Error ? error.message : 'Unknown error'}`, error instanceof Error ? error.stack : undefined);
      
//       // HttpException이면 그대로 재던지기
//       if (error instanceof HttpException) {
//         throw error;
//       }

//       // 그 외의 경우 내부 서버 오류로 처리
//       throw new HttpException(
//         {
//           message: process.env.NODE_ENV === 'production' ? 'INTERNAL_SERVER_ERROR' : (error instanceof Error ? error.message : 'Unknown error'),
//           code: 'PROCESSING_ERROR',
//           details: 'AI 채팅 처리 중 오류가 발생했습니다.'
//         },
//         HttpStatus.INTERNAL_SERVER_ERROR
//       );
//     }
//   }
// }
