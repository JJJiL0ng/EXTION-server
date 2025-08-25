// src/v2/ai/types/chain.types.ts

import { SpreadSheetStructure, AnalysisOptions } from '../../sheet/types/spreadsheet.types';
import { BaseAiRequestResult } from './ai-request-result.types';
import { GPTReadyData } from '../../sheet/types/spreadsheet.types';
/**
 * 의도 분석 결과 타입
 */
export type IntentType = 
  | 'excel_formula'        // 엑셀 공식 관련
  | 'python_code_generator'        // 데이터 분석을 위한 파이썬 코드 생성
  | 'whole_data'           // 전체 데이터를 읽어야만 하는 경우
  | 'general_help'         // 일반 도움말

/**
 * 체인 입력 타입
 */
export interface ChainInput {
  userId: string;
  spreadSheetData: SpreadSheetStructure;
  question: string;
  options?: AnalysisOptions;
}

/**
 * 의도 분석 결과
 */
export interface IntentAnalysisResult {
  intent: IntentType;
  reasoning: string;
}

/**
 * 선택된 프롬프트 정보
 */
export interface SelectedPrompt {
  id: string
  category: string;
  template: string;
  variables: Record<string, any>;
}

/**
 * 체인 상태 타입 (각 단계를 거치며 누적되는 상태)
 */
export interface ChainState {
  // 원본 입력
  originalInput: ChainInput;
  
  // 의도 분석 결과
  analyzedIntent?: IntentAnalysisResult;
  
  // 선택된 프롬프트
  selectedPrompt?: SelectedPrompt;
  
  // LLM 응답
  llmResponse?: string;
  
  // 최종 응답 - string 또는 구조화된 객체
  finalResponse?: string | BaseAiRequestResult;
  
  // 파싱된 타입별 응답
  parsedResponse?: BaseAiRequestResult;
  
  // 메타데이터
  metadata: {
    processingSteps: string[];
  };
}

/**
 * 체인 실행 결과
 */
export interface ChainResult {
  success: boolean;
  data: ChainState;
  error?: string;
}

/**
 * 스트리밍 업데이트 타입
 */
export type StreamUpdateType = 
  | 'step_start'        // 단계 시작
  | 'step_complete'     // 단계 완료
  | 'token_stream'      // 실시간 토큰 스트리밍
  | 'partial_response'  // 부분 응답
  | 'reasoning_preview' // reasoning 텍스트 미리보기
  | 'error'             // 에러 발생
  | 'final_result';     // 최종 결과

/**
 * 스트리밍 업데이트 데이터
 */
export interface StreamUpdate {
  type: StreamUpdateType;
  step: string;
  timestamp: number;
  data?: Partial<ChainState>;
  // 토큰 스트리밍 관련 필드
  token?: string;              // 개별 토큰
  partialResponse?: string;    // 누적된 부분 응답
  tokenCount?: number;         // 현재까지 받은 토큰 수
  isFinal?: boolean;          // 최종 토큰 여부
  // reasoning 미리보기 관련 필드
  reasoning?: string;          // 추출된 reasoning 텍스트
  error?: string;
}

/**
 * 스트리밍 결과
 */
export interface StreamResult {
  success: boolean;
  updates: AsyncIterable<StreamUpdate>;
  error?: string;
}