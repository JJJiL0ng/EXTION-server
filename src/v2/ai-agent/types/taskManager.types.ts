enum Intent {
  DATA_EDIT = 'data_edit',
  DATA_ANALYSIS = 'data_analysis',
  GENERAL_HELP = 'general_help',
  COMPLEX_TASK = 'complex_task', //위의 세가지 의도가 복합적으로 섞여있는 경우
}

enum TaskType {
  //data_edit의 하위 tasks
  VALUE_CHANGE = 'value_change',
  USE_FORMULA = 'use_formula',
  CONTROL_SHEET = 'control_sheet',
  SORT_DATA = 'sort_data',
  APPLY_STYLE = 'apply_style',
  FILTER_DATA = 'filter_data',
  SUMMARY_EDIT_HISTORY = 'summary_edit_history',

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
  taskType: TaskType;
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