import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { PromptTemplate } from '@langchain/core/prompts';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { Runnable } from '@langchain/core/runnables';
import { TASK_MANAGER_PROMPT } from '../../prompts/taskManager.prompt'; // Adjust the import path as needed

// lcel의 프롬프트 탬플릿에서 js변수를 파싱하여 필요한 변수를 매개변수로 받도록 설정함
// 여기선 question, dataContext를 넣어줘야함
// 사용법
// const taskManagerChain = createTaskManagerRunnable(model);
// const plan0 = await taskManagerRunnable.invoke({
//     question: {userQuestionMessage},
//     dataContext: {dataContext}
//   });
export function createTaskManagerRunnable(model: BaseChatModel): Runnable {
  // 1. Define the prompt template from the imported constant.
  const prompt = PromptTemplate.fromTemplate(TASK_MANAGER_PROMPT);

  // 2. Define the parser to convert the model's string output to JSON.
  const parser = new JsonOutputParser();

  // 3. Compose the components into a final runnable chain and return it.
  return prompt.pipe(model).pipe(parser);
}