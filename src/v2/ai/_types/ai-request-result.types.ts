import { ChatIntentType } from '../../chatting/_main-chat/dto/main-chat-res.dto';

// 기본 AI 요청 결과 인터페이스
export interface BaseAiRequestResult {
  success: boolean;
  tokensUsed: number;
  responseTime: number;
  model: string;
  cached: boolean;
  confidence?: number;
}

// 분석 정보 인터페이스
export interface AnalysisInfo {
  detectedOperation: string; // 계산, 집계, 데이터변환, 조건부포맷팅 등
  dataRange: string; // A1:D10
  targetCells: string; // E1 또는 E1:E10
  operationType: 'single_cell' | 'multiple_cells' | 'range_operation';
}

// 공식 매개변수 인터페이스
export interface FormulaParameter {
  name: string;
  description: string;
  required: boolean;
  example?: string; // 예시 추가
}

// 공식 상세 정보 인터페이스
export interface FormulaDetails {
  name: string;
  description: string;
  syntax: string;
  parameters: FormulaParameter[];
  spreadjsCommand: string; // 새로 추가된 핵심 필드
}

// 실행 단계 정보 인터페이스
export interface ImplementationInfo {
  steps: string[]; // 실행 단계별 설명
  cellLocations: {
    source: string; // 원본 데이터 범위
    target: string; // 결과 셀 위치
    description: string; // 작업 설명
  };
}

// 확장된 엑셀 공식 관련 결과 인터페이스
export interface ExcelFormulaResult extends BaseAiRequestResult {
  analysis: AnalysisInfo; // 요청 분석 정보
  formulaDetails: FormulaDetails; // 공식 상세 정보 (spreadjsCommand 포함)
  implementation: ImplementationInfo; // 실행 관련 정보
}

// 파이썬 코드 생성 관련 결과 인터페이스
export interface PythonCodeGeneratorResult extends BaseAiRequestResult {
  codeGenerator: {
    pythonCode: string;
    explanation: string;
  };
}

// 전체 데이터 처리 관련 결과 인터페이스(전체 json을 수정하여 반영)
export interface WholeDataResult extends BaseAiRequestResult {
  dataTransformation: {
    transformedJsonData: string;
    };
}

// 일반 도움말 관련 결과 인터페이스
export interface GeneralHelpResult extends BaseAiRequestResult {
  generalHelp: {
    directAnswer: string;
    additionalResources?: Array<{
      title: string;
      description: string;
      link?: string;
    }>;
  };
}

