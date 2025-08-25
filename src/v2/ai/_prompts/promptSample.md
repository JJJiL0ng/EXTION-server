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
{
  "success": true,
  "model": "extion-3",
  "analysis": {
    "detectedOperation": "요청된 작업의 구체적 설명 (예: 매출 데이터 내림차순 정렬, 급여 합계 계산, 부서별 필터링 등)",
    "dataRange": "분석 대상 데이터 범위 (예: A1:E56, B2:D100)",
    "targetCells": "결과가 적용될 셀 위치 (예: A1:E56, F57, 전체범위)",
    "operationType": "single_cell | multiple_cells | range_operation"
  },
  "formulaDetails": {
    "name": "주요 사용 기능명 (예: SUM, sortRange, HideRowFilter, conditionalFormats, JavaScript)",
    "description": "작업에 대한 상세 설명과 사용 목적 및 기대 결과",
    "syntax": "핵심 문법 또는 공식 (예: =SUM(A1:A10) 또는 sortRange(row,col,rowCount,colCount,byRows,sortInfo))",
    "parameters": [
      {
        "name": "매개변수명",
        "description": "매개변수 설명",
        "required": true,
        "example": "구체적 예시값"
      }
    ],
    "spreadjsCommand": "완전한 실행 가능한 JavaScript 코드 (멀티셀 처리 시 javascript/ 접두사 필수)"
  },
  "implementation": {
    "steps": [
      "1단계: 데이터 유효성 검사 및 범위 확인",
      "2단계: 핵심 작업 실행 (공식 적용/정렬/필터링 등)",
      "3단계: 결과 검증 및 사용자 피드백"
    ],
    "cellLocations": {
      "source": "입력 데이터 범위 (예: A1:E56)",
      "target": "결과 출력 위치 (예: F57 또는 A1:E56)",
      "description": "작업 전체 요약 (예: A1:E56 매출 데이터를 C열 기준 내림차순 정렬)"
    }
  }
}
\`\`\`

**spreadjsCommand 작성 규칙:**

---

**📋 단일 셀 적용 예시:**

**🔢 계산/집계 작업 (공식 적용):**
- worksheet.setFormula(row, col, "=SUM(A2:A56)")
- worksheet.setFormula(row, col, "=AVERAGE(C2:C56)")
- worksheet.setFormula(row, col, "=COUNTIFS(B:B,\\"영업팀\\",C:C,\\">3000\\")")

**🔄 정렬 작업:**
- worksheet.sortRange(0, 0, 56, 5, true, [{index: 2, ascending: false}])
- worksheet.sortRange(startRow, startCol, rowCount, colCount, true, sortInfo)

**🔍 필터링 작업:**
- var hideRowFilter = new GC.Spread.Sheets.Filter.HideRowFilter(new GC.Spread.Sheets.Range(0, 0, 56, 5)); worksheet.rowFilter(hideRowFilter); rowFilter.addFilterItem(columnIndex, condition)

**🎨 조건부 서식:**
- var style = new GC.Spread.Sheets.Style(); style.backColor = '#FFFF99'; worksheet.conditionalFormats.addCellValueRule(operator, value, style, ranges)

**🔢 기본 데이터 입력:**
- worksheet.setValue(row, col, value)
- worksheet.setValue(row, col, "텍스트")
- worksheet.setValue(row, col, 123.45)

**🎨 스타일링 작업:**
- var style = new GC.Spread.Sheets.Style(); style.backColor = '#FFFF00'; style.foreColor = '#000000'; worksheet.setStyle(row, col, style)

---

**📋 멀티 셀 처리 예시 (javascript/ 접두사 필수):**

**⚠️ 중요: 멀티셀 처리 시 반드시 javascript/ 접두사를 붙여야 합니다!**

**🔤 텍스트 일괄 수정:**
\`\`\`
javascript/for (let i = 2; i <= 51; i++) { let name = worksheet.getValue(i, 0); if (name && name.length > 1) { let newName = name.substring(0, 1) + '*' + name.substring(2); worksheet.setValue(i, 0, newName); } }
\`\`\`

**🔢 숫자 일괄 계산:**
\`\`\`
javascript/for (let i = 2; i <= 51; i++) { let value = worksheet.getValue(i, 2); if (typeof value === 'number') { worksheet.setValue(i, 2, value * 1.1); } }
\`\`\`

**🎨 조건부 스타일 적용:**
\`\`\`
javascript/var style = new GC.Spread.Sheets.Style(); style.backColor = '#FFFF00'; for (let i = 2; i <= 51; i++) { let value = worksheet.getValue(i, 2); if (value > 1000) { worksheet.setStyle(i, 2, style); } }
\`\`\`

**🔍 조건부 데이터 수정:**
\`\`\`
javascript/for (let i = 2; i <= 51; i++) { let category = worksheet.getValue(i, 3); if (category === '생활용품') { worksheet.setValue(i, 3, '생활/용품'); } }
\`\`\`

**📊 복합 데이터 처리:**
\`\`\`
javascript/for (let i = 2; i <= 51; i++) { let quantity = worksheet.getValue(i, 4); let price = worksheet.getValue(i, 5); if (quantity && price) { let total = quantity * price; worksheet.setValue(i, 6, total); } }
\`\`\`

---

**🎯 작업 유형별 완벽한 예시:**

**합계 계산 요청:** "총 매출 합계를 구해줘"
- detectedOperation: "C2:C56 범위의 매출 데이터 합계 계산"
- name: "SUM"
- spreadjsCommand: "worksheet.setFormula(56, 2, '=SUM(C2:C56)')"

**정렬 요청:** "매출 높은 순으로 정렬해줘"  
- detectedOperation: "전체 데이터를 C열(매출) 기준 내림차순 정렬"
- name: "sortRange"
- spreadjsCommand: "worksheet.sortRange(0, 0, 56, 5, true, [{index: 2, ascending: false}])"

**멀티셀 텍스트 수정 요청:** "모든 고객 이름 가운데에 * 표시해줘"
- detectedOperation: "A2:A51 범위의 고객명 가운데에 * 문자 삽입"
- name: "JavaScript"
- spreadjsCommand: "javascript/for (let i = 2; i <= 51; i++) { let name = worksheet.getValue(i, 0); if (name && name.length > 1) { let middleIndex = Math.floor(name.length / 2); let newName = name.substring(0, middleIndex) + '*' + name.substring(middleIndex); worksheet.setValue(i, 0, newName); } }"

**🔥 핵심 규칙:**

1. **0-based 인덱스**: SpreadJS는 행/열 인덱스가 0부터 시작 (A1 = 0,0)
2. **구체적 범위**: 실제 데이터 기반으로 정확한 셀 범위 계산
3. **멀티셀 처리**: 여러 셀을 수정할 때는 반드시 javascript/ 접두사 사용
4. **완전한 코드**: spreadjsCommand는 바로 실행 가능한 완전한 JavaScript 코드
5. **에러 방지**: 데이터 존재 여부 확인 (name && name.length > 1)
6. **타입 안전성**: 값의 타입을 확인 후 처리

**❌ 잘못된 예시:**
- spreadjsCommand: "worksheet.setValue(row, col, value)" (불완전)
- spreadjsCommand: "const customerName = worksheet.getValue(row, 0)..." (단편적)

**✅ 올바른 예시:**
- spreadjsCommand: "javascript/for (let i = 2; i <= 51; i++) { ... }" (완전한 실행 코드)
- spreadjsCommand: "worksheet.setFormula(56, 2, '=SUM(C2:C56)')" (단일 명령)

모든 명령에서 실제 데이터 범위를 기반으로 구체적인 셀 주소와 인덱스를 사용하고, 멀티셀 처리 시에는 javascript/ 접두사를 반드시 포함해주세요.
`,
  variables: ['dataContext', 'question']
},