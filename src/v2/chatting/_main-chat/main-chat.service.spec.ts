// // src/v2/chatting/_main-chat/main-chat.service.spec.ts

// import { Test, TestingModule } from '@nestjs/testing';
// import { Logger, NotFoundException, BadRequestException } from '@nestjs/common';
// import { MainChatService } from './main-chat.service';
// import { PrismaService } from '../../../prisma/prisma.service';
// import { MainAiService } from '../../ai/_main-ai-service/main-ai.service';
// import { TableDataCacheService } from '../../cache/_table-data-cache/table-data-cache.service';
// import { MainChatRequestDto } from './dto/main-chat-req.dto';
// import {
//   ChatIntentType,
//   ExcelFormulaResponseDto,
//   PythonCodeGeneratorResponseDto,
//   WholeDataResponseDto,
//   GeneralHelpResponseDto
// } from './dto/main-chat-res.dto';
// import {
//   ExcelFormulaResult,
//   PythonCodeGeneratorResult,
//   WholeDataResult,
//   GeneralHelpResult
// } from '../../ai/_types/ai-request-result.types';
// import { StreamUpdate } from '../../ai/_types/chain.types';
// import { SpreadSheetStructure } from '../../sheet/types/spreadsheet.types';
// import { Subject } from 'rxjs';
// import { MessageRole, MessageType, ChatStatus } from '@prisma/client';

// describe('MainChatService', () => {
//   let service: MainChatService;
//   let prisma: jest.Mocked<PrismaService>;
//   let mainAiService: jest.Mocked<MainAiService>;
//   let cacheService: jest.Mocked<TableDataCacheService>;

//   // 테스트 데이터 상수
//   const mockUserId = 'test-user-123';
//   const mockChatId = 'chat-123';
//   const mockMessageId = 'message-123';
//   const mockSpreadsheetId = 'spreadsheet-123';
//   const mockUserMessage = '스프레드시트 데이터를 분석해주세요';

//   const mockChatRequest: MainChatRequestDto = {
//     chatInputMessage: mockUserMessage,
//     spreadsheetId: mockSpreadsheetId,
//     timestamp: '2024-01-01T00:00:00.000Z',
//     chatId: undefined
//   };

//   const mockSpreadsheetData: SpreadSheetStructure = {
//     version: '1.0',
//     sheets: {
//       'Sheet1': {
//         id: 'sheet1',
//         name: 'Sheet1',
//         data: {
//           dataTable: {
//             'A1': { value: 'Name' },
//             'B1': { value: 'Age' },
//             'C1': { value: 'Score' },
//             'A2': { value: 'Alice' },
//             'B2': { value: '25' },
//             'C2': { value: '95' },
//             'A3': { value: 'Bob' },
//             'B3': { value: '30' },
//             'C3': { value: '87' }
//           }
//         }
//       }
//     },
//     id: mockSpreadsheetId,
//     fileName: 'test-spreadsheet.xlsx',
//     totalCells: 9,
//     dataHash: 'hash123',
//     parsedAt: new Date('2024-01-01')
//   };

//   const mockChat = {
//     id: mockChatId,
//     title: '스프레드시트 데이터 분석',
//     userId: mockUserId,
//     spreadSheetId: mockSpreadsheetId,
//     messageCount: 0,
//     status: ChatStatus.ACTIVE,
//     createdAt: new Date('2024-01-01'),
//     updatedAt: new Date('2024-01-01')
//   };

//   const mockUserMessageRecord = {
//     id: mockMessageId,
//     content: mockUserMessage,
//     role: MessageRole.USER,
//     type: MessageType.TEXT,
//     chatId: mockChatId,
//     metadata: {
//       sheetContext: {
//         spreadsheetId: mockSpreadsheetId,
//         timestamp: '2024-01-01T00:00:00.000Z'
//       }
//     },
//     createdAt: new Date('2024-01-01T00:00:00.000Z')
//   };

//   beforeEach(async () => {
//     // PrismaService 모킹
//     const mockPrismaService = {
//       $transaction: jest.fn(),
//       chat: {
//         findFirst: jest.fn(),
//         findMany: jest.fn(),
//         create: jest.fn(),
//         update: jest.fn()
//       },
//       message: {
//         findMany: jest.fn(),
//         create: jest.fn()
//       },
//       spreadSheet: {
//         findFirst: jest.fn()
//       }
//     };

//     // MainAiService 모킹
//     const mockMainAiService = {
//       realtimeSpreadSheetAiAgent: jest.fn()
//     };

//     // TableDataCacheService 모킹
//     const mockCacheService = {
//       getGPTReadyData: jest.fn()
//     };

//     const module: TestingModule = await Test.createTestingModule({
//       providers: [
//         MainChatService,
//         {
//           provide: PrismaService,
//           useValue: mockPrismaService
//         },
//         {
//           provide: MainAiService,
//           useValue: mockMainAiService
//         },
//         {
//           provide: TableDataCacheService,
//           useValue: mockCacheService
//         }
//       ]
//     }).compile();

//     service = module.get<MainChatService>(MainChatService);
//     prisma = module.get(PrismaService);
//     mainAiService = module.get(MainAiService);
//     cacheService = module.get(TableDataCacheService);
//   });

//   afterEach(() => {
//     jest.clearAllMocks();
//   });

//   /**
//    * 서비스 기본 초기화 테스트
//    */
//   describe('Service Initialization', () => {
//     it('서비스가 정상적으로 초기화되어야 한다', () => {
//       expect(service).toBeDefined();
//       expect(service).toBeInstanceOf(MainChatService);
//     });

//     it('필요한 의존성들이 주입되어야 한다', () => {
//       expect(prisma).toBeDefined();
//       expect(mainAiService).toBeDefined();
//       expect(cacheService).toBeDefined();
//     });
//   });

//   /**
//    * SSE 스트리밍 채팅 테스트
//    */
//   describe('streamChat', () => {
//     beforeEach(() => {
//       // 기본 트랜잭션 모킹 설정
//       prisma.$transaction.mockImplementation(async (callback) => {
//         return callback(prisma);
//       });
//     });

//     it('새로운 채팅으로 SSE 스트림을 성공적으로 시작해야 한다', async () => {
//       // Given: 새로운 채팅 요청 (chatId 없음)
//       const newChatRequest = { ...mockChatRequest, chatId: undefined };

//       // 새 채팅 생성 모킹
//       (prisma.chat.create as jest.Mock).mockResolvedValue(mockChat);
//       (prisma.message.create as jest.Mock).mockResolvedValue(mockUserMessageRecord);
//       (prisma.chat.update as jest.Mock).mockResolvedValue(mockChat);

//       // 스프레드시트 데이터 로딩 모킹
//       (prisma.spreadSheet.findFirst as jest.Mock).mockResolvedValue({
//         id: mockSpreadsheetId,
//         fileName: 'test.xlsx',
//         userId: mockUserId,
//         data: { id: 'data-123' }
//       });

//       cacheService.getGPTReadyData.mockResolvedValue({
//         data: {
//           sheets: new Map([['Sheet1', {
//             csvData: 'Name,Age,Score\nAlice,25,95\nBob,30,87',
//             cellCount: 9,
//             metadata: {
//               name: 'Sheet1',
//               cellCount: 9,
//               includeFormulas: false,
//               includeStyles: false
//             }
//           }]]),
//           totalCells: 9,
//           dataHash: 'hash123',
//           parsedAt: new Date()
//         },
//         source: 'memory',
//         timing: 60,
//         cached: true
//       });

//       // AI 서비스 성공 응답 모킹
//       const mockAiResult: GeneralHelpResult = {
//         success: true,
//         tokensUsed: 150,
//         responseTime: 1500,
//         model: 'claude',
//         cached: false,
//         confidence: 0.9,
//         generalHelp: {
//           directAnswer: '스프레드시트 데이터 분석 결과입니다.',
//           additionalResources: []
//         }
//       };

//       mainAiService.realtimeSpreadSheetAiAgent.mockImplementation(
//         async (userId, data, question, onUpdate, onComplete, onError) => {
//           // 스트림 업데이트 시뮬레이션
//           onUpdate({
//             type: 'step_start',
//             step: 'intent_analysis',
//             timestamp: Date.now(),
//             progress: { current: 1, total: 3, message: '의도 분석 중...' }
//           });

//           // 완료 콜백 호출
//           setTimeout(() => {
//             if (onComplete) {
//               onComplete(mockAiResult);
//             }
//           }, 100);
//         }
//       );

//       // When: 스트림 채팅 실행
//       const observable = await service.streamChat(newChatRequest, mockUserId);

//       // Then: Observable이 반환되어야 한다
//       expect(observable).toBeDefined();
//       expect(prisma.chat.create).toHaveBeenCalledWith({
//         data: {
//           title: expect.stringContaining('스프레드시트'),
//           userId: mockUserId,
//           spreadSheetId: mockSpreadsheetId,
//           messageCount: 0,
//           status: ChatStatus.ACTIVE
//         }
//       });
//       expect(prisma.message.create).toHaveBeenCalledWith({
//         data: expect.objectContaining({
//           content: mockUserMessage,
//           role: MessageRole.USER,
//           type: MessageType.TEXT,
//           chatId: mockChat.id
//         })
//       });
//     });

//     it('기존 채팅으로 SSE 스트림을 성공적으로 시작해야 한다', async () => {
//       // Given: 기존 채팅 요청
//       const existingChatRequest = { ...mockChatRequest, chatId: mockChatId };

//       // 기존 채팅 조회 모킹
//       (prisma.chat.findFirst as jest.Mock).mockResolvedValue(mockChat);
//       (prisma.message.create as jest.Mock).mockResolvedValue(mockUserMessageRecord);
//       (prisma.chat.update as jest.Mock).mockResolvedValue(mockChat);

//       // 스프레드시트 없는 경우
//       const requestWithoutSpreadsheet = { ...existingChatRequest, spreadsheetId: undefined };

//       // AI 서비스 모킹
//       mainAiService.realtimeSpreadSheetAiAgent.mockImplementation(
//         async (userId, data, question, onUpdate, onComplete, onError) => {
//           if (onComplete) {
//             onComplete({
//               success: true,
//               tokensUsed: 100,
//               responseTime: 1000,
//               model: 'claude',
//               cached: false,
//               generalHelp: {
//                 directAnswer: '일반적인 도움말입니다.'
//               }
//             } as GeneralHelpResult);
//           }
//         }
//       );

//       // When: 스트림 채팅 실행
//       const observable = await service.streamChat(requestWithoutSpreadsheet, mockUserId);

//       // Then: 기존 채팅을 사용해야 한다
//       expect(observable).toBeDefined();
//       expect(prisma.chat.findFirst).toHaveBeenCalledWith({
//         where: {
//           id: mockChatId,
//           userId: mockUserId,
//           status: ChatStatus.ACTIVE
//         }
//       });
//       expect(prisma.chat.create).not.toHaveBeenCalled();
//     });

//     it('존재하지 않는 채팅 ID로 요청시 에러를 처리해야 한다', async () => {
//       // Given: 존재하지 않는 채팅 ID
//       const invalidChatRequest = { ...mockChatRequest, chatId: 'invalid-chat-id' };

//       (prisma.chat.findFirst as jest.Mock).mockResolvedValue(null);

//       // When: 스트림 채팅 실행
//       const observable = await service.streamChat(invalidChatRequest, mockUserId);

//       // Then: Observable이 반환되고 에러가 스트림으로 전송되어야 한다
//       expect(observable).toBeDefined();

//       let errorReceived = false;
//       observable.subscribe({
//         next: (sseData) => {
//           if (sseData.includes('event: error')) {
//             errorReceived = true;
//           }
//         },
//         error: () => {
//           // Handle error
//         },
//         complete: () => {
//           // Handle complete
//         }
//       });

//       await new Promise(resolve => setTimeout(resolve, 100));
//       expect(errorReceived).toBe(true);
//     });

//     it('AI 처리 중 에러 발생시 스트림으로 에러를 전송해야 한다', async () => {
//       // Given: 에러를 발생시키는 AI 서비스
//       (prisma.chat.create as jest.Mock).mockResolvedValue(mockChat);
//       (prisma.message.create as jest.Mock).mockResolvedValue(mockUserMessageRecord);
//       (prisma.chat.update as jest.Mock).mockResolvedValue(mockChat);

//       mainAiService.realtimeSpreadSheetAiAgent.mockImplementation(
//         async (userId, data, question, onUpdate, onComplete, onError) => {
//           // 에러 콜백 호출
//           setTimeout(() => {
//             if (onError) {
//               onError('AI 처리 중 에러 발생');
//             }
//           }, 100);
//         }
//       );

//       // When: 스트림 채팅 실행
//       const observable = await service.streamChat(mockChatRequest, mockUserId);

//       // Then: 에러가 처리되어야 한다
//       expect(observable).toBeDefined();

//       let errorReceived = false;
//       observable.subscribe({
//         next: (sseData) => {
//           if (sseData.includes('event: error') && sseData.includes('AI processing failed')) {
//             errorReceived = true;
//           }
//         }
//       });

//       await new Promise(resolve => setTimeout(resolve, 200));
//       expect(errorReceived).toBe(true);
//     });

//     it('다양한 AI 응답 타입에 대해 올바른 타입별 응답을 생성해야 한다', async () => {
//       // Given: 각기 다른 AI 응답 타입들
//       const formulaResult: ExcelFormulaResult = {
//         success: true,
//         tokensUsed: 120,
//         responseTime: 1200,
//         model: 'claude',
//         cached: false,
//         confidence: 0.95,
//         formulaDetails: {
//           name: 'SUM',
//           description: '선택한 셀 범위의 합계를 계산합니다.',
//           syntax: 'SUM(number1, [number2], ...)',
//           parameters: [
//             { name: 'number1', description: '첫 번째 숫자', required: true }
//           ]
//         }
//       };

//       (prisma.chat.create as jest.Mock).mockResolvedValue(mockChat);
//       (prisma.message.create as jest.Mock).mockResolvedValue(mockUserMessageRecord);
//       (prisma.chat.update as jest.Mock).mockResolvedValue(mockChat);

//       mainAiService.realtimeSpreadSheetAiAgent.mockImplementation(
//         async (userId, data, question, onUpdate, onComplete, onError) => {
//           if (onComplete) {
//             onComplete(formulaResult);
//           }
//         }
//       );

//       // When: 스트림 채팅 실행
//       const observable = await service.streamChat(mockChatRequest, mockUserId);

//       // Then: ExcelFormula 타입 응답이 생성되어야 한다
//       expect(observable).toBeDefined();

//       let responseReceived = false;
//       observable.subscribe({
//         next: (sseData) => {
//           if (sseData.includes('event: chat_response')) {
//             const dataMatch = sseData.match(/data: (.+)/);
//             if (dataMatch) {
//               const response = JSON.parse(dataMatch[1]);
//               if (response.intent === ChatIntentType.EXCEL_FORMULA) {
//                 responseReceived = true;
//               }
//             }
//           }
//         }
//       });

//       await new Promise(resolve => setTimeout(resolve, 200));
//       expect(responseReceived).toBe(true);
//     });
//   });

//   /**
//    * 채팅 기록 조회 테스트
//    */
//   describe('getChatHistory', () => {
//     const mockMessages = [
//       {
//         id: 'msg-1',
//         content: '안녕하세요',
//         role: MessageRole.USER,
//         type: MessageType.TEXT,
//         createdAt: new Date('2024-01-01T10:00:00Z'),
//         metadata: {},
//         sheetContext: null
//       },
//       {
//         id: 'msg-2',
//         content: '안녕하세요! 도움이 필요하시면 말씀해주세요.',
//         role: MessageRole.ASSISTANT,
//         type: MessageType.ANALYSIS,
//         createdAt: new Date('2024-01-01T10:01:00Z'),
//         metadata: { tokensUsed: 50 },
//         sheetContext: null
//       }
//     ];

//     it('유효한 채팅 ID로 기록을 성공적으로 조회해야 한다', async () => {
//       // Given: 유효한 채팅 데이터
//       (prisma.chat.findFirst as jest.Mock).mockResolvedValue(mockChat);
//       (prisma.message.findMany as jest.Mock).mockResolvedValue(mockMessages);

//       // When: 채팅 기록 조회
//       const result = await service.getChatHistory(mockChatId, mockUserId);

//       // Then: 올바른 채팅 기록이 반환되어야 한다
//       expect(result).toEqual({
//         chatId: mockChatId,
//         title: mockChat.title,
//         messageCount: mockChat.messageCount,
//         messages: mockMessages,
//         hasMore: false
//       });

//       expect(prisma.chat.findFirst).toHaveBeenCalledWith({
//         where: {
//           id: mockChatId,
//           userId: mockUserId,
//           status: ChatStatus.ACTIVE
//         }
//       });

//       expect(prisma.message.findMany).toHaveBeenCalledWith({
//         where: { chatId: mockChatId },
//         orderBy: { createdAt: 'asc' },
//         take: 50,
//         skip: 0,
//         select: expect.objectContaining({
//           id: true,
//           content: true,
//           role: true,
//           type: true,
//           createdAt: true,
//           metadata: true,
//           sheetContext: true
//         })
//       });
//     });

//     it('페이지네이션이 올바르게 동작해야 한다', async () => {
//       // Given: 페이지네이션 파라미터
//       const limit = 10;
//       const offset = 20;

//       (prisma.chat.findFirst as jest.Mock).mockResolvedValue(mockChat);
//       (prisma.message.findMany as jest.Mock).mockResolvedValue(mockMessages.slice(0, limit));

//       // When: 페이지네이션으로 조회
//       const result = await service.getChatHistory(mockChatId, mockUserId, limit, offset);

//       // Then: 올바른 페이지네이션이 적용되어야 한다
//       expect(prisma.message.findMany).toHaveBeenCalledWith(
//         expect.objectContaining({
//           take: limit,
//           skip: offset
//         })
//       );

//       expect(result.hasMore).toBe(true); // limit만큼 반환되면 hasMore = true
//     });

//     it('존재하지 않거나 접근 권한이 없는 채팅에 대해 NotFoundException을 발생시켜야 한다', async () => {
//       // Given: 존재하지 않는 채팅
//       (prisma.chat.findFirst as jest.Mock).mockResolvedValue(null);

//       // When & Then: NotFoundException이 발생해야 한다
//       await expect(
//         service.getChatHistory('invalid-chat-id', mockUserId)
//       ).rejects.toThrow(NotFoundException);

//       expect(prisma.message.findMany).not.toHaveBeenCalled();
//     });

//     it('데이터베이스 에러 발생시 BadRequestException을 발생시켜야 한다', async () => {
//       // Given: 데이터베이스 에러
//       (prisma.chat.findFirst as jest.Mock).mockRejectedValue(new Error('Database connection failed'));

//       // When & Then: BadRequestException이 발생해야 한다
//       await expect(
//         service.getChatHistory(mockChatId, mockUserId)
//       ).rejects.toThrow(BadRequestException);
//     });
//   });

//   /**
//    * 사용자 채팅 목록 조회 테스트
//    */
//   describe('getUserChats', () => {
//     const mockUserChats = [
//       {
//         id: 'chat-1',
//         title: '스프레드시트 분석',
//         messageCount: 5,
//         createdAt: new Date('2024-01-01T10:00:00Z'),
//         updatedAt: new Date('2024-01-01T11:00:00Z'),
//         spreadSheetId: 'sheet-1',
//         spreadSheet: { fileName: 'data.xlsx' }
//       },
//       {
//         id: 'chat-2',
//         title: '일반 질문',
//         messageCount: 3,
//         createdAt: new Date('2024-01-01T09:00:00Z'),
//         updatedAt: new Date('2024-01-01T09:30:00Z'),
//         spreadSheetId: null,
//         spreadSheet: null
//       }
//     ];

//     it('사용자의 채팅 목록을 성공적으로 조회해야 한다', async () => {
//       // Given: 사용자 채팅 데이터
//       (prisma.chat.findMany as jest.Mock).mockResolvedValue(mockUserChats);

//       // When: 사용자 채팅 목록 조회
//       const result = await service.getUserChats(mockUserId);

//       // Then: 올바른 채팅 목록이 반환되어야 한다
//       expect(result).toEqual({
//         chats: mockUserChats,
//         hasMore: false
//       });

//       expect(prisma.chat.findMany).toHaveBeenCalledWith({
//         where: {
//           userId: mockUserId,
//           status: ChatStatus.ACTIVE
//         },
//         orderBy: { updatedAt: 'desc' },
//         take: 20,
//         skip: 0,
//         select: expect.objectContaining({
//           id: true,
//           title: true,
//           messageCount: true,
//           createdAt: true,
//           updatedAt: true,
//           spreadSheetId: true,
//           spreadSheet: { select: { fileName: true } }
//         })
//       });
//     });

//     it('페이지네이션이 올바르게 동작해야 한다', async () => {
//       // Given: 페이지네이션 파라미터
//       const limit = 5;
//       const offset = 10;
//       const pagedChats = mockUserChats.slice(0, limit);

//       (prisma.chat.findMany as jest.Mock).mockResolvedValue(pagedChats);

//       // When: 페이지네이션으로 조회
//       const result = await service.getUserChats(mockUserId, limit, offset);

//       // Then: 올바른 페이지네이션이 적용되어야 한다
//       expect(prisma.chat.findMany).toHaveBeenCalledWith(
//         expect.objectContaining({
//           take: limit,
//           skip: offset
//         })
//       );

//       expect(result.hasMore).toBe(true); // limit만큼 반환되면 hasMore = true
//     });

//     it('빈 채팅 목록에 대해 올바른 응답을 반환해야 한다', async () => {
//       // Given: 빈 채팅 목록
//       (prisma.chat.findMany as jest.Mock).mockResolvedValue([]);

//       // When: 사용자 채팅 목록 조회
//       const result = await service.getUserChats(mockUserId);

//       // Then: 빈 배열과 hasMore false가 반환되어야 한다
//       expect(result).toEqual({
//         chats: [],
//         hasMore: false
//       });
//     });

//     it('데이터베이스 에러 발생시 BadRequestException을 발생시켜야 한다', async () => {
//       // Given: 데이터베이스 에러
//       (prisma.chat.findMany as jest.Mock).mockRejectedValue(new Error('Database query failed'));

//       // When & Then: BadRequestException이 발생해야 한다
//       await expect(
//         service.getUserChats(mockUserId)
//       ).rejects.toThrow(BadRequestException);
//     });
//   });

//   /**
//    * 프라이빗 메서드들의 간접 테스트
//    */
//   describe('Private Methods (Indirect Testing)', () => {
//     /**
//      * createChatAndUserMessage 메서드 테스트 (streamChat을 통한 간접 테스트)
//      */
//     describe('createChatAndUserMessage (via streamChat)', () => {
//       it('새로운 채팅과 사용자 메시지를 트랜잭션으로 생성해야 한다', async () => {
//         // Given: 새로운 채팅 요청
//         prisma.$transaction.mockImplementation(async (callback) => {
//           return callback(prisma);
//         });

//         (prisma.chat.create as jest.Mock).mockResolvedValue(mockChat);
//         (prisma.message.create as jest.Mock).mockResolvedValue(mockUserMessageRecord);
//         (prisma.chat.update as jest.Mock).mockResolvedValue(mockChat);

//         // AI 서비스 모킹 (완료까지 처리)
//         mainAiService.realtimeSpreadSheetAiAgent.mockImplementation(
//           async (userId, data, question, onUpdate, onComplete, onError) => {
//             if (onComplete) {
//               onComplete({
//                 success: true,
//                 tokensUsed: 100,
//                 responseTime: 1000,
//                 model: 'claude',
//                 cached: false,
//                 generalHelp: { directAnswer: '답변' }
//               } as GeneralHelpResult);
//             }


//             // When: 새로운 채팅 스트림 시작
//             await service.streamChat({ ...mockChatRequest, chatId: undefined }, mockUserId);

//             // Then: 트랜잭션 내에서 채팅과 메시지가 생성되어야 한다
//             expect(prisma.$transaction).toHaveBeenCalled();
//             expect(prisma.chat.create).toHaveBeenCalled();
//             expect(prisma.message.create).toHaveBeenCalled();
//             expect(prisma.chat.update).toHaveBeenCalledWith({
//               where: { id: mockChat.id },
//               data: {
//                 messageCount: { increment: 1 },
//                 updatedAt: expect.any(Date)
//               }
//             });
//           });
//       });

//       /**
//        * loadSpreadsheetData 메서드 테스트
//        */
//       describe('loadSpreadsheetData (via streamChat)', () => {
//         it('유효한 스프레드시트 ID로 데이터를 로드해야 한다', async () => {
//           // Given: 스프레드시트 데이터
//           (prisma.chat.create as jest.Mock).mockResolvedValue(mockChat);
//           (prisma.message.create as jest.Mock).mockResolvedValue(mockUserMessageRecord);
//           (prisma.chat.update as jest.Mock).mockResolvedValue(mockChat);

//           (prisma.spreadSheet.findFirst as jest.Mock).mockResolvedValue({
//             id: mockSpreadsheetId,
//             fileName: 'test.xlsx',
//             userId: mockUserId,
//             data: { id: 'data-123' }
//           });

//           cacheService.getGPTReadyData.mockResolvedValue({
//             data: {
//               sheets: new Map([['Sheet1', {
//                 csvData: 'Empty Data',
//                 cellCount: 9,
//                 metadata: {
//                   name: 'Sheet1',
//                   cellCount: 9,
//                   includeFormulas: false,
//                   includeStyles: false
//                 }
//               }]]),
//               totalCells: 9,
//               dataHash: 'hash123',
//               parsedAt: new Date()
//             },
//             source: 'memory',
//             timing: 60,
//             cached: true
//           });

//           mainAiService.realtimeSpreadSheetAiAgent.mockImplementation(
//             async (userId, data, question, onUpdate, onComplete, onError) => {
//               // 스프레드시트 데이터가 로드되었는지 확인
//               expect(data).toBeDefined();
//               expect(data.id).toBe(mockSpreadsheetId);

//               if (onComplete) {
//                 onComplete({
//                   success: true,
//                   tokensUsed: 100,
//                   responseTime: 1000,
//                   model: 'claude',
//                   cached: false,
//                   generalHelp: { directAnswer: '답변' }
//                 } as GeneralHelpResult);
//               }
//             }
//           );

//           // When: 스프레드시트와 함께 스트림 시작
//           await service.streamChat(mockChatRequest, mockUserId);

//           // Then: 스프레드시트 데이터가 로드되어야 한다
//           expect(prisma.spreadSheet.findFirst).toHaveBeenCalledWith({
//             where: {
//               id: mockSpreadsheetId,
//               userId: mockUserId
//             },
//             include: { data: true }
//           });
//           expect(cacheService.getGPTReadyData).toHaveBeenCalled();
//         });

//         it('스프레드시트 ID가 없으면 기본 구조를 사용해야 한다', async () => {
//           // Given: 스프레드시트 ID 없는 요청
//           const requestWithoutSheet = { ...mockChatRequest, spreadsheetId: undefined };

//           (prisma.chat.create as jest.Mock).mockResolvedValue(mockChat);
//           (prisma.message.create as jest.Mock).mockResolvedValue(mockUserMessageRecord);
//           (prisma.chat.update as jest.Mock).mockResolvedValue(mockChat);

//           mainAiService.realtimeSpreadSheetAiAgent.mockImplementation(
//             async (userId, data, question, onUpdate, onComplete, onError) => {
//               // 기본 빈 구조가 전달되어야 한다
//               expect(data.sheets).toEqual({});
//               expect(data.id).toBe('temp');

//               if (onComplete) {
//                 onComplete({
//                   success: true,
//                   tokensUsed: 100,
//                   responseTime: 1000,
//                   model: 'claude',
//                   cached: false,
//                   generalHelp: { directAnswer: '답변' }
//                 } as GeneralHelpResult);
//               }
//             }
//           );

//           // When: 스프레드시트 없이 스트림 시작
//           await service.streamChat(requestWithoutSheet, mockUserId);

//           // Then: 스프레드시트 관련 호출이 없어야 한다
//           expect(prisma.spreadSheet.findFirst).not.toHaveBeenCalled();
//           expect(cacheService.getGPTReadyData).not.toHaveBeenCalled();
//         });
//       });

//       /**
//        * saveAssistantMessage 메서드 테스트
//        */
//       describe('saveAssistantMessage (via AI completion)', () => {
//         it('AI 응답을 어시스턴트 메시지로 저장해야 한다', async () => {
//           // Given: AI 완료 응답
//           const mockAiResult: GeneralHelpResult = {
//             success: true,
//             tokensUsed: 150,
//             responseTime: 1500,
//             model: 'claude',
//             cached: false,
//             confidence: 0.9,
//             generalHelp: {
//               directAnswer: 'AI 응답 내용입니다.'
//             }
//           };

//           const mockAssistantMessage = {
//             id: 'assistant-msg-123',
//             content: 'AI 응답 내용입니다.',
//             role: MessageRole.ASSISTANT,
//             type: MessageType.ANALYSIS,
//             chatId: mockChatId,
//             metadata: {
//               tokensUsed: 150,
//               responseTime: 1500,
//               model: 'claude',
//               cached: false,
//               confidence: 0.9,
//               success: true
//             },
//             sheetContext: null
//           };

//           (prisma.chat.create as jest.Mock).mockResolvedValue(mockChat);
//           (prisma.message.create as jest.Mock)
//             .mockResolvedValueOnce(mockUserMessageRecord) // 첫 번째 호출 (사용자 메시지)
//             .mockResolvedValueOnce(mockAssistantMessage); // 두 번째 호출 (어시스턴트 메시지)
//           (prisma.chat.update as jest.Mock).mockResolvedValue(mockChat);

//           mainAiService.realtimeSpreadSheetAiAgent.mockImplementation(
//             async (userId, data, question, onUpdate, onComplete, onError) => {
//               if (onComplete) {
//                 // AI 응답 완료 콜백 호출   
//                 onComplete(mockAiResult);
//               }
//             }
//           );

//           // When: AI 완료와 함께 스트림 처리
//           const observable = await service.streamChat(mockChatRequest, mockUserId);

//           // 스트림 완료까지 대기
//           await new Promise<void>(resolve => {
//             observable.subscribe({
//               next: () => { },
//               error: () => resolve(),
//               complete: () => resolve()
//             });
//           });

//           // Then: 어시스턴트 메시지가 저장되어야 한다
//           expect(prisma.message.create).toHaveBeenCalledWith(
//             expect.objectContaining({
//               data: expect.objectContaining({
//                 content: expect.stringContaining('AI 응답 내용'),
//                 role: MessageRole.ASSISTANT,
//                 type: MessageType.ANALYSIS,
//                 chatId: mockChatId,
//                 metadata: expect.objectContaining({
//                   tokensUsed: 150,
//                   responseTime: 1500,
//                   model: 'claude',
//                   cached: false,
//                   confidence: 0.9,
//                   success: true
//                 })
//               })
//             })
//           );
//         });
//       });

//       /**
//        * createTypedResponse 메서드 테스트
//        */
//       describe('createTypedResponse (via AI completion)', () => {
//         it('ExcelFormula 타입 결과에 대해 올바른 응답을 생성해야 한다', async () => {
//           // Given: ExcelFormula AI 결과
//           const formulaResult: ExcelFormulaResult = {
//             success: true,
//             tokensUsed: 120,
//             responseTime: 1200,
//             model: 'claude',
//             cached: false,
//             confidence: 0.95,
//             formulaDetails: {
//               name: 'VLOOKUP',
//               description: '세로 조회 함수입니다.',
//               syntax: 'VLOOKUP(lookup_value, table_array, col_index_num, [range_lookup])',
//               parameters: [
//                 { name: 'lookup_value', description: '찾을 값', required: true },
//                 { name: 'table_array', description: '조회 테이블', required: true }
//               ]
//             }
//           };

//           (prisma.chat.create as jest.Mock).mockResolvedValue(mockChat);
//           (prisma.message.create as jest.Mock)
//             .mockResolvedValueOnce(mockUserMessageRecord)
//             .mockResolvedValueOnce({ id: 'assistant-123' });
//           (prisma.chat.update as jest.Mock).mockResolvedValue(mockChat);

//           let capturedResponse: any = null;

//           mainAiService.realtimeSpreadSheetAiAgent.mockImplementation(
//             async (userId, data, question, onUpdate, onComplete, onError) => {
//               if (onComplete) {
//                 onComplete(formulaResult);
//               }
//             }
//           );

//           // When: 스트림 처리 및 응답 캡처
//           const observable = await service.streamChat(mockChatRequest, mockUserId);

//           observable.subscribe({
//             next: (sseData) => {
//               if (sseData.includes('event: chat_response')) {
//                 const dataMatch = sseData.match(/data: (.+)/);
//                 if (dataMatch) {
//                   capturedResponse = JSON.parse(dataMatch[1]);
//                 }
//               }
//             }
//           });

//           // 완료까지 대기
//           await new Promise(resolve => setTimeout(resolve, 200));

//           // Then: ExcelFormula 타입 응답이 생성되어야 한다
//           expect(capturedResponse).toMatchObject({
//             intent: ChatIntentType.EXCEL_FORMULA,
//             formulaDetails: {
//               name: 'VLOOKUP',
//               description: '세로 조회 함수입니다.',
//               syntax: 'VLOOKUP(lookup_value, table_array, col_index_num, [range_lookup])',
//               parameters: formulaResult.formulaDetails.parameters
//             }
//           });
//         });

//         it('PythonCodeGenerator 타입 결과에 대해 올바른 응답을 생성해야 한다', async () => {
//           // Given: PythonCodeGenerator AI 결과
//           const codeResult: PythonCodeGeneratorResult = {
//             success: true,
//             tokensUsed: 200,
//             responseTime: 2000,
//             model: 'claude',
//             cached: false,
//             confidence: 0.9,
//             codeGenerator: {
//               pythonCode: 'import pandas as pd\ndf = pd.read_excel("data.xlsx")\nprint(df.head())',
//               explanation: '엑셀 파일을 읽어서 첫 5행을 출력하는 코드입니다.'
//             }
//           };

//           (prisma.chat.create as jest.Mock).mockResolvedValue(mockChat);
//           (prisma.message.create as jest.Mock)
//             .mockResolvedValueOnce(mockUserMessageRecord)
//             .mockResolvedValueOnce({ id: 'assistant-123' });
//           (prisma.chat.update as jest.Mock).mockResolvedValue(mockChat);

//           let capturedResponse: any = null;

//           mainAiService.realtimeSpreadSheetAiAgent.mockImplementation(
//             async (userId, data, question, onUpdate, onComplete, onError) => {
//               if (onComplete) {
//                 onComplete(codeResult);
//               }
//             }
//           );

//           // When: 스트림 처리
//           const observable = await service.streamChat(mockChatRequest, mockUserId);

//           observable.subscribe({
//             next: (sseData) => {
//               if (sseData.includes('event: chat_response')) {
//                 const dataMatch = sseData.match(/data: (.+)/);
//                 if (dataMatch) {
//                   capturedResponse = JSON.parse(dataMatch[1]);
//                 }
//               }
//             }
//           });

//           await new Promise(resolve => setTimeout(resolve, 200));

//           // Then: PythonCodeGenerator 타입 응답이 생성되어야 한다
//           expect(capturedResponse).toMatchObject({
//             intent: ChatIntentType.PYTHON_CODE_GENERATOR,
//             codeGenerator: {
//               pythonCode: codeResult.codeGenerator.pythonCode,
//               explanation: codeResult.codeGenerator.explanation,
//               importedLibraries: []
//             }
//           });
//         });
//       });

//       /**
//        * SSE 이벤트 전송 테스트
//        */
//       describe('SSE Event Sending', () => {
//         it('올바른 SSE 형식으로 이벤트를 전송해야 한다', async () => {
//           // Given: 기본 모킹 설정
//           (prisma.chat.create as jest.Mock).mockResolvedValue(mockChat);
//           (prisma.message.create as jest.Mock).mockResolvedValue(mockUserMessageRecord);
//           (prisma.chat.update as jest.Mock).mockResolvedValue(mockChat);

//           const receivedEvents: string[] = [];

//           mainAiService.realtimeSpreadSheetAiAgent.mockImplementation(
//             async (userId, data, question, onUpdate, onComplete, onError) => {
//               // 즉시 완료 처리
//               if (onComplete) {
//                 onComplete({
//                   success: true,
//                   tokensUsed: 100,
//                   responseTime: 1000,
//                   model: 'claude',
//                   cached: false,
//                   generalHelp: { directAnswer: '테스트 응답' }
//                 } as GeneralHelpResult);
//               }
//             }
//           );

//           // When: 스트림 처리 및 이벤트 수집
//           const observable = await service.streamChat(mockChatRequest, mockUserId);

//           observable.subscribe({
//             next: (sseData) => {
//               receivedEvents.push(sseData);
//             }
//           });

//           // 모든 이벤트 수집을 위한 대기
//           await new Promise(resolve => setTimeout(resolve, 300));

//           // Then: 올바른 SSE 형식의 이벤트들이 전송되어야 한다
//           expect(receivedEvents.length).toBeGreaterThan(0);

//           // 모든 이벤트가 SSE 형식이어야 한다
//           receivedEvents.forEach(event => {
//             expect(event).toMatch(/^event: \w+\ndata: .+\n\n$/);
//           });

//           // 예상되는 이벤트 타입들이 포함되어야 한다
//           const eventTypes = receivedEvents.map(event => {
//             const match = event.match(/^event: (\w+)/);
//             return match ? match[1] : null;
//           }).filter(Boolean);

//           expect(eventTypes).toContain('chat_started');
//           expect(eventTypes).toContain('ai_processing_started');
//           expect(eventTypes).toContain('chat_completed');
//         });
//       });
//     });

//     /**
//      * 에러 처리 및 엣지 케이스 테스트
//      */
//     describe('Error Handling and Edge Cases', () => {
//       it('데이터베이스 트랜잭션 실패 시 적절히 처리해야 한다', async () => {
//         // Given: 트랜잭션 실패
//         prisma.$transaction.mockRejectedValue(new Error('Transaction failed'));

//         // When & Then: 에러가 스트림으로 전송되어야 한다
//         const observable = await service.streamChat(mockChatRequest, mockUserId);

//         let errorReceived = false;
//         observable.subscribe({
//           next: (sseData) => {
//             if (sseData.includes('event: error')) {
//               errorReceived = true;
//             }
//           }
//         });

//         await new Promise(resolve => setTimeout(resolve, 100));
//         expect(errorReceived).toBe(true);
//       });

//       it('매우 긴 메시지에 대해 제목을 적절히 생성해야 한다', async () => {
//         // Given: 매우 긴 메시지
//         const longMessage = 'a'.repeat(100) + ' 스프레드시트 분석 요청입니다.';
//         const longMessageRequest = { ...mockChatRequest, chatInputMessage: longMessage };

//         (prisma.chat.create as jest.Mock).mockResolvedValue(mockChat);
//         (prisma.message.create as jest.Mock).mockResolvedValue(mockUserMessageRecord);
//         (prisma.chat.update as jest.Mock).mockResolvedValue(mockChat);

//         mainAiService.realtimeSpreadSheetAiAgent.mockImplementation(
//           async (userId, data, question, onUpdate, onComplete, onError) => {
//             if (onComplete) {
//               // AI 응답 완료 콜백 호출
//               onComplete({
//                 success: true,
//                 tokensUsed: 100,
//                 responseTime: 1000,
//                 model: 'claude',
//                 cached: false,
//                 generalHelp: { directAnswer: '응답' }
//               } as GeneralHelpResult);
//             }
//           }
//         );

//         // When: 긴 메시지로 새 채팅 시작
//         await service.streamChat({ ...longMessageRequest, chatId: undefined }, mockUserId);

//         // Then: 제목이 50자로 제한되어야 한다
//         expect(prisma.chat.create).toHaveBeenCalledWith({
//           data: expect.objectContaining({
//             title: expect.stringMatching(/^.{1,53}$/) // 50자 + "..." = 최대 53자
//           })
//         });
//       });

//       it('캐시 서비스 실패 시에도 기본 스프레드시트 구조로 처리해야 한다', async () => {
//         // Given: 캐시 서비스 실패
//         (prisma.chat.create as jest.Mock).mockResolvedValue(mockChat);
//         (prisma.message.create as jest.Mock).mockResolvedValue(mockUserMessageRecord);
//         (prisma.chat.update as jest.Mock).mockResolvedValue(mockChat);

//         (prisma.spreadSheet.findFirst as jest.Mock).mockResolvedValue({
//           id: mockSpreadsheetId,
//           fileName: 'test.xlsx',
//           userId: mockUserId,
//           data: { id: 'data-123' }
//         });

//         cacheService.getGPTReadyData.mockRejectedValue(new Error('Cache service failed'));

//         mainAiService.realtimeSpreadSheetAiAgent.mockImplementation(
//           async (userId, data, question, onUpdate, onComplete, onError) => {
//             // 캐시 실패해도 기본 구조가 전달되어야 한다
//             expect(data).toBeDefined();
//             expect(data.sheets).toEqual({});

//             if (onComplete) {
//               onComplete({
//                 success: true,
//                 tokensUsed: 100,
//                 responseTime: 1000,
//                 model: 'claude',
//                 cached: false,
//                 generalHelp: { directAnswer: '응답' }
//               } as GeneralHelpResult);
//             }
//           }
//         );

//         // When: 캐시 실패 상황에서 스트림 처리
//         await service.streamChat(mockChatRequest, mockUserId);

//         // Then: 에러가 발생하지 않고 기본 구조로 처리되어야 한다
//         expect(mainAiService.realtimeSpreadSheetAiAgent).toHaveBeenCalled();
//       });

//       it('어시스턴트 메시지 저장 실패 시 에러 스트림을 전송해야 한다', async () => {
//         // Given: 메시지 저장 실패
//         (prisma.chat.create as jest.Mock).mockResolvedValue(mockChat);
//         (prisma.message.create as jest.Mock)
//           .mockResolvedValueOnce(mockUserMessageRecord) // 사용자 메시지는 성공
//           .mockRejectedValueOnce(new Error('Message save failed')); // 어시스턴트 메시지 실패
//         (prisma.chat.update as jest.Mock).mockResolvedValue(mockChat);

//         let errorReceived = false;

//         mainAiService.realtimeSpreadSheetAiAgent.mockImplementation(
//           async (userId, data, question, onUpdate, onComplete, onError) => {
//             if (onComplete) {
//               // AI 응답 완료 콜백 호출
//               onComplete({
//                 success: true,
//                 tokensUsed: 100,
//                 responseTime: 1000,
//                 model: 'claude',
//                 cached: false,
//                 generalHelp: { directAnswer: '응답' }
//               } as GeneralHelpResult);
//             }
//           }
//         );

//         // When: 메시지 저장 실패 상황에서 스트림 처리
//         const observable = await service.streamChat(mockChatRequest, mockUserId);

//         observable.subscribe({
//           next: (sseData) => {
//             if (sseData.includes('event: error') && sseData.includes('Failed to save AI response')) {
//               errorReceived = true;
//             }
//           }
//         });

//         await new Promise(resolve => setTimeout(resolve, 300));

//         // Then: 저장 실패 에러가 스트림으로 전송되어야 한다
//         expect(errorReceived).toBe(true);
//       });
//     });

//     /**
//      * 성능 및 최적화 테스트
//      */
//     describe('Performance and Optimization', () => {
//       it('동시에 여러 스트림 요청을 처리할 수 있어야 한다', async () => {
//         // Given: 동시 요청을 위한 모킹
//         (prisma.chat.create as jest.Mock).mockResolvedValue(mockChat);
//         (prisma.message.create as jest.Mock).mockResolvedValue(mockUserMessageRecord);
//         (prisma.chat.update as jest.Mock).mockResolvedValue(mockChat);

//         let completedStreams = 0;

//         mainAiService.realtimeSpreadSheetAiAgent.mockImplementation(
//           async (userId, data, question, onUpdate, onComplete, onError) => {
//             // 랜덤 지연으로 실제 비동기 처리 시뮬레이션
//             setTimeout(() => {
//               if (onComplete) {
//                 onComplete({
//                   success: true,
//                   tokensUsed: 100,
//                   responseTime: 1000,
//                   model: 'claude',
//                   cached: false,
//                   generalHelp: { directAnswer: `응답 for ${question}` }
//                 } as GeneralHelpResult);
//               }
//             }, Math.random() * 100);
//           }
//         );

//         // When: 동시에 여러 스트림 시작
//         const requests = Array.from({ length: 3 }, (_, i) => ({
//           ...mockChatRequest,
//           chatInputMessage: `동시 요청 ${i + 1}`,
//           chatId: undefined
//         }));

//         const streamPromises = requests.map(request =>
//           service.streamChat(request, mockUserId)
//         );

//         const observables = await Promise.all(streamPromises);

//         // 모든 스트림 완료 대기
//         await Promise.all(
//           observables.map(observable =>
//             new Promise<void>(resolve => {
//               observable.subscribe({
//                 complete: () => {
//                   completedStreams++;
//                   resolve();
//                 },
//                 error: () => {
//                   completedStreams++;
//                   resolve();
//                 }
//               });
//             })
//           )
//         );

//         // Then: 모든 스트림이 완료되어야 한다
//         expect(completedStreams).toBe(3);
//         expect(prisma.chat.create).toHaveBeenCalledTimes(3);
//         expect(mainAiService.realtimeSpreadSheetAiAgent).toHaveBeenCalledTimes(3);
//       });

//       it('대용량 스프레드시트 데이터 처리 시 메모리 효율성을 유지해야 한다', async () => {
//         // Given: 대용량 스프레드시트 데이터
//         const largeSheetData: { [key: string]: { value: string } } = {};

//         // 많은 수의 셀 데이터 생성
//         for (let i = 0; i < 1000; i++) {
//           for (let j = 0; j < 20; j++) {
//             const cellAddress = `${String.fromCharCode(65 + (j % 26))}${i + 1}`;
//             largeSheetData[cellAddress] = { value: `Cell_${i}_${j}` };
//           }
//         }

//         const largeSpreadsheetData: SpreadSheetStructure = {
//           version: '1.0',
//           sheets: {
//             'LargeSheet': {
//               id: 'large-sheet',
//               name: 'LargeSheet',
//               data: {
//                 dataTable: largeSheetData
//               }
//             }
//           },
//           id: mockSpreadsheetId,
//           fileName: 'large-spreadsheet.xlsx',
//           totalCells: 20000,
//           dataHash: 'large-hash',
//           parsedAt: new Date()
//         };

//         (prisma.chat.create as jest.Mock).mockResolvedValue(mockChat);
//         (prisma.message.create as jest.Mock).mockResolvedValue(mockUserMessageRecord);
//         (prisma.chat.update as jest.Mock).mockResolvedValue(mockChat);

//         (prisma.spreadSheet.findFirst as jest.Mock).mockResolvedValue({
//           id: mockSpreadsheetId,
//           fileName: 'large-spreadsheet.xlsx',
//           userId: mockUserId,
//           data: { id: 'large-data-123' }
//         });

//         cacheService.getGPTReadyData.mockResolvedValue({
//           data: {
//             sheets: new Map([['LargeSheet', {
//               csvData: 'Large Sheet Data\n...(truncated for brevity)',
//               cellCount: 20000,
//               metadata: {
//                 name: 'LargeSheet',
//                 cellCount: 20000,
//                 includeFormulas: false,
//                 includeStyles: false
//               }
//             }]]),
//             totalCells: 20000,
//             dataHash: 'large-hash',
//             parsedAt: new Date()
//           },
//           source: 'memory',
//           timing: 200,
//           cached: true
//         });

//         let processedDataSize = 0;

//         mainAiService.realtimeSpreadSheetAiAgent.mockImplementation(
//           async (userId, data, question, onUpdate, onComplete, onError) => {
//             // 처리된 데이터 크기 확인
//             processedDataSize = JSON.stringify(data).length;

//             if (onComplete) {
//               onComplete({
//                 success: true,
//                 tokensUsed: 500,
//                 responseTime: 3000,
//                 model: 'claude',
//                 cached: false,
//                 generalHelp: { directAnswer: '대용량 데이터 분석 완료' }
//               } as GeneralHelpResult);
//             }
//           }
//         );

//         // When: 대용량 데이터로 스트림 처리
//         const observable = await service.streamChat(mockChatRequest, mockUserId);

//         await new Promise<void>(resolve => {
//           observable.subscribe({
//             next: () => { },
//             complete: () => resolve(),
//             error: () => resolve()
//           });
//         });

//         // Then: 대용량 데이터가 처리되어야 한다
//         expect(processedDataSize).toBeGreaterThan(10000); // 실제 대용량 데이터 처리 확인
//         expect(mainAiService.realtimeSpreadSheetAiAgent).toHaveBeenCalledWith(
//           mockUserId,
//           expect.objectContaining({
//             totalCells: 20000
//           }),
//           expect.any(String),
//           expect.any(Function),
//           expect.any(Function),
//           expect.any(Function)
//         );
//       });
//     });

//     /**
//      * 통합 테스트
//      */
//     describe('Integration Tests', () => {
//       it('전체 채팅 플로우가 올바르게 동작해야 한다 (E2E)', async () => {
//         // Given: 완전한 플로우를 위한 모킹
//         const fullFlowMocks = {
//           chat: { ...mockChat, id: 'integration-chat' },
//           userMessage: { ...mockUserMessageRecord, id: 'integration-user-msg' },
//           assistantMessage: {
//             id: 'integration-assistant-msg',
//             content: '완전한 분석 결과입니다.',
//             role: MessageRole.ASSISTANT,
//             type: MessageType.ANALYSIS,
//             chatId: 'integration-chat',
//             metadata: { tokensUsed: 200, responseTime: 2000 }
//           }
//         };

//         (prisma.chat.create as jest.Mock).mockResolvedValue(fullFlowMocks.chat);
//         (prisma.message.create as jest.Mock)
//           .mockResolvedValueOnce(fullFlowMocks.userMessage)
//           .mockResolvedValueOnce(fullFlowMocks.assistantMessage);
//         (prisma.chat.update as jest.Mock).mockResolvedValue(fullFlowMocks.chat);

//         (prisma.spreadSheet.findFirst as jest.Mock).mockResolvedValue({
//           id: mockSpreadsheetId,
//           fileName: 'integration-test.xlsx',
//           userId: mockUserId,
//           data: { id: 'integration-data' }
//         });

//         cacheService.getGPTReadyData.mockResolvedValue({
//           data: {
//             sheets: new Map([['Sheet1', {
//               csvData: 'Name,Age,Score\nAlice,25,95\nBob,30,87',
//               cellCount: 9,
//               metadata: {
//                 name: 'Sheet1',
//                 cellCount: 9,
//                 includeFormulas: false,
//                 includeStyles: false
//               }
//             }]]),
//             totalCells: 9,
//             dataHash: 'integration-hash',
//             parsedAt: new Date()
//           },
//           source: 'memory',
//           timing: 60,
//           cached: true
//         });

//         const finalAiResult: ExcelFormulaResult = {
//           success: true,
//           tokensUsed: 200,
//           responseTime: 2000,
//           model: 'claude',
//           cached: false,
//           confidence: 0.95,
//           formulaDetails: {
//             name: 'SUM',
//             description: '합계 함수',
//             syntax: 'SUM(range)',
//             parameters: [{ name: 'range', description: '범위', required: true }]
//           }
//         };

//         const receivedEvents: { event: string, data: any }[] = [];

//         mainAiService.realtimeSpreadSheetAiAgent.mockImplementation(
//           async (userId, data, question, onUpdate, onComplete, onError) => {
//             // 진행 단계 시뮬레이션 - 더 현실적인 AI 처리 과정 시뮬레이션
//             // 1. 의도 분석 단계
//             onUpdate({
//               type: 'step_start',
//               step: 'intent_analysis',
//               timestamp: Date.now(),
//               progress: { current: 1, total: 3, message: '의도 분석 중...' }
//             });

//             setTimeout(() => {
//               // 2. 중간 진행 단계 - 프롬프트 선택 및 처리
//               onUpdate({
//                 type: 'step_progress',
//                 step: 'prompt_selection',
//                 timestamp: Date.now(),
//                 progress: { current: 2, total: 3, message: '프롬프트 선택 중...' }
//               });

//               // AI 상태 업데이트 추가
//               onUpdate({
//                 type: 'step_progress',
//                 step: 'data_analysis',
//                 timestamp: Date.now(),
//                 progress: {
//                   current: 2,
//                   total: 3,
//                   message: '스프레드시트 데이터를 분석하는 중입니다...'
//                 }
//               });
//             }, 50);

//             setTimeout(() => {
//               // 3. 최종 단계 - 응답 생성 완료
//               onUpdate({
//                 type: 'step_complete',
//                 step: 'response_generation',
//                 timestamp: Date.now(),
//                 progress: { current: 3, total: 3, message: '응답 생성 완료' }
//               });

//               // 완료 및 결과 반환
//               if (typeof onComplete === 'function') {
//                 onComplete(finalAiResult);
//               }
//             }, 100);
//           }
//         );

//         // When: 전체 플로우 실행
//         const observable = await service.streamChat(
//           { ...mockChatRequest, chatId: undefined },
//           mockUserId
//         );

//         // 모든 이벤트 수집
//         const subscription = observable.subscribe({
//           next: (sseData) => {
//             const eventMatch = sseData.match(/event: (\w+)\ndata: (.+)\n\n/);
//             if (eventMatch) {
//               const eventType = eventMatch[1];
//               const eventData = JSON.parse(eventMatch[2]);
//               receivedEvents.push({
//                 event: eventType,
//                 data: eventData
//               });

//               // 디버깅을 위해 이벤트 정보 로그 (실제 테스트에서는 필요에 따라 주석 처리)
//               // console.log(`Event: ${eventType}`, eventData);
//             }
//           },
//           error: (error) => {
//             fail(`Observable emitted error: ${error}`);
//           }
//         });

//         // 완료까지 대기 (충분한 시간을 주어 모든 비동기 작업 완료 보장)
//         await new Promise(resolve => setTimeout(resolve, 500));

//         // 구독 정리
//         subscription.unsubscribe();

//         // Then: 전체 플로우가 완료되어야 한다
//         const eventTypes = receivedEvents.map(e => e.event);

//         expect(eventTypes).toContain('chat_started');
//         expect(eventTypes).toContain('ai_processing_started');
//         expect(eventTypes).toContain('ai_update');
//         expect(eventTypes).toContain('chat_response');
//         expect(eventTypes).toContain('chat_completed');

//         // 최종 응답이 올바른 타입이어야 한다
//         const chatResponse = receivedEvents.find(e => e.event === 'chat_response')?.data;
//         expect(chatResponse).toBeDefined();
//         expect(chatResponse).toMatchObject({
//           intent: ChatIntentType.EXCEL_FORMULA,
//           formulaDetails: {
//             name: finalAiResult.formulaDetails.name,
//             description: finalAiResult.formulaDetails.description,
//             syntax: finalAiResult.formulaDetails.syntax,
//             parameters: expect.arrayContaining([
//               expect.objectContaining({
//                 name: 'range',
//                 description: '범위',
//                 required: true
//               })
//             ])
//           },
//           metadata: expect.objectContaining({
//             tokensUsed: finalAiResult.tokensUsed,
//             responseTime: finalAiResult.responseTime,
//             model: finalAiResult.model
//           })
//         });

//         // 데이터베이스 호출들이 올바르게 이루어져야 한다
//         expect(prisma.chat.create).toHaveBeenCalled();
//         expect(prisma.message.create).toHaveBeenCalledTimes(2); // 사용자 + 어시스턴트 메시지
//         expect(prisma.chat.update).toHaveBeenCalledTimes(2); // 각 메시지 후 카운트 증가
//       });
//     });
//   });
// });
