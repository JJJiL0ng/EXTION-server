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
      // 마크다운 형식의 매핑 제안서를 그대로 반환
      const mappingSuggestion = output.trim();

      if (!mappingSuggestion) {
        throw new Error('Empty mapping suggestion received from AI');
      }

      return mappingSuggestion;
    });
}
