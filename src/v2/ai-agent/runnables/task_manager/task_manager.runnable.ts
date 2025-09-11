import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatPromptTemplate, HumanMessagePromptTemplate, SystemMessagePromptTemplate } from '@langchain/core/prompts';
import { JsonOutputParser, StringOutputParser } from '@langchain/core/output_parsers';
import { Runnable } from '@langchain/core/runnables';
import { TASK_MANAGER_SYSTEM_PROMPT } from '../../prompts/task_manager/taskManager_system.prompt'; // Adjust the import path as needed
import { TASK_MANAGER_HUMAN_PROMPT } from '../../prompts/task_manager/taskManager_human.prompt'; // Adjust the import path as needed
// lcel의 프롬프트 탬플릿에서 js변수를 파싱하여 필요한 변수를 매개변수로 받도록 설정함
// 여기선 question, dataContext를 넣어줘야함
// 사용법
// const taskManagerChain = createTaskManagerRunnable(model);
// const plan0 = await taskManagerRunnable.invoke({
//     question: {userQuestionMessage},
//     dataContext: {dataContext}
//   });
export function createTaskManagerRunnable(model: BaseChatModel): Runnable {
  // 1) 시스템/휴먼 프롬프트를 각각 정의 후 결합 (LCEL 규칙)
  const systemMessage = SystemMessagePromptTemplate.fromTemplate(TASK_MANAGER_SYSTEM_PROMPT);
  const humanMessage = HumanMessagePromptTemplate.fromTemplate(TASK_MANAGER_HUMAN_PROMPT);

  const chatPrompt = ChatPromptTemplate.fromMessages([
    systemMessage,
    humanMessage,
  ]);

  // 2. Define the parser to convert the model's string output to JSON.
  const parser = new JsonOutputParser();

  // 3. Compose the components into a final runnable chain and return it.
  return chatPrompt
    .pipe(model)
    .pipe(new StringOutputParser())
    .pipe((output: string) => {
      console.log('DEBUG: Raw LLM output:', output);

      // JSON 정리 (마크다운 코드블록 등 제거 가능)
      try {
        let cleanedOutput = output;
        // 필요 시 코드블록 제거 로직을 활성화
        // cleanedOutput = cleanedOutput.replace(/```json\s*|```/g, '');
        cleanedOutput = cleanedOutput.trim();
        console.log('DEBUG: Cleaned output:', cleanedOutput);
        return cleanedOutput;
      } catch (error) {
        console.warn('DEBUG: Failed to clean output, using original:', error);
        return output;
      }
    })
    .pipe(parser);
}