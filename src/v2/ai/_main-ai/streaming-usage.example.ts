// // src/v2/chatting/main-ai/streaming-usage.example.ts

// import { Injectable, Logger } from '@nestjs/common';
// import { MainAiService } from './main-ai.service';
// import { StreamUpdate } from '../../lcel/types/chain.types';
// import { SpreadSheetStructure, AnalysisOptions } from '../../sheet/types/spreadsheet.types';

// /**
//  * MainAiService의 스트리밍 기능 사용 예제
//  * 실제 서비스에서 WebSocket, SSE, HTTP 청크 응답 등에 활용 가능
//  */

// @Injectable()
// export class MainAiStreamingUsageExample {
//   private readonly logger = new Logger(MainAiStreamingUsageExample.name);

//   constructor(private readonly mainAiService: MainAiService) {}

//   /**
//    * 예제 1: 기본 스트리밍 분석 - AsyncIterable 사용
//    */
//   async basicStreamingAnalysisExample(): Promise<void> {
//     console.log('🚀 기본 스트리밍 분석 예제 시작');
    
//     const spreadSheetData: SpreadSheetStructure = {
//       sheets: {
//         'Sales Data': {
//           data: {
//             dataTable: {
//               'A1': { value: '월' },
//               'B1': { value: '매출' },
//               'C1': { value: '비용' },
//               'A2': { value: '1월' },
//               'B2': { value: '1000000' },
//               'C2': { value: '800000' },
//               'A3': { value: '2월' },
//               'B3': { value: '1200000' },
//               'C3': { value: '900000' },
//               'A4': { value: '3월' },
//               'B4': { value: '1500000' },
//               'C4': { value: '1100000' }
//             }
//           }
//         }
//       }
//     };

//     const options: AnalysisOptions = {
//       includeFormulas: false,
//       includeStyles: false,
//       maxSheets: 1
//     };

//     try {
//       const streamResult = await this.mainAiService.analyzeSpreadSheetWithStreaming(
//         'user123',
//         spreadSheetData,
//         '월별 매출 데이터를 분석하고 추세를 알려줘',
//         options
//       );

//       if (streamResult.success) {
//         console.log('✅ 스트리밍 설정 완료, 업데이트 수신 시작...');
        
//         for await (const update of streamResult.updates) {
//           this.handleStreamUpdate(update);
//         }
//       } else {
//         console.error('❌ 스트리밍 설정 실패:', streamResult.error);
//       }
//     } catch (error) {
//       console.error('❌ 스트리밍 분석 실패:', error);
//     }
//   }

//   /**
//    * 예제 2: 실시간 콜백 스트리밍 - WebSocket에 적합
//    */
//   async realtimeCallbackStreamingExample(): Promise<void> {
//     console.log('🚀 실시간 콜백 스트리밍 예제 시작');
    
//     const spreadSheetData: SpreadSheetStructure = {
//       sheets: {
//         'Product Data': {
//           data: {
//             dataTable: {
//               'A1': { value: '상품명' },
//               'B1': { value: '가격' },
//               'C1': { value: '재고' },
//               'A2': { value: '노트북' },
//               'B2': { value: '1200000' },
//               'C2': { value: '50' },
//               'A3': { value: '마우스' },
//               'B3': { value: '30000' },
//               'C3': { value: '200' },
//               'A4': { value: '키보드' },
//               'B4': { value: '80000' },
//               'C4': { value: '150' }
//             }
//           }
//         }
//       }
//     };

//     try {
//       await this.mainAiService.analyzeSpreadSheetWithRealtimeCallback(
//         'user456',
//         spreadSheetData,
//         '상품 데이터를 기반으로 재고 관리 전략을 제안해줘',
//         // 실시간 업데이트 콜백
//         (update: StreamUpdate) => {
//           this.handleStreamUpdate(update);
//           // 실제 서비스에서는 여기서 WebSocket으로 전송
//           // websocket.send(JSON.stringify(update));
//         },
//         // 완료 콜백
//         (finalResult) => {
//           console.log('🎉 분석 완료!');
//           console.log('='.repeat(50));
//           console.log('최종 분석 결과:');
//           console.log(finalResult.analysis);
//           console.log('='.repeat(50));
//           console.log(`처리 시간: ${finalResult.responseTime}ms`);
//           console.log(`토큰 사용량: ${finalResult.tokensUsed}`);
//           console.log(`모델: ${finalResult.model}`);
//           console.log(`캐시 사용: ${finalResult.cached}`);
          
//           if (finalResult.chainMetadata) {
//             console.log('체인 정보:');
//             console.log(`- 의도: ${finalResult.chainMetadata.intent}`);
//             console.log(`- 신뢰도: ${finalResult.chainMetadata.confidence}`);
//             console.log(`- 처리 단계: ${finalResult.chainMetadata.processingSteps?.join(' → ')}`);
//           }
//         },
//         // 에러 콜백
//         (error) => {
//           console.error('❌ 분석 중 에러 발생:', error);
//         }
//       );
//     } catch (error) {
//       console.error('❌ 실시간 스트리밍 설정 실패:', error);
//     }
//   }

//   /**
//    * 예제 3: 간단한 질의 스트리밍
//    */
//   async simpleQueryStreamingExample(): Promise<void> {
//     console.log('🚀 간단한 질의 스트리밍 예제 시작');
    
//     const spreadSheetData: SpreadSheetStructure = {
//       sheets: {
//         'Quick Data': {
//           data: {
//             dataTable: {
//               'A1': { value: '10' },
//               'A2': { value: '20' },
//               'A3': { value: '30' },
//               'A4': { value: '40' },
//               'A5': { value: '50' }
//             }
//           }
//         }
//       }
//     };

//     try {
//       await this.mainAiService.simpleQueryWithStreaming(
//         'user789',
//         spreadSheetData,
//         '이 숫자들의 평균을 계산해줘',
//         // 업데이트 콜백
//         (update: StreamUpdate) => {
//           this.handleStreamUpdate(update);
//         },
//         // 완료 콜백
//         (result: string) => {
//           console.log('✅ 간단한 질의 완료!');
//           console.log('응답:', result);
//         },
//         // 에러 콜백
//         (error: string) => {
//           console.error('❌ 간단한 질의 실패:', error);
//         }
//       );
//     } catch (error) {
//       console.error('❌ 간단한 질의 스트리밍 설정 실패:', error);
//     }
//   }

//   /**
//    * 예제 4: 여러 질의 동시 스트리밍 (병렬 처리)
//    */
//   async concurrentStreamingExample(): Promise<void> {
//     console.log('🚀 동시 스트리밍 예제 시작');
    
//     const spreadSheetData: SpreadSheetStructure = {
//       sheets: {
//         'Multi Data': {
//           data: {
//             dataTable: {
//               'A1': { value: '이름' },
//               'B1': { value: '점수' },
//               'A2': { value: '김철수' },
//               'B2': { value: '85' },
//               'A3': { value: '이영희' },
//               'B3': { value: '92' },
//               'A4': { value: '박민수' },
//               'B4': { value: '78' },
//               'A5': { value: '최지연' },
//               'B5': { value: '96' }
//             }
//           }
//         }
//       }
//     };

//     const queries = [
//       '평균 점수를 계산해줘',
//       '가장 높은 점수를 찾아줘',
//       '점수 분포를 분석해줘'
//     ];

//     try {
//       const streamingPromises = queries.map((query, index) => {
//         return this.mainAiService.analyzeSpreadSheetWithRealtimeCallback(
//           `user${index + 1}`,
//           spreadSheetData,
//           query,
//           (update: StreamUpdate) => {
//             console.log(`[질의 ${index + 1}] ${this.formatStreamUpdate(update)}`);
//           },
//           (result) => {
//             console.log(`✅ [질의 ${index + 1}] 완료: ${query}`);
//             console.log(`응답: ${result.analysis.substring(0, 100)}...`);
//           },
//           (error) => {
//             console.error(`❌ [질의 ${index + 1}] 실패: ${error}`);
//           }
//         );
//       });

//       await Promise.all(streamingPromises);
//       console.log('🎉 모든 동시 스트리밍 완료!');
//     } catch (error) {
//       console.error('❌ 동시 스트리밍 실패:', error);
//     }
//   }

//   /**
//    * 스트리밍 업데이트 처리 함수
//    */
//   private handleStreamUpdate(update: StreamUpdate): void {
//     const timestamp = new Date(update.timestamp).toLocaleTimeString();
//     const updateInfo = this.formatStreamUpdate(update);
    
//     console.log(`📡 [${timestamp}] ${updateInfo}`);
    
//     // 실제 서비스에서는 여기서 클라이언트에게 전송
//     // 예: WebSocket, Server-Sent Events, HTTP 청크 응답 등
//   }

//   /**
//    * 스트리밍 업데이트 포맷팅
//    */
//   private formatStreamUpdate(update: StreamUpdate): string {
//     const progressInfo = update.progress ? 
//       `[${update.progress.current}/${update.progress.total}] ` : '';
    
//     switch (update.type) {
//       case 'step_start':
//         return `🔄 ${update.step} 시작 ${progressInfo}${update.progress?.message || ''}`;
        
//       case 'step_progress':
//         const percentage = update.progress ? 
//           Math.round((update.progress.current / update.progress.total) * 100) : 0;
//         return `📊 ${update.step} 진행 ${progressInfo}(${percentage}%) ${update.progress?.message || ''}`;
        
//       case 'step_complete':
//         return `✅ ${update.step} 완료 ${progressInfo}${update.progress?.message || ''}`;
        
//       case 'error':
//         return `❌ ${update.step} 에러: ${update.error}`;
        
//       case 'final_result':
//         return `🎉 최종 결과 생성 완료! ${update.progress?.message || ''}`;
        
//       default:
//         return `📡 ${update.type}: ${update.progress?.message || ''}`;
//     }
//   }

//   /**
//    * 모든 예제 실행
//    */
//   async runAllExamples(): Promise<void> {
//     console.log('='.repeat(60));
//     console.log('🎯 MainAiService 스트리밍 기능 사용 예제');
//     console.log('='.repeat(60));

//     try {
//       // 예제 1: 기본 스트리밍
//       await this.basicStreamingAnalysisExample();
//       console.log('\n' + '-'.repeat(40) + '\n');
      
//       // 예제 2: 실시간 콜백 스트리밍
//       await this.realtimeCallbackStreamingExample();
//       console.log('\n' + '-'.repeat(40) + '\n');
      
//       // 예제 3: 간단한 질의 스트리밍
//       await this.simpleQueryStreamingExample();
//       console.log('\n' + '-'.repeat(40) + '\n');
      
//       // 예제 4: 동시 스트리밍
//       await this.concurrentStreamingExample();
      
//     } catch (error) {
//       console.error('❌ 예제 실행 중 에러:', error);
//     }

//     console.log('\n' + '='.repeat(60));
//     console.log('🏁 모든 예제 완료');
//     console.log('='.repeat(60));
//   }
// }

// // 사용법
// export async function runMainAiStreamingExample(): Promise<void> {
//   // 실제 서비스에서는 NestJS 의존성 주입을 통해 사용
//   // const example = new MainAiStreamingUsageExample(mainAiService);
//   // await example.runAllExamples();
  
//   console.log(`
// 스트리밍 서비스 사용 방법:

// 1. 기본 스트리밍 분석:
//    const streamResult = await mainAiService.analyzeSpreadSheetWithStreaming(
//      userId, spreadSheetData, question, options
//    );

// 2. 실시간 콜백 스트리밍:
//    await mainAiService.analyzeSpreadSheetWithRealtimeCallback(
//      userId, spreadSheetData, question, 
//      onUpdate, onComplete, onError, options
//    );

// 3. 간단한 질의 스트리밍:
//    await mainAiService.simpleQueryWithStreaming(
//      userId, spreadSheetData, question,
//      onUpdate, onComplete, onError, options
//    );

// 실제 서비스에서는 WebSocket, SSE, HTTP 청크 응답 등과 함께 사용하여
// 사용자에게 실시간 진행 상황을 전달할 수 있습니다.
//   `);
// }