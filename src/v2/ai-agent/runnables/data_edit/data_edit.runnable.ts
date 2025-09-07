import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { PromptTemplate } from '@langchain/core/prompts';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { Runnable } from '@langchain/core/runnables';
import { APPLY_STYLE_PROMPT } from '../../prompts/data_edit/apply_style.prompt';
import { SORT_DATA_PROMPT } from '../../prompts/data_edit/sort_data.prompt';
import { USE_FORMULA_PROMPT } from '../../prompts/data_edit/use_formula.prompt';
import { VALUE_CHANGE_SYSTEM_PROMPT, VALUE_CHANGE_HUMAN_PROMPT } from '../../prompts/data_edit/value_change.prompt';
import { ChatPromptTemplate, HumanMessagePromptTemplate, SystemMessagePromptTemplate } from '@langchain/core/prompts';

export function createApplyStyleRunnable(model: BaseChatModel): Runnable {
  const prompt = PromptTemplate.fromTemplate(APPLY_STYLE_PROMPT);

  const parser = new JsonOutputParser();

  return prompt.pipe(model).pipe(parser);
}

export function createSortDataRunnable(model: BaseChatModel): Runnable {
  const prompt = PromptTemplate.fromTemplate(SORT_DATA_PROMPT);

  const parser = new JsonOutputParser();

  return prompt.pipe(model).pipe(parser);
}


export function createUseFormulaRunnable(model: BaseChatModel): Runnable {
  const prompt = PromptTemplate.fromTemplate(USE_FORMULA_PROMPT);

  const parser = new JsonOutputParser();

  return prompt.pipe(model).pipe(parser);
}


export function createValueChangeRunnable(model: BaseChatModel): Runnable {
  const systemValueChangeMessage = SystemMessagePromptTemplate.fromTemplate(VALUE_CHANGE_SYSTEM_PROMPT);
  const humanValueChangeMessage = HumanMessagePromptTemplate.fromTemplate(VALUE_CHANGE_HUMAN_PROMPT);

  const prompt = ChatPromptTemplate.fromMessages([
    systemValueChangeMessage,
    humanValueChangeMessage
  ]);

  const parser = new JsonOutputParser();

  return prompt.pipe(model).pipe(parser);
}