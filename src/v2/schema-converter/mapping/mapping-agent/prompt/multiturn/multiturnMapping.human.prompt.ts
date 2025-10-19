export const MULTITURN_MAPPING_HUMAN_PROMPT = `
# 입력
**원본 시트 정보:**
- 분석 범위 (행 시작-행 끝-열 시작-열 끝): {sourceSheetRange}
- 시트 데이터:
{sourceSheet}

**타겟 시트 정보:**
- 분석 범위 (행 시작-행 끝-열 시작-열 끝): {targetSheetRange}
- 시트 데이터:
{targetSheet}

**작업요청사항**
- 다음 방식대로 매핑 스크립트 작성: {mappingRequest}
`;