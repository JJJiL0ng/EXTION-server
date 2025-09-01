export interface dataEditChatRes {
    dataEditCommands: dataEditCommand[];
}

export interface dataEditCommand {
    //command maker에서 command + detailedCommand + range로 spreadjs 명령어 생성 할 예정 spreadjs 명령어 예시: sheet.setFormula(1, 1, '=SUM(A1,C3)');
    sheetIndex: number; // 적용시킬 시트가 몇번인지
    commandType: dataEditCommandType; // 예시: 'use_formula'
    range: string; //범위. 예시 (1,3) or (1,24,22,42)
    detailedCommand: string; // 세부 명령어. 예시: '=SUM(B1:B10)'
}

export enum dataEditCommandType {
    VALUE_CHANGE = 'value_change',
    USE_FORMULA = 'use_formula',
    CONTROL_SHEET = 'control_sheet',
    SORT_DATA = 'sort_data',
    APPLY_STYLE = 'apply_style',
    FILTER_DATA = 'filter_data',
    SUMMARY_EDIT_HISTORY = 'summary_edit_history',
}
