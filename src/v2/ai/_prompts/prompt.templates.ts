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
 * 의도 분석용 프롬프트 (중괄호 이스케이프 처리됨)
 */
export const INTENT_ANALYSIS_PROMPT = `
다음 사용자 질문을 분석하여 의도를 파악해주세요.

사용자 질문: {question}

데이터 컨텍스트:
- 시트 수: {sheetCount}개
- 총 셀 수: {totalCells}개
- 데이터 미리보기: {dataPreview}

가능한 의도 유형:
1. excel_formula: 엑셀 공식 함수로 처리 가능한 경우
2. python_code_generator: 데이터 분석을 위한 파이썬 코드 생성 요청
3. whole_data: 전체 데이터를 읽어야만 하는 경우
4. general_help: 전체 데이터를 읽지 않아도 답변가능한 가벼운 서비스 사용법 문의

다음 JSON 형식으로 응답해주세요:
{{
  "intent": "의도_유형",
  "confidence": 0.0-1.0,
  "keywords": ["키워드1", "키워드2"],
  "reasoning": "판단 근거"
}}
`;

/**
 * 카테고리별 프롬프트 템플릿들 (중괄호 이스케이프 처리됨)
 */
export const PROMPT_TEMPLATES: PromptTemplate[] = [
  // excel 함수 기반 데이터 수정 및 변환
  // 개선된 excel_formula_advanced 템플릿

{
  id: 'excel_formula_advanced',
  category: 'excel_formula', 
  name: '스프레드시트 데이터 분석 및 수정',
  description: 'SpreadJS 기반 스프레드시트 데이터 분석, 계산, 정렬, 필터링 및 자동화',
  template: `
다음은 사용자의 스프레드시트 데이터입니다:
{dataContext}

사용자 요청: {question}

SpreadJS 전문가로서 사용자의 요청을 분석하고, 다음 JSON 형식으로 정확히 응답해주세요:

\`\`\`json
{{
  "success": true,
  "tokensUsed": 0,
  "responseTime": 0,
  "model": "claude",
  "cached": false,
  "confidence": 0.95,
  "analysis": {{
    "detectedOperation": "요청된 작업의 구체적 설명 (예: 매출 데이터 내림차순 정렬, 급여 합계 계산, 부서별 필터링 등)",
    "dataRange": "분석 대상 데이터 범위 (예: A1:E56, B2:D100)",
    "targetCells": "결과가 적용될 셀 위치 (예: A1:E56, F57, 전체범위)",
    "operationType": "single_cell | multiple_cells | range_operation"
  }},
  "formulaDetails": {{
    "name": "주요 사용 기능명 (예: SUM, sortRange, HideRowFilter, conditionalFormats)",
    "description": "작업에 대한 상세 설명과 사용 목적 및 기대 결과",
    "syntax": "핵심 문법 또는 공식 (예: =SUM(A1:A10) 또는 sortRange(row,col,rowCount,colCount,byRows,sortInfo))",
    "parameters": [
      {{
        "name": "매개변수명",
        "description": "매개변수 설명",
        "required": true,
        "example": "구체적 예시값"
      }}
    ],
    "spreadjsCommand": "완전한 실행 가능한 JavaScript 코드"
  }},
  "implementation": {{
    "steps": [
      "1단계: 데이터 유효성 검사 및 범위 확인",
      "2단계: 핵심 작업 실행 (공식 적용/정렬/필터링 등)",
      "3단계: 결과 검증 및 사용자 피드백"
    ],
    "cellLocations": {{
      "source": "입력 데이터 범위 (예: A1:E56)",
      "target": "결과 출력 위치 (예: F57 또는 A1:E56)",
      "description": "작업 전체 요약 (예: A1:E56 매출 데이터를 C열 기준 내림차순 정렬)"
    }}
  }}
}}
\`\`\`

**spreadjsCommand 작성 규칙:**

**🔢 계산/집계 작업 (공식 적용):**
- worksheet.setFormula(row, col, "=SUM(A2:A56)", GC.Spread.Sheets.SheetArea.viewport)
- worksheet.setFormula(row, col, "=AVERAGE(C2:C56)", GC.Spread.Sheets.SheetArea.viewport)
- worksheet.setFormula(row, col, "=COUNTIFS(B:B,\\"영업팀\\",C:C,\\">3000\\")", GC.Spread.Sheets.SheetArea.viewport)

**🔄 정렬 작업:**
- worksheet.sortRange(0, 0, 56, 5, true, [{{index: 2, ascending: false}}])
- worksheet.sortRange(startRow, startCol, rowCount, colCount, true, sortInfo)

**🔍 필터링 작업:**
- var hideRowFilter = new GC.Spread.Sheets.Filter.HideRowFilter(new GC.Spread.Sheets.Range(0, 0, 56, 5));
- worksheet.rowFilter(hideRowFilter);
- rowFilter.addFilterItem(columnIndex, condition);

**🎨 조건부 서식:**
- var style = new GC.Spread.Sheets.Style(); style.backColor = '#FFFF99';
- worksheet.conditionalFormats.addCellValueRule(operator, value, style, ranges);

**📊 다중 셀 처리:**
- worksheet.getRange(startRow, startCol, rowCount, colCount).formula("=FORMULA")
- for(let i = startRow; i <= endRow; i++) {{ worksheet.setFormula(i, col, formula); }}

**완전한 코드 템플릿:**
\`\`\`javascript
try {{
  // 1. 성능 최적화
  worksheet.suspendPaint();
  
  // 2. 입력 데이터 유효성 검사
  var rowCount = worksheet.getRowCount();
  var colCount = worksheet.getColumnCount();
  
  if (targetRow >= rowCount || targetCol >= colCount) {{
    throw new Error(\`대상 셀(\${{targetRow}}, \${{targetCol}})이 시트 범위(\${{rowCount}}, \${{colCount}})를 벗어났습니다.\`);
  }}
  
  // 3. 핵심 로직 실행 (작업 유형에 따라 선택)
  
  // 공식 적용 예시:
  worksheet.setFormula(targetRow, targetCol, '=SUM(A2:A56)', GC.Spread.Sheets.SheetArea.viewport);
  
  // 정렬 실행 예시:
  // worksheet.sortRange(0, 0, 56, 5, true, [{{index: 2, ascending: false}}]);
  
  // 필터링 실행 예시:
  // var hideRowFilter = new GC.Spread.Sheets.Filter.HideRowFilter(new GC.Spread.Sheets.Range(0, 0, 56, 5));
  // worksheet.rowFilter(hideRowFilter);
  
  // 4. 결과 검증
  var result = worksheet.getValue(targetRow, targetCol); // 공식 적용의 경우
  
  // 5. 성능 최적화 해제
  worksheet.resumePaint();
  
  // 6. 성공 로그
  console.log('✅ 작업 완료: ' + operationDescription);
  console.log('📍 적용 위치: ' + targetRange);
  console.log('📊 결과: ' + (result || '정렬/필터링 완료'));
  
}} catch(error) {{
  // 7. 에러 처리
  worksheet.resumePaint();
  console.error('❌ SpreadJS 작업 실패:', error.message);
  console.error('🔍 대상 위치:', targetRow + ', ' + targetCol);
  throw new Error('SpreadJS 실행 실패: ' + error.message);
}}
\`\`\`

**중요 주의사항:**
1. **0-based 인덱스**: SpreadJS는 행/열 인덱스가 0부터 시작 (A1 = 0,0)
2. **구체적 범위**: 실제 데이터 기반으로 정확한 셀 범위 계산 (A2:A56, B1:E100 등)
3. **SheetArea 명시**: 가능한 모든 곳에 GC.Spread.Sheets.SheetArea.viewport 사용
4. **완전한 에러 처리**: try-catch와 resumePaint() 보장
5. **작업별 특화**: 계산은 setFormula, 정렬은 sortRange, 필터는 rowFilter 사용

**작업 유형별 예시:**

**합계 계산 요청:** "총 매출 합계를 구해줘"
- detectedOperation: "C2:C56 범위의 매출 데이터 합계 계산"
- name: "SUM"
- spreadjsCommand: "worksheet.setFormula(56, 2, '=SUM(C2:C56)', GC.Spread.Sheets.SheetArea.viewport);"

**정렬 요청:** "매출 높은 순으로 정렬해줘"  
- detectedOperation: "전체 데이터를 C열(매출) 기준 내림차순 정렬"
- name: "sortRange"
- spreadjsCommand: "worksheet.sortRange(0, 0, 56, 5, true, [{{index: 2, ascending: false}}]);"

**필터링 요청:** "영업팀만 필터링해서 보여줘"
- detectedOperation: "B열(부서)에서 영업팀 데이터만 필터링"
- name: "HideRowFilter" 
- spreadjsCommand: "var filter = new GC.Spread.Sheets.Filter.HideRowFilter(range); worksheet.rowFilter(filter);"

모든 명령에서 실제 데이터 범위를 기반으로 구체적인 셀 주소와 인덱스를 사용해주세요.
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
{{
  "success": true,
  "tokensUsed": 245,
  "responseTime": 1350,
  "model": "claude",
  "cached": false,
  "confidence": 0.95,
  "codeGenerator": {{
    "pythonCode": "완전한 실행 가능한 파이썬 코드",
    "explanation": "코드의 상세한 설명과 실행 방법"
  }}
}}
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
{{
  "success": true,
  "tokensUsed": 245,
  "responseTime": 1350,
  "model": "claude",
  "cached": false,
  "confidence": 0.95,
  "dataTransformation": {{
    "transformedJsonData": "변환된 스프레드시트 JSON 데이터 전체"
  }}
}}
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
{{
  "success": true,
  "tokensUsed": 245,
  "responseTime": 1350,
  "model": "claude",
  "cached": false,
  "confidence": 0.95,
  "generalHelp": {{
    "directAnswer": "질문에 대한 직접적이고 명확한 답변",
    "additionalResources": [
      {{
        "title": "추가 자료 제목",
        "description": "자료 설명",
        "link": "관련 링크 (선택사항)"
      }}
    ]
  }}
}}
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
      'excel_formula': 'excel_formula_advanced',
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