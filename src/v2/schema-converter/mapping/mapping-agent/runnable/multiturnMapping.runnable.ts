import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatPromptTemplate, HumanMessagePromptTemplate, SystemMessagePromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { Runnable } from '@langchain/core/runnables';
import { MULTITURN_MAPPING_PROMPT } from '../prompt/multiturn/multiturnMapping.prompt';
import { MULTITURN_MAPPING_HUMAN_PROMPT } from '../prompt/multiturn/multiturnMapping.human.prompt';

export function createMultiturnMappingRunnable(model: BaseChatModel): Runnable {
  // 1) 시스템/휴먼 프롬프트를 각각 정의 후 결합 (LCEL 규칙)
  const systemMessage = SystemMessagePromptTemplate.fromTemplate(MULTITURN_MAPPING_PROMPT);
  const humanMessage = HumanMessagePromptTemplate.fromTemplate(MULTITURN_MAPPING_HUMAN_PROMPT);

  const chatPrompt = ChatPromptTemplate.fromMessages([
    systemMessage,
    humanMessage,
  ]);

  // 2. Define the parser to convert the model's output to a clean string.
  const parser = new StringOutputParser();

  // 3. Compose the components into a final runnable chain and return it.
  return chatPrompt
    .pipe(model)
    .pipe(parser)
    .pipe((output: string) => {
      console.log('DEBUG: Raw LLM output (length:', output.length, ')');
      console.log('DEBUG: First 300 chars:', output.substring(0, 300));
      console.log('DEBUG: Last 300 chars:', output.substring(Math.max(0, output.length - 300)));

      // JSON 코드블록 추출 (```json ... ``` 형식)
      let jsonString = output.trim();

      // 코드블록 마커 제거
      const jsonBlockMatch = jsonString.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonBlockMatch) {
        jsonString = jsonBlockMatch[1].trim();
      } else {
        // 코드블록이 없으면 { 부터 } 까지 추출
        const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonString = jsonMatch[0];
        }
      }

      // JSON이 중간에 잘렸는지 확인하고 복구 시도
      jsonString = fixIncompleteJson(jsonString);

      try {
        // JSON 파싱하여 유효성 검증
        const mappingScript = JSON.parse(jsonString);

        // 필수 필드 검증
        if (!mappingScript.source_sheet || !mappingScript.target_sheet || !Array.isArray(mappingScript.mappings)) {
          console.warn('DEBUG: Invalid mapping script structure');
          throw new Error('Invalid mapping script structure: missing required fields (source_sheet, target_sheet, or mappings array)');
        }

        console.log('DEBUG: Mapping script parsed successfully with', mappingScript.mappings.length, 'mappings');

        // 검증된 JSON을 문자열로 반환
        return JSON.stringify(mappingScript, null, 2);
      } catch (error) {
        console.error('DEBUG: Failed to parse mapping script JSON:', error);
        console.error('DEBUG: Attempted to parse (first 500 chars):', jsonString.substring(0, 500));
        console.error('DEBUG: Attempted to parse (last 500 chars):', jsonString.substring(Math.max(0, jsonString.length - 500)));
        throw new Error(`Failed to parse mapping script: ${error.message}`);
      }
    });
}

/**
 * 불완전한 JSON을 복구하는 헬퍼 함수
 * AI가 출력 토큰 제한으로 JSON을 중간에 자른 경우 복구 시도
 */
function fixIncompleteJson(jsonString: string): string {
  // 트레일링 쉼표 제거
  jsonString = jsonString.replace(/,(\s*[}\]])/g, '$1');

  // JSON이 mappings 배열 중간에 잘렸는지 확인
  const lastBracketIndex = jsonString.lastIndexOf('}');
  const lastArrayBracketIndex = jsonString.lastIndexOf(']');

  // mappings 배열이 닫히지 않은 경우
  if (lastBracketIndex > lastArrayBracketIndex && !jsonString.trim().endsWith('}')) {
    console.warn('DEBUG: Detected incomplete JSON - attempting to fix');

    // 마지막 완전한 객체를 찾기
    const lastCompleteObjectEnd = jsonString.lastIndexOf('}');
    if (lastCompleteObjectEnd !== -1) {
      // 마지막 완전한 객체까지만 사용하고 배열과 최상위 객체 닫기
      jsonString = jsonString.substring(0, lastCompleteObjectEnd + 1);

      // 배열이 닫히지 않았으면 닫기
      if (!jsonString.includes(']', lastCompleteObjectEnd)) {
        jsonString += '\n  ]';
      }

      // 최상위 객체가 닫히지 않았으면 닫기
      if (!jsonString.trim().endsWith('}')) {
        jsonString += '\n}';
      }
    }
  }

  // 배열이 완전히 열리지 않은 경우 처리
  if (jsonString.includes('"mappings":') && !jsonString.includes('"mappings": [')) {
    jsonString = jsonString.replace('"mappings":', '"mappings": [');
  }

  return jsonString;
}