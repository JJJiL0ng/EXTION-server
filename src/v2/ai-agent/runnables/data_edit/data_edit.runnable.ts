import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { PromptTemplate } from '@langchain/core/prompts';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { Runnable } from '@langchain/core/runnables';
import { APPLY_STYLE_SYSTEM_PROMPT } from '../../prompts/data_edit/style/apply_style.prompt';
import { SORT_DATA_SYSTEM_PROMPT } from '../../prompts/data_edit/sort/sort_data.prompt';
import { USE_FORMULA_SYSTEM_PROMPT } from '../../prompts/data_edit/formula/use_formula.prompt';
import { VALUE_CHANGE_SYSTEM_PROMPT } from '../../prompts/data_edit/value/value_change.prompt';
import { ChatPromptTemplate, HumanMessagePromptTemplate, SystemMessagePromptTemplate } from '@langchain/core/prompts';
import { COMMON_HUMAN_PROMPT } from '../../prompts/data_edit/common_human.prompt';

export function createApplyStyleRunnable(model: BaseChatModel): Runnable {
  const systemApplyStyleMessage = SystemMessagePromptTemplate.fromTemplate(APPLY_STYLE_SYSTEM_PROMPT);
  const humanApplyStyleMessage = HumanMessagePromptTemplate.fromTemplate(COMMON_HUMAN_PROMPT);

  const prompt = ChatPromptTemplate.fromMessages([
    systemApplyStyleMessage,
    humanApplyStyleMessage
  ]);
  const parser = new JsonOutputParser();

  return prompt.pipe(model).pipe(parser);
}

export function createSortDataRunnable(model: BaseChatModel): Runnable {
  const systemSortDataMessage = SystemMessagePromptTemplate.fromTemplate(SORT_DATA_SYSTEM_PROMPT);
  const humanSortDataMessage = HumanMessagePromptTemplate.fromTemplate(COMMON_HUMAN_PROMPT);

  const prompt = ChatPromptTemplate.fromMessages([
    systemSortDataMessage,
    humanSortDataMessage
  ]);
  const parser = new JsonOutputParser();

  return prompt.pipe(model).pipe(parser);
}


export function createUseFormulaRunnable(model: BaseChatModel): Runnable {
  const systemUseFormulaMessage = SystemMessagePromptTemplate.fromTemplate(USE_FORMULA_SYSTEM_PROMPT);
  const humanUseFormulaMessage = HumanMessagePromptTemplate.fromTemplate(COMMON_HUMAN_PROMPT);

  const prompt = ChatPromptTemplate.fromMessages([
    systemUseFormulaMessage,
    humanUseFormulaMessage
  ]);
  const parser = new JsonOutputParser();

  return prompt.pipe(model).pipe(parser);
}


export function createValueChangeRunnable(model: BaseChatModel): Runnable {
  const systemValueChangeMessage = SystemMessagePromptTemplate.fromTemplate(VALUE_CHANGE_SYSTEM_PROMPT);
  const humanValueChangeMessage = HumanMessagePromptTemplate.fromTemplate(COMMON_HUMAN_PROMPT);

  const prompt = ChatPromptTemplate.fromMessages([
    systemValueChangeMessage,
    humanValueChangeMessage
  ]);

  const parser = new JsonOutputParser();

  return prompt.pipe(model).pipe(parser);
}