export const MAPPING_SUGGESTION_HUMAN_PROMPT = `
다음 두 시트의 데이터를 분석하여, 어떻게 매핑하면 좋을지 친절하게 설명해줘.

**원본 시트 정보:**
- 분석 범위 (행 시작-행 끝-열 시작-열 끝): {sourceSheetRange}
- 시트 데이터:
{sourceSheet}

**타겟 시트 정보:**
- 분석 범위 (행 시작-행 끝-열 시작-열 끝): {targetSheetRange}
- 시트 데이터:
{targetSheet}

위의 시스템 프롬프트에서 지정한 형식으로 매핑 제안을 작성해줘. 사용자에게 보여줄 자연스러운 설명 문장만 작성하면 돼.
`;