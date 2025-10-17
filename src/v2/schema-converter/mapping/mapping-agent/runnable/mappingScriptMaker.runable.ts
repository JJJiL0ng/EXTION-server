import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatPromptTemplate, HumanMessagePromptTemplate, SystemMessagePromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { Runnable } from '@langchain/core/runnables';
import { MAPPING_SCRIPT_MAKER } from '../prompt/mappingScript/mappingScriptMaker.prompt';
import { MAPPING_SCRIPT_MAKER_HUMAN } from '../prompt/mappingScript/mappingScriptMaker.human.prompt';

export function createMappingScriptMakerRunnable(model: BaseChatModel): Runnable {
  // 1) 시스템/휴먼 프롬프트를 각각 정의 후 결합 (LCEL 규칙)
  const systemMessage = SystemMessagePromptTemplate.fromTemplate(MAPPING_SCRIPT_MAKER);
  const humanMessage = HumanMessagePromptTemplate.fromTemplate(MAPPING_SCRIPT_MAKER_HUMAN);

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

      try {
        // JSON 파싱하여 유효성 검증
        const mappingScript = JSON.parse(jsonString);
        
        // 필수 필드 검증
        if (!mappingScript.source_sheet || !mappingScript.target_sheet || !Array.isArray(mappingScript.mappings)) {
          console.warn('DEBUG: Invalid mapping script structure');
          throw new Error('Invalid mapping script structure');
        }

        console.log('DEBUG: Mapping script parsed successfully with', mappingScript.mappings.length, 'mappings');
        
        // 검증된 JSON을 문자열로 반환
        return JSON.stringify(mappingScript, null, 2);
      } catch (error) {
        console.error('DEBUG: Failed to parse mapping script JSON:', error);
        console.error('DEBUG: Attempted to parse:', jsonString);
        throw new Error(`Failed to parse mapping script: ${error.message}`);
      }
    });
}