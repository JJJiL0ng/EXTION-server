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

// 엑셀 공식 관련 결과 인터페이스
export interface ExcelFormulaResult extends BaseAiRequestResult {
  formulaDetails: {
    name: string;
    description: string;
    syntax: string;
    parameters: Array<{
      name: string;
      description: string;
      required: boolean;
    }>;
  };
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

