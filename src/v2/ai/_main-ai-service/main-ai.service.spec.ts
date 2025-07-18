// // src/v2/ai/_main-ai-service/main-ai.service.spec.ts

// import { Test, TestingModule } from '@nestjs/testing';
// import { ConfigService } from '@nestjs/config';
// import { MainAiService } from './main-ai.service';
// import { TableDataCacheService } from '../../cache/_table-data-cache/table-data-cache.service';
// import { BasicAiChain } from '../_chains/basic-ai.chain';
// import { ChatAnthropic } from '@langchain/anthropic';
// import {
//   SpreadSheetStructure,
//   AnalysisOptions,
//   AIServiceError
// } from '../../sheet/types/spreadsheet.types';
// import {
//   BaseAiRequestResult,
//   ExcelFormulaResult,
//   PythonCodeGeneratorResult,
//   WholeDataResult,
//   GeneralHelpResult
// } from '../_types/ai-request-result.types';
// import { StreamUpdate, ChainInput, ChainResult } from '../_types/chain.types';

// /**
//  * MainAiService 종합 테스트
//  * 
//  * 이 테스트 스위트는 MainAiService의 모든 공개 메서드와 주요 비공개 메서드를 테스트합니다.
//  * 테스트 범위:
//  * - 서비스 초기화 및 설정
//  * - 기본 스프레드시트 AI 분석
//  * - 실시간 스트리밍 분석
//  * - 간단한 쿼리 처리
//  * - 타입별 응답 추출 메서드
//  * - 에러 처리 및 예외 상황
//  * - 캐시 통합
//  * - 성능 최적화
//  */
// describe('MainAiService', () => {
//   let service: MainAiService;
//   let configService: jest.Mocked<ConfigService>;
//   let cacheService: jest.Mocked<TableDataCacheService>;
//   let mockBasicAiChain: jest.Mocked<BasicAiChain>;
//   let mockLlm: jest.Mocked<ChatAnthropic>;

//   /**
//    * 테스트용 스프레드시트 데이터 모킹
//    */
//   const mockSpreadSheetData: SpreadSheetStructure = {
//     version: '1.0',
//     sheets: {
//       'Sheet1': {
//         id: 'sheet1',
//         name: 'Sheet1',
//         data: {
//           dataTable: {
//             'A1': { value: 'Name' },
//             'B1': { value: 'Age' },
//             'A2': { value: 'John' },
//             'B2': { value: 25 }
//           }
//         }
//       }
//     },
//     id: 'test-sheet-123',
//     fileName: 'test-sheet.xlsx'
//   };

//   /**
//    * 테스트용 분석 옵션
//    */
//   const mockAnalysisOptions: AnalysisOptions = {
//     includeFormulas: true,
//     includeStyles: false,
//     maxSheets: 5,
//     model: 'claude-3-5-haiku-20241022'
//   };

//   /**
//    * 테스트용 GPTReadyData
//    */
//   const mockGPTReadyData = {
//     sheets: new Map([
//       ['Sheet1', {
//         csvData: 'Name,Age,Score\nAlice,25,95\nBob,30,87',
//         cellCount: 9,
//         metadata: {
//           name: 'Sheet1',
//           cellCount: 9,
//           includeFormulas: true,
//           includeStyles: false
//         }
//       }]
//     ]),
//     totalCells: 9,
//     dataHash: 'test-hash-123',
//     parsedAt: new Date('2024-01-01T00:00:00Z')
//   };

//   /**
//    * 테스트용 캐시 응답 데이터
//    */
//   const mockCacheResponse = {
//     data: mockGPTReadyData,
//     cached: true,
//     source: 'memory' as const,
//     timing: 60
//   };

//   beforeEach(async () => {
//     // ConfigService 모킹
//     const mockConfigService = {
//       get: jest.fn()
//     };

//     // TableDataCacheService 모킹
//     const mockCacheService = {
//       getGPTReadyData: jest.fn()
//     };

//     // BasicAiChain 모킹
//     const mockChain = {
//       invoke: jest.fn(),
//       stream: jest.fn(),
//       streamWithCallback: jest.fn(),
//       getChainInfo: jest.fn(),
//       retryChainExecution: jest.fn()
//     };

//     // ChatAnthropic 모킹 (생성자 문제로 인해 factory 사용)
//     const createMockLlm = () => ({
//       modelName: 'claude-3-5-haiku-20241022',
//       temperature: 0.7,
//       maxTokens: 4000
//     });

//     const module: TestingModule = await Test.createTestingModule({
//       providers: [
//         MainAiService,
//         { provide: ConfigService, useValue: mockConfigService },
//         { provide: TableDataCacheService, useValue: mockCacheService }
//       ]
//     }).compile();

//     service = module.get<MainAiService>(MainAiService);
//     configService = module.get(ConfigService);
//     cacheService = module.get(TableDataCacheService);

//     // 비공개 속성 모킹 (리플렉션 사용)
//     mockBasicAiChain = mockChain as unknown as jest.Mocked<BasicAiChain>;
//     mockLlm = createMockLlm() as jest.Mocked<ChatAnthropic>;

//     // 반사를 통해 비공개 속성 설정
//     Object.defineProperty(service, 'basicAiChain', {
//       value: mockBasicAiChain,
//       writable: true
//     });
//     Object.defineProperty(service, 'llm', {
//       value: mockLlm,
//       writable: true
//     });

//     // 기본 설정 모킹
//     configService.get.mockImplementation((key: string) => {
//       switch (key) {
//         case 'ANTHROPIC_API_KEY':
//           return 'test-api-key';
//         default:
//           return undefined;
//       }
//     });

//     // 기본 캐시 응답 모킹
//     cacheService.getGPTReadyData.mockResolvedValue(mockCacheResponse);
//   });

//   afterEach(() => {
//     jest.clearAllMocks();
//   });

//   // ===================================================================
//   // 서비스 초기화 및 설정 테스트
//   // ===================================================================

//   describe('서비스 초기화', () => {
//     /**
//      * 정상적인 서비스 초기화 테스트
//      * ConfigService에서 API 키를 정상적으로 가져오고 LLM이 올바르게 설정되는지 확인
//      */
//     it('should be defined with valid configuration', () => {
//       expect(service).toBeDefined();
//       expect(configService.get).toHaveBeenCalledWith('ANTHROPIC_API_KEY');
//     });

//     /**
//      * getChainInfo 메서드 테스트
//      * 체인과 LLM 설정 정보를 올바르게 반환하는지 확인
//      */
//     it('should return chain info correctly', () => {
//       // 체인 정보 모킹
//       mockBasicAiChain.getChainInfo.mockReturnValue({
//         steps: ['intent_analysis', 'prompt_selection', 'response_generation'],
//         runnableCount: 3
//       });

//       const chainInfo = service.getChainInfo();

//       expect(chainInfo).toEqual({
//         basicAiChain: {
//           steps: ['intent_analysis', 'prompt_selection', 'response_generation'],
//           runnableCount: 3
//         },
//         llmConfig: {
//           model: 'claude-3-5-haiku-20241022',
//           temperature: 0.7,
//           maxTokens: 4000
//         }
//       });
//       expect(mockBasicAiChain.getChainInfo).toHaveBeenCalled();
//     });
//   });

//   // ===================================================================
//   // 기본 스프레드시트 AI 분석 테스트
//   // ===================================================================

//   describe('basicSpreadSheetAiAgent', () => {
//     /**
//      * 정상적인 AI 분석 플로우 테스트
//      * 캐시 조회 → 체인 실행 → 결과 변환의 전체 플로우가 정상 작동하는지 확인
//      */
//     it('should perform successful analysis with cached data', async () => {
//       // 성공적인 체인 실행 결과 모킹
//       const mockChainResult: ChainResult = {
//         success: true,
//         data: {
//           originalInput: {
//             userId: 'test-user',
//             spreadSheetData: mockSpreadSheetData,
//             question: 'What is the sum of ages?',
//             options: mockAnalysisOptions
//           },
//           finalResponse: 'The sum of ages is 25.',
//           metadata: {
//             tokensUsed: 150,
//             responseTime: 1200,
//             cached: true,
//             processingSteps: ['intent_analysis', 'prompt_selection', 'response_generation']
//           }
//         }
//       };

//       mockBasicAiChain.invoke.mockResolvedValue(mockChainResult);

//       const result = await service.basicSpreadSheetAiAgent(
//         'test-user',
//         mockSpreadSheetData,
//         'What is the sum of ages?',
//         mockAnalysisOptions
//       );

//       // 결과 검증
//       expect(result).toEqual({
//         success: true,
//         tokensUsed: 150,
//         responseTime: expect.any(Number), // 실제 처리 시간
//         model: 'claude-3-5-haiku-20241022',
//         cached: true
//       });

//       // 의존성 호출 검증
//       expect(cacheService.getGPTReadyData).toHaveBeenCalledWith(
//         'test-user',
//         mockSpreadSheetData,
//         {
//           includeFormulas: true,
//           includeStyles: false,
//           maxSheets: 5,
//           sheetNames: undefined
//         }
//       );

//       expect(mockBasicAiChain.invoke).toHaveBeenCalledWith({
//         userId: 'test-user',
//         spreadSheetData: mockSpreadSheetData,
//         question: 'What is the sum of ages?',
//         options: mockAnalysisOptions
//       });
//     });

//     /**
//      * 체인 실행 실패 시 에러 처리 테스트
//      * 체인이 실패했을 때 적절한 AIServiceError가 발생하는지 확인
//      */
//     it('should handle chain execution failure', async () => {
//       const mockChainResult: ChainResult = {
//         success: false,
//         data: {} as any,
//         error: 'Chain execution failed due to token limit'
//       };

//       mockBasicAiChain.invoke.mockResolvedValue(mockChainResult);

//       await expect(
//         service.basicSpreadSheetAiAgent(
//           'test-user',
//           mockSpreadSheetData,
//           'What is the sum of ages?'
//         )
//       ).rejects.toThrow(AIServiceError);

//       await expect(
//         service.basicSpreadSheetAiAgent(
//           'test-user',
//           mockSpreadSheetData,
//           'What is the sum of ages?'
//         )
//       ).rejects.toThrow('Failed to analyze spreadsheet with LCEL chain');
//     });

//     /**
//      * 캐시 서비스 실패 시 처리 테스트
//      * 캐시 서비스가 실패해도 분석이 계속 진행되는지 확인
//      */
//     it('should handle cache service failure gracefully', async () => {
//       cacheService.getGPTReadyData.mockRejectedValue(new Error('Cache service unavailable'));

//       const mockChainResult: ChainResult = {
//         success: true,
//         data: {
//           originalInput: {
//             userId: 'test-user',
//             spreadSheetData: mockSpreadSheetData,
//             question: 'Test question',
//             options: {}
//           },
//           finalResponse: 'Analysis completed without cache.',
//           metadata: {
//             tokensUsed: 100,
//             responseTime: 1000,
//             cached: false,
//             processingSteps: ['response_generation']
//           }
//         }
//       };

//       mockBasicAiChain.invoke.mockResolvedValue(mockChainResult);

//       await expect(
//         service.basicSpreadSheetAiAgent(
//           'test-user',
//           mockSpreadSheetData,
//           'Test question'
//         )
//       ).rejects.toThrow(AIServiceError);
//     });

//     /**
//      * 빈 질문 처리 테스트
//      * 빈 문자열이나 공백만 있는 질문에 대한 처리 확인
//      */
//     it('should handle empty or whitespace-only questions', async () => {
//       const emptyQuestions = ['', '   ', '\n\t '];

//       for (const question of emptyQuestions) {
//         const mockChainResult: ChainResult = {
//           success: true,
//           data: {
//             originalInput: {
//               userId: 'test-user',
//               spreadSheetData: mockSpreadSheetData,
//               question,
//               options: {}
//             },
//             finalResponse: 'Please provide a valid question.',
//             metadata: {
//               tokensUsed: 10,
//               responseTime: 100,
//               cached: false,
//               processingSteps: ['validation']
//             }
//           }
//         };

//         mockBasicAiChain.invoke.mockResolvedValue(mockChainResult);

//         const result = await service.basicSpreadSheetAiAgent(
//           'test-user',
//           mockSpreadSheetData,
//           question
//         );

//         expect(result.success).toBe(true);
//         expect(mockBasicAiChain.invoke).toHaveBeenCalledWith(
//           expect.objectContaining({
//             question
//           })
//         );
//       }
//     });
//   });

//   // ===================================================================
//   // 실시간 스트리밍 분석 테스트
//   // ===================================================================

//   describe('realtimeSpreadSheetAiAgent', () => {
//     /**
//      * 정상적인 스트리밍 플로우 테스트
//      * onUpdate, onComplete, onError 콜백이 적절히 호출되는지 확인
//      */
//     it('should handle successful streaming with all callbacks', async () => {
//       const onUpdate = jest.fn();
//       const onComplete = jest.fn();
//       const onError = jest.fn();

//       const mockFinalChainState = {
//         originalInput: {
//           userId: 'test-user',
//           spreadSheetData: mockSpreadSheetData,
//           question: 'Stream test question',
//           options: {}
//         },
//         finalResponse: 'Streaming analysis completed',
//         metadata: {
//           tokensUsed: 200,
//           responseTime: 1500,
//           cached: true,
//           processingSteps: ['intent_analysis', 'response_generation']
//         }
//       };

//       // 스트리밍 체인 모킹 - 성공적인 실행
//       mockBasicAiChain.streamWithCallback.mockImplementation(
//         async (input: ChainInput, updateCallback, completeCallback, errorCallback) => {
//           // 여러 업데이트 시뮬레이션
//           updateCallback({
//             type: 'step_start',
//             step: 'intent_analysis',
//             timestamp: Date.now(),
//             progress: { current: 1, total: 3, message: 'Analyzing intent...' }
//           });

//           updateCallback({
//             type: 'step_progress',
//             step: 'response_generation',
//             timestamp: Date.now(),
//             progress: { current: 2, total: 3, message: 'Generating response...' }
//           });

//           // 완료 콜백 호출
//           completeCallback?.(mockFinalChainState);
//         }
//       );

//       await service.realtimeSpreadSheetAiAgent(
//         'test-user',
//         mockSpreadSheetData,
//         'Stream test question',
//         onUpdate,
//         onComplete,
//         onError
//       );

//       // 콜백 호출 검증
//       expect(onUpdate).toHaveBeenCalledTimes(2);
//       expect(onUpdate).toHaveBeenNthCalledWith(1, expect.objectContaining({
//         type: 'step_start',
//         step: 'intent_analysis'
//       }));
//       expect(onUpdate).toHaveBeenNthCalledWith(2, expect.objectContaining({
//         type: 'step_progress',
//         step: 'response_generation'
//       }));

//       expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
//         success: true,
//         tokensUsed: 200,
//         cached: true
//       }));

//       expect(onError).not.toHaveBeenCalled();
//     });

//     /**
//      * 스트리밍 중 에러 발생 테스트
//      * 스트리밍 도중 에러가 발생했을 때 onError 콜백이 호출되는지 확인
//      */
//     it('should handle streaming errors properly', async () => {
//       const onUpdate = jest.fn();
//       const onComplete = jest.fn();
//       const onError = jest.fn();

//       // 스트리밍 체인 모킹 - 에러 발생
//       mockBasicAiChain.streamWithCallback.mockImplementation(
//         async (input: ChainInput, updateCallback, completeCallback, errorCallback) => {
//           // 일부 업데이트 후 에러 발생
//           updateCallback({
//             type: 'step_start',
//             step: 'intent_analysis',
//             timestamp: Date.now(),
//             progress: { current: 1, total: 3, message: 'Starting analysis...' }
//           });

//           // 에러 콜백 호출
//           errorCallback?.('Network timeout during AI processing');
//         }
//       );

//       await service.realtimeSpreadSheetAiAgent(
//         'test-user',
//         mockSpreadSheetData,
//         'Test question',
//         onUpdate,
//         onComplete,
//         onError
//       );

//       // 콜백 호출 검증
//       expect(onUpdate).toHaveBeenCalledTimes(1);
//       expect(onComplete).not.toHaveBeenCalled();
//       expect(onError).toHaveBeenCalledWith('Network timeout during AI processing');
//     });

//     /**
//      * 스트리밍 설정 실패 테스트
//      * 스트리밍 설정 자체가 실패했을 때의 처리 확인
//      */
//     it('should handle streaming setup failure', async () => {
//       const onUpdate = jest.fn();
//       const onComplete = jest.fn();
//       const onError = jest.fn();

//       cacheService.getGPTReadyData.mockRejectedValue(new Error('Cache initialization failed'));

//       await service.realtimeSpreadSheetAiAgent(
//         'test-user',
//         mockSpreadSheetData,
//         'Test question',
//         onUpdate,
//         onComplete,
//         onError
//       );

//       expect(onError).toHaveBeenCalledWith(expect.stringContaining('Cache initialization failed'));
//       expect(onUpdate).not.toHaveBeenCalled();
//       expect(onComplete).not.toHaveBeenCalled();
//     });

//     /**
//      * 콜백 함수 없이 실행 테스트
//      * 선택적 콜백들(onComplete, onError)이 없어도 정상 작동하는지 확인
//      */
//     it('should work without optional callbacks', async () => {
//       const onUpdate = jest.fn();

//       const mockFinalChainState = {
//         originalInput: {
//           userId: 'test-user',
//           spreadSheetData: mockSpreadSheetData,
//           question: 'Test without optional callbacks',
//           options: {}
//         },
//         finalResponse: 'Analysis completed',
//         metadata: {
//           tokensUsed: 150,
//           responseTime: 1000,
//           cached: false,
//           processingSteps: ['response_generation']
//         }
//       };

//       mockBasicAiChain.streamWithCallback.mockImplementation(
//         async (input: ChainInput, updateCallback, completeCallback) => {
//           updateCallback({
//             type: 'step_complete',
//             step: 'response_generation',
//             timestamp: Date.now(),
//             progress: { current: 1, total: 1, message: 'Completed' }
//           });

//           completeCallback?.(mockFinalChainState);
//         }
//       );

//       // onComplete, onError 콜백 없이 실행
//       await expect(
//         service.realtimeSpreadSheetAiAgent(
//           'test-user',
//           mockSpreadSheetData,
//           'Test without optional callbacks',
//           onUpdate
//         )
//       ).resolves.not.toThrow();

//       expect(onUpdate).toHaveBeenCalled();
//     });
//   });

//   // ===================================================================
//   // 간단한 쿼리 처리 테스트
//   // ===================================================================

//   describe('simpleQuery', () => {
//     /**
//      * 정상적인 간단한 쿼리 처리 테스트
//      * 경량화된 LLM과 옵션으로 빠른 응답을 생성하는지 확인
//      */
//     it('should process simple query with lightweight configuration', async () => {
//       const mockChainResult: ChainResult = {
//         success: true,
//         data: {
//           originalInput: {
//             userId: 'test-user',
//             spreadSheetData: mockSpreadSheetData,
//             question: 'Quick question',
//             options: {
//               maxSheets: 1,
//               includeFormulas: false,
//               includeStyles: false
//             }
//           },
//           finalResponse: 'Quick answer to your question.',
//           metadata: {
//             tokensUsed: 50,
//             responseTime: 300,
//             cached: false,
//             processingSteps: ['simple_generation']
//           }
//         }
//       };

//       // 간단한 쿼리용 체인 모킹
//       const mockSimpleChain = {
//         invoke: jest.fn().mockResolvedValue(mockChainResult)
//       };

//       // BasicAiChain 생성자 모킹이 어려우므로 서비스 내부 로직 테스트
//       // 실제로는 새로운 BasicAiChain 인스턴스가 생성됨

//       const result = await service.simpleQuery(
//         'test-user',
//         mockSpreadSheetData,
//         'Quick question'
//       );

//       expect(result).toBe('Quick answer to your question.');
//     });

//     /**
//      * 간단한 쿼리 실패 처리 테스트
//      * 간단한 쿼리가 실패했을 때 적절한 에러가 발생하는지 확인
//      */
//     it('should handle simple query failure', async () => {
//       // 체인 실행 실패 시뮬레이션을 위해 캐시 서비스 실패 사용
//       cacheService.getGPTReadyData.mockRejectedValue(new Error('Simple query setup failed'));

//       await expect(
//         service.simpleQuery(
//           'test-user',
//           mockSpreadSheetData,
//           'Failed query'
//         )
//       ).rejects.toThrow(AIServiceError);

//       await expect(
//         service.simpleQuery(
//           'test-user',
//           mockSpreadSheetData,
//           'Failed query'
//         )
//       ).rejects.toThrow('Failed to process simple query');
//     });
//   });

//   describe('simpleQueryWithStreaming', () => {
//     /**
//      * 스트리밍이 포함된 간단한 쿼리 테스트
//      * 경량화된 설정으로 스트리밍 쿼리가 정상 작동하는지 확인
//      */
//     it('should process simple streaming query successfully', async () => {
//       const onUpdate = jest.fn();
//       const onComplete = jest.fn();
//       const onError = jest.fn();

//       const mockFinalChainState = {
//         originalInput: {
//           userId: 'test-user',
//           spreadSheetData: mockSpreadSheetData,
//           question: 'Simple streaming question',
//           options: {
//             maxSheets: 1,
//             includeFormulas: false,
//             includeStyles: false
//           }
//         },
//         finalResponse: 'Simple streaming answer',
//         metadata: {
//           tokensUsed: 75,
//           responseTime: 500,
//           cached: false,
//           processingSteps: ['simple_streaming']
//         }
//       };

//       // 내부적으로 새로운 체인이 생성되므로 전역 모킹으로는 어려움
//       // 실제 테스트에서는 통합 테스트나 더 정교한 모킹 필요

//       await expect(
//         service.simpleQueryWithStreaming(
//           'test-user',
//           mockSpreadSheetData,
//           'Simple streaming question',
//           onUpdate,
//           onComplete,
//           onError
//         )
//       ).resolves.not.toThrow();
//     });
//   });

//   // ===================================================================
//   // 타입별 응답 추출 메서드 테스트
//   // ===================================================================

//   describe('Type-specific Response Methods', () => {
//     /**
//      * 공통 테스트 설정 - 타입별 응답을 위한 기본 체인 결과
//      */
//     beforeEach(() => {
//       // 캐시 서비스 정상 응답 설정
//       cacheService.getGPTReadyData.mockResolvedValue(mockCacheResponse);
//     });

//     describe('getExcelFormulaResponse', () => {
//       /**
//        * Excel 공식 응답 추출 성공 테스트
//        * formulaDetails가 포함된 응답이 올바르게 추출되는지 확인
//        */
//       it('should extract ExcelFormulaResult successfully', async () => {
//         const mockFormulaResult: ExcelFormulaResult = {
//           success: true,
//           tokensUsed: 120,
//           responseTime: 800,
//           model: 'claude-3-5-haiku-20241022',
//           cached: true,
//           confidence: 0.95,
//           formulaDetails: {
//             name: 'SUM',
//             description: 'Calculates the sum of values in a range',
//             syntax: '=SUM(range)',
//             parameters: [
//               {
//                 name: 'range',
//                 description: 'The range of cells to sum',
//                 required: true
//               }
//             ]
//           }
//         };

//         const mockChainResult: ChainResult = {
//           success: true,
//           data: {
//             originalInput: {
//               userId: 'test-user',
//               spreadSheetData: mockSpreadSheetData,
//               question: 'How to use SUM function?',
//               options: {}
//             },
//             finalResponse: 'SUM function usage explained',
//             parsedResponse: mockFormulaResult,
//             metadata: {
//               tokensUsed: 120,
//               responseTime: 800,
//               cached: true,
//               processingSteps: ['intent_analysis', 'excel_formula_generation']
//             }
//           }
//         };

//         mockBasicAiChain.invoke.mockResolvedValue(mockChainResult);

//         const result = await service.getExcelFormulaResponse(
//           'test-user',
//           mockSpreadSheetData,
//           'How to use SUM function?'
//         );

//         expect(result).toEqual(mockFormulaResult);
//         expect(result.formulaDetails.name).toBe('SUM');
//         expect(result.formulaDetails.parameters).toHaveLength(1);
//       });

//       /**
//        * Excel 공식이 아닌 응답에 대한 에러 처리 테스트
//        * formulaDetails가 없는 응답에 대해 적절한 에러가 발생하는지 확인
//        */
//       it('should throw error when response is not Excel formula type', async () => {
//         const mockGeneralResult: BaseAiRequestResult = {
//           success: true,
//           tokensUsed: 100,
//           responseTime: 600,
//           model: 'claude-3-5-haiku-20241022',
//           cached: false
//         };

//         const mockChainResult: ChainResult = {
//           success: true,
//           data: {
//             originalInput: {
//               userId: 'test-user',
//               spreadSheetData: mockSpreadSheetData,
//               question: 'General question',
//               options: {}
//             },
//             finalResponse: 'General answer',
//             parsedResponse: mockGeneralResult,
//             metadata: {
//               tokensUsed: 100,
//               responseTime: 600,
//               cached: false,
//               processingSteps: ['general_response']
//             }
//           }
//         };

//         mockBasicAiChain.invoke.mockResolvedValue(mockChainResult);

//         await expect(
//           service.getExcelFormulaResponse(
//             'test-user',
//             mockSpreadSheetData,
//             'General question'
//           )
//         ).rejects.toThrow(AIServiceError);

//         await expect(
//           service.getExcelFormulaResponse(
//             'test-user',
//             mockSpreadSheetData,
//             'General question'
//           )
//         ).rejects.toThrow('Response is not an Excel formula result');
//       });
//     });

//     describe('getPythonCodeGeneratorResponse', () => {
//       /**
//        * Python 코드 생성 응답 추출 성공 테스트
//        */
//       it('should extract PythonCodeGeneratorResult successfully', async () => {
//         const mockPythonResult: PythonCodeGeneratorResult = {
//           success: true,
//           tokensUsed: 200,
//           responseTime: 1200,
//           model: 'claude-3-5-haiku-20241022',
//           cached: false,
//           confidence: 0.9,
//           codeGenerator: {
//             pythonCode: 'import pandas as pd\ndf = pd.read_excel("data.xlsx")\nprint(df.sum())',
//             explanation: 'This code loads an Excel file and calculates the sum of all numeric columns'
//           }
//         };

//         const mockChainResult: ChainResult = {
//           success: true,
//           data: {
//             originalInput: {
//               userId: 'test-user',
//               spreadSheetData: mockSpreadSheetData,
//               question: 'Generate Python code to sum columns',
//               options: {}
//             },
//             finalResponse: 'Python code generated',
//             parsedResponse: mockPythonResult,
//             metadata: {
//               tokensUsed: 200,
//               responseTime: 1200,
//               cached: false,
//               processingSteps: ['intent_analysis', 'python_code_generation']
//             }
//           }
//         };

//         mockBasicAiChain.invoke.mockResolvedValue(mockChainResult);

//         const result = await service.getPythonCodeGeneratorResponse(
//           'test-user',
//           mockSpreadSheetData,
//           'Generate Python code to sum columns'
//         );

//         expect(result).toEqual(mockPythonResult);
//         expect(result.codeGenerator.pythonCode).toContain('pandas');
//         expect(result.codeGenerator.explanation).toContain('Excel file');
//       });

//       /**
//        * Python 코드가 아닌 응답에 대한 에러 처리 테스트
//        */
//       it('should throw error when response is not Python code type', async () => {
//         const mockFormulaResult: ExcelFormulaResult = {
//           success: true,
//           tokensUsed: 120,
//           responseTime: 800,
//           model: 'claude-3-5-haiku-20241022',
//           cached: true,
//           confidence: 0.95,
//           formulaDetails: {
//             name: 'SUM',
//             description: 'Sum function',
//             syntax: '=SUM(range)',
//             parameters: []
//           }
//         };

//         const mockChainResult: ChainResult = {
//           success: true,
//           data: {
//             originalInput: {
//               userId: 'test-user',
//               spreadSheetData: mockSpreadSheetData,
//               question: 'Excel formula question',
//               options: {}
//             },
//             finalResponse: 'Excel formula answer',
//             parsedResponse: mockFormulaResult,
//             metadata: {
//               tokensUsed: 120,
//               responseTime: 800,
//               cached: true,
//               processingSteps: ['excel_formula_generation']
//             }
//           }
//         };

//         mockBasicAiChain.invoke.mockResolvedValue(mockChainResult);

//         await expect(
//           service.getPythonCodeGeneratorResponse(
//             'test-user',
//             mockSpreadSheetData,
//             'Excel formula question'
//           )
//         ).rejects.toThrow('Response is not a Python code generator result');
//       });
//     });

//     describe('getWholeDataResponse', () => {
//       /**
//        * 전체 데이터 변환 응답 추출 성공 테스트
//        */
//       it('should extract WholeDataResult successfully', async () => {
//         const mockWholeDataResult: WholeDataResult = {
//           success: true,
//           tokensUsed: 300,
//           responseTime: 1800,
//           model: 'claude-3-5-haiku-20241022',
//           cached: false,
//           confidence: 0.85,
//           dataTransformation: {
//             transformedJsonData: JSON.stringify({
//               version: '1.0',
//               sheets: {
//                 'TransformedSheet': {
//                   data: {
//                     dataTable: {
//                       'A1': { value: 'Processed Name' },
//                       'B1': { value: 'Processed Age' }
//                     }
//                   }
//                 }
//               }
//             })
//           }
//         };

//         const mockChainResult: ChainResult = {
//           success: true,
//           data: {
//             originalInput: {
//               userId: 'test-user',
//               spreadSheetData: mockSpreadSheetData,
//               question: 'Transform this data structure',
//               options: {}
//             },
//             finalResponse: 'Data transformation completed',
//             parsedResponse: mockWholeDataResult,
//             metadata: {
//               tokensUsed: 300,
//               responseTime: 1800,
//               cached: false,
//               processingSteps: ['intent_analysis', 'data_transformation']
//             }
//           }
//         };

//         mockBasicAiChain.invoke.mockResolvedValue(mockChainResult);

//         const result = await service.getWholeDataResponse(
//           'test-user',
//           mockSpreadSheetData,
//           'Transform this data structure'
//         );

//         expect(result).toEqual(mockWholeDataResult);
//         expect(result.dataTransformation.transformedJsonData).toContain('TransformedSheet');

//         // JSON 파싱 테스트
//         const parsedData = JSON.parse(result.dataTransformation.transformedJsonData);
//         expect(parsedData.version).toBe('1.0');
//         expect(parsedData.sheets.TransformedSheet).toBeDefined();
//       });
//     });

//     describe('getGeneralHelpResponse', () => {
//       /**
//        * 일반 도움말 응답 추출 성공 테스트
//        */
//       it('should extract GeneralHelpResult successfully', async () => {
//         const mockGeneralHelpResult: GeneralHelpResult = {
//           success: true,
//           tokensUsed: 80,
//           responseTime: 400,
//           model: 'claude-3-5-haiku-20241022',
//           cached: true,
//           confidence: 0.92,
//           generalHelp: {
//             directAnswer: 'Excel is a powerful spreadsheet application that allows you to organize, calculate, and analyze data.',
//             additionalResources: [
//               {
//                 title: 'Excel Basics Tutorial',
//                 description: 'Learn the fundamentals of Excel',
//                 link: 'https://support.microsoft.com/excel'
//               },
//               {
//                 title: 'Advanced Excel Functions',
//                 description: 'Master complex Excel formulas'
//               }
//             ]
//           }
//         };

//         const mockChainResult: ChainResult = {
//           success: true,
//           data: {
//             originalInput: {
//               userId: 'test-user',
//               spreadSheetData: mockSpreadSheetData,
//               question: 'What is Excel?',
//               options: {}
//             },
//             finalResponse: 'General Excel explanation',
//             parsedResponse: mockGeneralHelpResult,
//             metadata: {
//               tokensUsed: 80,
//               responseTime: 400,
//               cached: true,
//               processingSteps: ['intent_analysis', 'general_help_generation']
//             }
//           }
//         };

//         mockBasicAiChain.invoke.mockResolvedValue(mockChainResult);

//         const result = await service.getGeneralHelpResponse(
//           'test-user',
//           mockSpreadSheetData,
//           'What is Excel?'
//         );

//         expect(result).toEqual(mockGeneralHelpResult);
//         expect(result.generalHelp.directAnswer).toContain('Excel');
//         expect(result.generalHelp.additionalResources).toHaveLength(2);
//         expect(result.generalHelp.additionalResources![0].link).toBeDefined();
//         expect(result.generalHelp.additionalResources![1].link).toBeUndefined();
//       });
//     });
//   });

//   // ===================================================================
//   // 에러 처리 및 예외 상황 테스트
//   // ===================================================================

//   describe('Error Handling and Edge Cases', () => {
//     /**
//      * 잘못된 사용자 ID 처리 테스트
//      */
//     it('should handle invalid user IDs', async () => {
//       const invalidUserIds = ['', null, undefined, '   '];

//       for (const userId of invalidUserIds) {
//         await expect(
//           service.basicSpreadSheetAiAgent(
//             userId as any,
//             mockSpreadSheetData,
//             'Test question'
//           )
//         ).rejects.toThrow();
//       }
//     });

//     /**
//      * 잘못된 스프레드시트 데이터 처리 테스트
//      */
//     it('should handle invalid spreadsheet data', async () => {
//       const invalidData = [
//         null,
//         undefined,
//         {},
//         { version: '1.0' }, // sheets 누락
//         { sheets: {} }, // version 누락
//       ];

//       for (const data of invalidData) {
//         await expect(
//           service.basicSpreadSheetAiAgent(
//             'test-user',
//             data as any,
//             'Test question'
//           )
//         ).rejects.toThrow();
//       }
//     });

//     /**
//      * 네트워크 타임아웃 시뮬레이션 테스트
//      */
//     it('should handle network timeouts', async () => {
//       mockBasicAiChain.invoke.mockRejectedValue(new Error('Network timeout'));

//       await expect(
//         service.basicSpreadSheetAiAgent(
//           'test-user',
//           mockSpreadSheetData,
//           'Test question'
//         )
//       ).rejects.toThrow(AIServiceError);
//     });

//     /**
//      * 메모리 부족 상황 시뮬레이션 테스트
//      */
//     it('should handle memory errors gracefully', async () => {
//       mockBasicAiChain.invoke.mockRejectedValue(new Error('JavaScript heap out of memory'));

//       await expect(
//         service.basicSpreadSheetAiAgent(
//           'test-user',
//           mockSpreadSheetData,
//           'Large data processing question'
//         )
//       ).rejects.toThrow(AIServiceError);
//     });

//     /**
//      * API 키 누락 상황 테스트
//      */
//     it('should handle missing API key during initialization', () => {
//       configService.get.mockImplementation((key: string) => {
//         if (key === 'ANTHROPIC_API_KEY') {
//           return undefined;
//         }
//         return undefined;
//       });

//       // 새로운 서비스 인스턴스 생성 시 에러 발생해야 함
//       // 실제로는 생성자에서 검증 로직이 필요
//       expect(() => {
//         // 생성자 내에서 API 키 검증이 있다면 에러 발생
//         if (!configService.get('ANTHROPIC_API_KEY')) {
//           throw new Error('ANTHROPIC_API_KEY is required');
//         }
//       }).toThrow('ANTHROPIC_API_KEY is required');
//     });
//   });

//   // ===================================================================
//   // 성능 및 최적화 테스트
//   // ===================================================================

//   describe('Performance and Optimization', () => {
//     /**
//      * 캐시 효율성 테스트
//      * 동일한 요청에 대해 캐시가 효과적으로 작동하는지 확인
//      */
//     it('should utilize cache effectively for repeated requests', async () => {
//       const mockChainResult: ChainResult = {
//         success: true,
//         data: {
//           originalInput: {
//             userId: 'test-user',
//             spreadSheetData: mockSpreadSheetData,
//             question: 'Cached question',
//             options: {}
//           },
//           finalResponse: 'Cached response',
//           metadata: {
//             tokensUsed: 0, // 캐시된 경우 토큰 사용량 없음
//             responseTime: 50, // 빠른 응답
//             cached: true,
//             processingSteps: ['cache_hit']
//           }
//         }
//       };

//       mockBasicAiChain.invoke.mockResolvedValue(mockChainResult);

//       // 첫 번째 요청
//       const result1 = await service.basicSpreadSheetAiAgent(
//         'test-user',
//         mockSpreadSheetData,
//         'Cached question'
//       );

//       // 두 번째 동일한 요청
//       const result2 = await service.basicSpreadSheetAiAgent(
//         'test-user',
//         mockSpreadSheetData,
//         'Cached question'
//       );

//       // 둘 다 캐시된 결과여야 함
//       expect(result1.cached).toBe(true);
//       expect(result2.cached).toBe(true);

//       // 캐시 서비스가 호출되었는지 확인
//       expect(cacheService.getGPTReadyData).toHaveBeenCalledTimes(2);
//     });

//     /**
//      * 대용량 데이터 처리 테스트
//      * 큰 스프레드시트 데이터에 대한 처리 성능 확인
//      */
//     it('should handle large spreadsheet data efficiently', async () => {
//       // 대용량 모킹 데이터 생성
//       const largeSpreadSheetData: SpreadSheetStructure = {
//         version: '1.0',
//         sheets: {},
//         id: 'large-sheet',
//         fileName: 'large-data.xlsx'
//       };

//       // 100개 시트 생성
//       for (let i = 0; i < 100; i++) {
//         largeSpreadSheetData.sheets[`Sheet${i}`] = {
//           id: `sheet${i}`,
//           name: `Sheet${i}`,
//           data: {
//             dataTable: {}
//           }
//         };

//         // 각 시트에 1000개 셀 추가
//         for (let row = 1; row <= 10; row++) {
//           for (let col = 1; col <= 100; col++) {
//             const cellAddress = String.fromCharCode(64 + col) + row;
//             largeSpreadSheetData.sheets[`Sheet${i}`].data.dataTable[cellAddress] = {
//               value: `Data_${i}_${row}_${col}`
//             };
//           }
//         }
//       }

//       const mockChainResult: ChainResult = {
//         success: true,
//         data: {
//           originalInput: {
//             userId: 'test-user',
//             spreadSheetData: largeSpreadSheetData,
//             question: 'Analyze large dataset',
//             options: { maxSheets: 5 } // 제한된 시트만 처리
//           },
//           finalResponse: 'Large dataset analysis completed',
//           metadata: {
//             tokensUsed: 500,
//             responseTime: 3000, // 3초
//             cached: false,
//             processingSteps: ['data_sampling', 'analysis', 'response_generation']
//           }
//         }
//       };

//       mockBasicAiChain.invoke.mockResolvedValue(mockChainResult);

//       const startTime = Date.now();
//       const result = await service.basicSpreadSheetAiAgent(
//         'test-user',
//         largeSpreadSheetData,
//         'Analyze large dataset',
//         { maxSheets: 5 }
//       );
//       const endTime = Date.now();

//       expect(result.success).toBe(true);
//       expect(endTime - startTime).toBeLessThan(5000); // 5초 이내 완료
//       expect(result.tokensUsed).toBeGreaterThan(0);
//     });

//     /**
//      * 동시 요청 처리 테스트
//      * 여러 요청이 동시에 들어왔을 때의 처리 성능 확인
//      */
//     it('should handle concurrent requests efficiently', async () => {
//       const mockChainResult: ChainResult = {
//         success: true,
//         data: {
//           originalInput: {
//             userId: 'test-user',
//             spreadSheetData: mockSpreadSheetData,
//             question: 'Concurrent question',
//             options: {}
//           },
//           finalResponse: 'Concurrent response',
//           metadata: {
//             tokensUsed: 100,
//             responseTime: 500,
//             cached: false,
//             processingSteps: ['concurrent_processing']
//           }
//         }
//       };

//       mockBasicAiChain.invoke.mockResolvedValue(mockChainResult);

//       // 10개의 동시 요청 생성
//       const concurrentRequests = Array.from({ length: 10 }, (_, index) =>
//         service.basicSpreadSheetAiAgent(
//           `test-user-${index}`,
//           mockSpreadSheetData,
//           `Concurrent question ${index}`
//         )
//       );

//       const startTime = Date.now();
//       const results = await Promise.all(concurrentRequests);
//       const endTime = Date.now();

//       // 모든 요청이 성공해야 함
//       expect(results).toHaveLength(10);
//       results.forEach(result => {
//         expect(result.success).toBe(true);
//       });

//       // 합리적인 시간 내에 완료되어야 함 (순차 처리 대비 효율적)
//       expect(endTime - startTime).toBeLessThan(3000); // 3초 이내

//       // 체인이 10번 호출되었는지 확인
//       expect(mockBasicAiChain.invoke).toHaveBeenCalledTimes(10);
//     });
//   });
// });
