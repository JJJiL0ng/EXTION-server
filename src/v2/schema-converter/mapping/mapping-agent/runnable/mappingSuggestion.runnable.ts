import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatPromptTemplate, HumanMessagePromptTemplate, SystemMessagePromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { Runnable } from '@langchain/core/runnables';
import { MAPPING_SUGGESTION_HUMAN_PROMPT } from '../prompt/mappingSuggestion/mappingSuggestion.human.prompt';
import { MAPPING_SUGGESTION_SYSTEM_PROMPT } from '../../mapping-agent/prompt/mappingSuggestion/mappingSuggestion.prompt';

export function createMappingSuggestionRunnable(model: BaseChatModel): Runnable {
  // 1) 시스템/휴먼 프롬프트를 각각 정의 후 결합 (LCEL 규칙)
  const systemMessage = SystemMessagePromptTemplate.fromTemplate(MAPPING_SUGGESTION_SYSTEM_PROMPT);
  const humanMessage = HumanMessagePromptTemplate.fromTemplate(MAPPING_SUGGESTION_HUMAN_PROMPT);

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

      // 문자열 정리 (자연어 응답이므로 단순 trim만)
      const cleanedOutput = output.trim();

      if (cleanedOutput) {
        console.log('DEBUG: Mapping suggestion text generated (length:', cleanedOutput.length, ')');
      } else {
        console.warn('DEBUG: Empty output from LLM');
      }

      return cleanedOutput;
    });
}