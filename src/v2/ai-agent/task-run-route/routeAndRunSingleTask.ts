import {
    createApplyStyleRunnable,
    createSortDataRunnable,
    createValueChangeRunnable,
    createUseFormulaRunnable,
} from '../runnables/data_edit/data_edit.runnable';

import { Task, TaskType } from '../types/taskManager.types';
import { dataEditChatRes, dataEditCommandType } from '../types/dataEdit.types';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Runnable } from '@langchain/core/runnables';

interface TaskRouterInput {
    /** 실행할 단일 Task */
    task: Task;
    /** LLM 모델 인스턴스 (예: AiAgentService에서 주입) */
    model: BaseChatModel;
    /** 프롬프트에 사용할 사용자 질문 */
    question: string;
    /** 프롬프트에 사용할 데이터 컨텍스트(문자열 또는 객체) */
    dataContext: string | Record<string, unknown>;
}

type TaskRouterOutput = dataEditChatRes;

/**
 * 단일 Task를 받아 taskType에 따라 해당 러너블을 실행하고 결과(JSON)를 반환합니다.
 * - 현재는 data_edit 계열(dataEditCommandType)에 대해서만 지원합니다.
 * - prompts는 {question, dataContext} 변수를 요구하므로 함께 전달해야 합니다.
 */
export async function routeAndRunSingleTask(
    input: TaskRouterInput,
): Promise<TaskRouterOutput> {
    const { task, model, question } = input;
    const dataContext =
        typeof input.dataContext === 'string'
            ? input.dataContext
            : JSON.stringify(input.dataContext ?? {}, null, 2);

    if (!task || !task.taskType) {
        throw new Error('Invalid task: task or taskType is missing');
    }
    if (!model) {
        throw new Error('Model instance is required to run the task');
    }

    let runnable: Runnable | null = null;

    switch (task.taskType) {
        // data_edit 하위 타입들 처리
        case dataEditCommandType.VALUE_CHANGE:
            runnable = createValueChangeRunnable(model);
            break;
        case dataEditCommandType.USE_FORMULA:
            runnable = createUseFormulaRunnable(model);
            break;
        case dataEditCommandType.SORT_DATA:
            runnable = createSortDataRunnable(model);
            break;
        case dataEditCommandType.APPLY_STYLE:
            runnable = createApplyStyleRunnable(model);
            break;

        // 아직 미지원/미구현 타입들 명시적 처리
        case dataEditCommandType.CONTROL_SHEET:
        case dataEditCommandType.SUMMARY_EDIT_HISTORY:
            throw new Error(`Unsupported data_edit taskType: ${String(task.taskType)}`);

        // data_edit 이외의 상위 TaskType에 대한 가드 (추후 확장 포인트)
        case TaskType.ANALYZE_TRENDS:
        case TaskType.FULL_DATA_INSIGHT_DISCOVERY:
        case TaskType.PROVIDE_HELP_ARTICLE:
            throw new Error(`This router currently supports only data_edit task types. Received: ${String(task.taskType)}`);

        default:
            // 런타임에서 string 리터럴이 들어올 수 있으니 안전 가드
            throw new Error(`Unknown taskType: ${String(task.taskType)}`);
    }

    // 선택된 러너블 실행
    const result = await runnable!.invoke({ question, dataContext });
    // 결과는 dataEditChatRes 형태를 기대함({ dataEditCommands: [...] })
    return result as TaskRouterOutput;
}