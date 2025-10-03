import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatPromptTemplate, HumanMessagePromptTemplate, SystemMessagePromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { Runnable } from '@langchain/core/runnables';
import { FILE_NAME_MAKER_HUMAN_PROMPT } from '../../prompts/fileNameMaker/fileNmaeMaker_human.prompt';
import { FILE_NAME_MAKER_SYSTEM_PROMPT } from '../../prompts/fileNameMaker/fileNameMaker.prompt';

export function createFileNameMakerRunnable(model: BaseChatModel): Runnable {
  // 1) 시스템/휴먼 프롬프트를 각각 정의 후 결합 (LCEL 규칙)
  const systemMessage = SystemMessagePromptTemplate.fromTemplate(FILE_NAME_MAKER_SYSTEM_PROMPT);
  const humanMessage = HumanMessagePromptTemplate.fromTemplate(FILE_NAME_MAKER_HUMAN_PROMPT);

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
      console.log('DEBUG: Raw LLM output:', output);

      // 문자열 정리 (불필요한 공백, 따옴표 등 제거)
      try {
        let cleanedOutput = output.trim();
        
        // 따옴표로 감싸진 경우 제거
        if ((cleanedOutput.startsWith('"') && cleanedOutput.endsWith('"')) ||
            (cleanedOutput.startsWith("'") && cleanedOutput.endsWith("'"))) {
          cleanedOutput = cleanedOutput.slice(1, -1);
        }
        
        console.log('DEBUG: Cleaned output:', cleanedOutput);
        return cleanedOutput;
      } catch (error) {
        console.warn('DEBUG: Failed to clean output, using original:', error);
        return output.trim();
      }
    });
}