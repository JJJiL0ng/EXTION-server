export interface dataEditChatRes {
    dataEditCommands: dataEditCommand[];
}

export interface dataEditCommand {
    //command maker에서 command + detailedCommand + range로 spreadjs 명령어 생성 할 예정 spreadjs 명령어 예시: sheet.setFormula(1, 1, '=SUM(A1,C3)');
    // sheetIndex: number; // 적용시킬 시트가 몇번인지
    sheetName: string;
    commandType: dataEditCommandType; // 예시: 'use_formula'
    range: string; //범위. 예시 (1,3) or (1,24,22,42)
    detailedCommand: string | StyleCommand; //스타일관련 명령어의 경우 styleCommand를 사용함
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

interface StyleCommand {
    method: "style_object" | "direct_method"; // named_style 제거
    properties: StyleProperties;
}

interface StyleProperties {
    // 색상 관련
    backColor?: string;
    foreColor?: string;
    
    // 글꼴 관련
    font?: string;
    fontFamily?: string;
    fontSize?: string;
    fontStyle?: string;
    fontWeight?: string;
    
    // 정렬 관련
    hAlign?: "left" | "center" | "right" | "fill" | "justify";
    vAlign?: "top" | "center" | "bottom" | "justify";
    textIndent?: number;
    textOrientation?: number;
    isVerticalText?: boolean;
    
    // 테두리 관련
    borderLeft?: BorderInfo;
    borderTop?: BorderInfo;
    borderRight?: BorderInfo;
    borderBottom?: BorderInfo;
    diagonalDown?: BorderInfo;
    diagonalUp?: BorderInfo;
    
    // 텍스트 표시 관련
    wordWrap?: boolean;
    shrinkToFit?: boolean;
    showEllipsis?: boolean;
    textDecoration?: "none" | "underline" | "overline" | "lineThrough";
    
    // 보호 관련
    locked?: boolean;
    hidden?: boolean;
    
    // 기타
    formatter?: string;
    backgroundImage?: string;
    cellPadding?: string;
    watermark?: string;
}

interface BorderInfo {
    color: string;
    style: "empty" | "thin" | "medium" | "thick" | "double" | "dotted" | "dashed";
}