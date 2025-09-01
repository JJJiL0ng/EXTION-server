import type { dataEditCommandType } from './dataEdit.types';

export enum Intent {
  DATA_EDIT = 'data_edit',
  DATA_ANALYSIS = 'data_analysis',
  GENERAL_HELP = 'general_help',
  COMPLEX_TASK = 'complex_task', //위의 세가지 의도가 복합적으로 섞여있는 경우
}


export enum TaskType {
  //data_edit의 하위 tasks
  // NOTE: data_edit 관련 세부 타입은 dataEditCommandType을 사용하세요.

  //data_analysis의 하위 tasks
  ANALYZE_TRENDS = 'analyze_trends',
  FULL_DATA_INSIGHT_DISCOVERY = 'full_data_insight_discovery',

  //data_general_help의 하위 tasks
  PROVIDE_HELP_ARTICLE = 'provide_help_article',
}

export interface Task {
  /** 각 작업의 고유 ID (예: "task_0") */
  taskId: string;
  /** 해당 작업의 종류 (TaskType Enum 값 중 하나) */
  // data_edit 의 경우 dataEditCommandType을, 그 외에는 TaskType을 사용합니다.
  taskType: TaskType | dataEditCommandType;
  /** 해당 작업에 대한 자연어 설명 (디버깅 및 후속 모듈 지침용) */
  description: string;
}

/**
 * AI Task Manager의 최종 JSON 출력 형식을 정의하는 인터페이스
 */
export interface TaskManagerOutput {
  /** 사용자 요청의 핵심 의도 (Intent Enum 값 중 하나) */
  intent: Intent;
  /** 사용자에게 보여줄 친절하고 간결한 작업 요약 문장 */
  reason: string;
  /** 요청을 완수하기 위해 필요한 작업들의 목록 */
  tasks: Task[];
}