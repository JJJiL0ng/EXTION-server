// src/v2/ai/prompts/prompt.templates.ts

import { IntentType } from '../_types/chain.types';

/**
 * 프롬프트 템플릿 정의
 */
export interface PromptTemplate {
  id: string;
  category: IntentType;
  name: string;
  description: string;
  template: string;
  variables: string[];
}

/**
 * 의도 분석용 프롬프트
 */
export const INTENT_ANALYSIS_PROMPT = `
다음 사용자 질문을 분석하여 의도를 파악해주세요.

사용자 질문: {question}

데이터 컨텍스트:
- 시트 수: {sheetCount}개
- 총 셀 수: {totalCells}개
- 데이터 미리보기: {dataPreview}

가능한 의도 유형:
1. excel_formula: 엑셀 공식, 함수 사용법 문의
2. python_code_generator: 데이터 분석을 위한 파이썬 코드 생성 요청
3. whole_data: 전체 데이터를 읽어야만 하는 경우
4. general_help: 일반적인 엑셀 사용법 문의

다음 JSON 형식으로 응답해주세요:
{
  "intent": "의도_유형",
  "confidence": 0.0-1.0,
  "keywords": ["키워드1", "키워드2"],
  "reasoning": "판단 근거"
}
`;

/**
 * 카테고리별 프롬프트 템플릿들
 */
export const PROMPT_TEMPLATES: PromptTemplate[] = [
  // spreadjs(excel) 공식 관련
{
  id: 'excel_formula_basic',
  category: 'excel_formula',
  name: '기본 공식 도움말',
  description: 'SpreadJS 공식과 함수 사용법 안내',
  template: `
다음은 사용자의 SpreadJS 워크시트 데이터입니다:

{dataContext}

사용자 질문: {question}

SpreadJS 공식 전문가로서 답변하고, 다음 JSON 형식으로 응답해주세요:

\`\`\`json
{
  "success": true,
  "tokensUsed": 0,
  "responseTime": 0,
  "model": "claude",
  "cached": false,
  "confidence": 0.9,
  "formulaDetails": {
    "name": "함수명 (예: SUM, VLOOKUP 등)",
    "description": "함수의 상세 설명과 사용 목적",
    "syntax": "함수 문법 (예: =SUM(범위1, 범위2, ...))",
    "parameters": [
      {
        "name": "매개변수명",
        "description": "매개변수 설명",
        "required": true
      }
    ]
  }
}
\`\`\`

다음을 포함하여 formulaDetails를 구성해주세요:

1. **적절한 공식이나 함수 제안**
   - SpreadJS에서 지원하는 500+ 내장 함수 중 최적의 선택
   - Excel 호환 함수 우선 고려

2. **구체적인 JavaScript 코드 예시**
   - setFormula() 메서드 사용법
   - setValue()와 getFormula() 활용
   - 동적 배열 공식 (allowDynamicArray) 활용법

3. **단계별 구현 가이드**
   - 워크시트 객체 접근 방법
   - 셀 범위 지정 및 공식 적용
   - 이벤트 처리 (CellChanged, ValueChanged 등)

4. **SpreadJS 특화 기능 활용**
   - 테이블 공식 (setColumnDataFormula)
   - 사용자 정의 함수 생성 (GC.Spread.CalcEngine.Functions.Function)
   - 배열 공식 및 스필 범위 처리

5. **주의사항 및 최적화 팁**
   - 계산 성능 최적화 (suspendPaint/resumePaint)
   - 순환 참조 방지
   - 브라우저 호환성 고려사항

description 필드에는 실무에서 바로 적용 가능한 명확하고 실용적인 설명과 JavaScript 코드 예시를 포함해주세요.
`,
  variables: ['dataContext', 'question']
},

  // 파이썬 코드 생성 관련
  {
    id: 'python_code_generator_basic',
    category: 'python_code_generator',
    name: '파이썬 코드 생성',
    description: '데이터 분석을 위한 파이썬 코드 생성',
    template: `
다음 스프레드시트 데이터를 분석하기 위한 파이썬 코드를 생성해주세요:

{dataContext}

사용자 요청: {question}

데이터 분석 및 파이썬 전문가로서 코드를 생성하고, 다음 JSON 형식으로 응답해주세요:

\`\`\`json
{
  "success": true,
  "tokensUsed": 0,
  "responseTime": 0,
  "model": "claude",
  "cached": false,
  "confidence": 0.9,
  "codeGenerator": {
    "pythonCode": "완전한 실행 가능한 파이썬 코드",
    "explanation": "코드의 상세한 설명과 실행 방법"
  }
}
\`\`\`

pythonCode와 explanation을 구성할 때 다음을 포함해주세요:

1. **필요한 라이브러리 import 문**
   - pandas, numpy, matplotlib, seaborn 등 데이터 분석에 적합한 라이브러리
   - 최신 파이썬 라이브러리 활용

2. **데이터 로딩 및 전처리 코드**
   - 스프레드시트 데이터를 DataFrame으로 변환
   - 데이터 클리닝 및 전처리

3. **요청에 맞는 분석 코드**
   - 통계 분석, 데이터 변환, 필터링 등
   - 사용자 요청에 특화된 분석 로직

4. **결과 시각화 코드 (적절한 경우)**
   - matplotlib, seaborn을 활용한 차트 생성
   - 분석 결과를 명확히 보여주는 시각화

5. **코드 실행 결과 예시**
   - 예상 출력 결과
   - 주요 분석 결과 해석

explanation 필드에는 코드의 각 부분에 대한 상세한 설명과 실행 방법을 포함해주세요.
`,
    variables: ['dataContext', 'question']
  },

  // 전체 데이터 수정 관련
  {
    id: 'whole_data_basic',
    category: 'whole_data',
    name: '전체 데이터 수정',
    description: '전체 데이터 수정 및 변환 안내',
    template: `
다음 데이터에 대한 전체 수정을 도와드리겠습니다:

{dataContext}

사용자 요청: {question}

데이터 처리 전문가로서 전체 데이터를 변환하고, 다음 JSON 형식으로 응답해주세요:

\`\`\`json
{
  "success": true,
  "tokensUsed": 0,
  "responseTime": 0,
  "model": "claude",
  "cached": false,
  "confidence": 0.9,
  "dataTransformation": {
    "transformedJsonData": "변환된 스프레드시트 JSON 데이터 전체"
  }
}
\`\`\`

transformedJsonData를 구성할 때 다음을 고려해주세요:

1. **현재 데이터 구조 분석**
   - 기존 스프레드시트의 구조와 형식 파악
   - 데이터 타입, 범위, 관계 분석

2. **요청에 맞는 데이터 변환**
   - 사용자 요청에 따른 데이터 수정, 추가, 삭제
   - 데이터 정렬, 필터링, 그룹화

3. **SpreadJS 호환 JSON 형식**
   - 올바른 SpreadJS JSON 스키마 준수
   - 셀 데이터, 스타일, 공식 등 포함

4. **데이터 정합성 보장**
   - 데이터 타입 일관성 유지
   - 참조 무결성 검증
   - 유효성 검사 규칙 적용

5. **최적화된 구조**
   - 불필요한 데이터 제거
   - 효율적인 데이터 구조 설계

transformedJsonData에는 완전히 변환된 스프레드시트 JSON 데이터를 포함해주세요.
`,
    variables: ['dataContext', 'question']
  },

  // 일반 도움말
  {
    id: 'general_help_basic',
    category: 'general_help',
    name: '일반 엑셀 도움말',
    description: '일반적인 엑셀 사용법 안내',
    template: `
엑셀 전문가로서 다음 질문에 답변드리겠습니다:

질문: {question}

현재 데이터 컨텍스트:
{dataContext}

다음 JSON 형식으로 응답해주세요:

\`\`\`json
{
  "success": true,
  "tokensUsed": 0,
  "responseTime": 0,
  "model": "claude",
  "cached": false,
  "confidence": 0.9,
  "generalHelp": {
    "directAnswer": "질문에 대한 직접적이고 명확한 답변",
    "additionalResources": [
      {
        "title": "추가 자료 제목",
        "description": "자료 설명",
        "link": "관련 링크 (선택사항)"
      }
    ]
  }
}
\`\`\`

generalHelp 객체를 구성할 때 다음을 포함해주세요:

1. **directAnswer - 질문에 대한 직접적인 답변**
   - 사용자 질문에 대한 명확하고 구체적인 답변
   - 실무에서 바로 적용 가능한 내용

2. **관련 엑셀 기능 소개**
   - 질문과 관련된 SpreadJS/Excel 기능 설명
   - 기능의 사용법과 활용 방법

3. **실용적인 사용 예시**
   - 구체적인 사용 시나리오
   - 단계별 실행 방법

4. **additionalResources - 추가 학습 자료나 팁**
   - 더 깊이 있는 학습을 위한 자료
   - 관련 기능이나 고급 팁
   - 유용한 참고 링크 (있는 경우)

초보자도 이해할 수 있도록 친절하고 명확하게 설명해주세요.
`,
    variables: ['dataContext', 'question']
  }
];

/**
 * 프롬프트 선택기 클래스
 */
export class PromptSelector {
  private static templates = new Map<string, PromptTemplate>();

  static {
    // 템플릿들을 Map에 저장
    PROMPT_TEMPLATES.forEach(template => {
      this.templates.set(template.id, template);
    });
  }

  /**
   * 의도에 따라 적절한 프롬프트 템플릿 선택
   */
  static selectByIntent(intent: IntentType): PromptTemplate {
    // 각 의도에 대한 기본 템플릿 매핑
    const intentToTemplateId: Record<IntentType, string> = {
      'excel_formula': 'excel_formula_basic',
      'python_code_generator': 'python_code_generator_basic',
      'whole_data': 'whole_data_basic',
      'general_help': 'general_help_basic'
    };

    const templateId = intentToTemplateId[intent];
    const template = this.templates.get(templateId);

    if (!template) {
      // 기본 템플릿으로 폴백
      return this.templates.get('general_help_basic')!;
    }

    return template;
  }

  /**
   * ID로 템플릿 조회
   */
  static getById(id: string): PromptTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * 카테고리별 템플릿 조회
   */
  static getByCategory(category: IntentType): PromptTemplate[] {
    return PROMPT_TEMPLATES.filter(template => template.category === category);
  }

  /**
   * 모든 템플릿 조회
   */
  static getAllTemplates(): PromptTemplate[] {
    return Array.from(this.templates.values());
  }
}