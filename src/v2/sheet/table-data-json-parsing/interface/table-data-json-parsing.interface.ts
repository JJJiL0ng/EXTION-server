export interface CellData {
  value?: any;
  formula?: string;
  style?: CellStyle | string; // named style reference
}

export interface CellStyle {
  font?: string;
  backColor?: string;
  foreColor?: string;
  width?: number;
  height?: number;
  borderStyle?: string;
  textAlign?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  [key: string]: any; // 추가적인 스타일 속성들을 위해
}

export interface ParsedCellData {
  row: number;
  col: number;
  value: any;
  formula?: string;
}

export interface ParsedStyleData {
  row: number;
  col: number;
  style: CellStyle;
}

export interface TableColumn {
  id: number;
  name?: string;
  footerFormula?: string;
}

export interface TableInfo {
  name: string;
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
  columns: TableColumn[];
}

export interface ParsedSheetData {
  sheetName: string;
  cells: ParsedCellData[];
  tables?: TableInfo[];
}

export interface NamedStyle extends CellStyle {
  name: string;
}

export interface TableStyle {
  name: string;
  borderStyle?: string;
  [key: string]: any;
}

export interface ParsedSheetStyle {
  sheetName: string;
  cellStyles: ParsedStyleData[];
  namedStyles?: NamedStyle[];
  tableStyles?: TableStyle[];
}

// SQL 관련 인터페이스 개선
export interface SqlTableDefinition {
  createTableStatement: string;
  insertStatements: string[];
  // 파라미터 바인딩을 위한 새로운 속성들
  parameterizedInserts?: ParameterizedInsert[];
}

export interface ParameterizedInsert {
  query: string;           // INSERT INTO table (col1, col2) VALUES (?, ?)
  parameters: any[][];     // 각 행의 파라미터 배열
}

export interface SqlColumnDefinition {
  name: string;
  type: 'INT' | 'VARCHAR(255)' | 'TEXT' | 'DECIMAL' | 'BOOLEAN';
  precision?: number; // DECIMAL의 전체 자릿수
  scale?: number;     // DECIMAL의 소수점 자릿수
}

// 설정 관련 인터페이스
export interface ParsingOptions {
  batchSize?: number;              // 기본값: 1000
  maxDecimalPrecision?: number;    // 기본값: 65
  maxDecimalScale?: number;        // 기본값: 30
  useParameterizedQueries?: boolean; // 기본값: true
  logLevel?: 'verbose' | 'debug' | 'warn' | 'error'; // 기본값: 'debug'
  maxTableNameLength?: number;     // 기본값: 64
}

// 새로 추가되는 인터페이스들
export interface SpreadSheetData {
  dataTable?: Record<string, Record<string, CellData>>;
  rowDataArray?: Array<{ style?: CellStyle } | null>;
  columnDataArray?: Array<{ style?: CellStyle } | null>;
}

export interface SpreadSheetTable {
  name: string;
  row: number;
  col: number;
  rowCount: number;
  colCount: number;
  columns?: TableColumn[];
}

export interface SpreadSheet {
  data?: SpreadSheetData;
  tables?: SpreadSheetTable[];
}

export interface SpreadWorkbook {
  version?: string;
  sheets: Record<string, SpreadSheet>;
  namedStyles?: NamedStyle[];
  tableStyles?: TableStyle[];
}

// 숫자 포맷팅을 위한 유틸리티
export interface NumberFormatOptions {
  maxFractionDigits?: number;
  useExponential?: boolean;
  preservePrecision?: boolean;
}

// 타입 가드 함수들
export function isCellData(obj: unknown): obj is CellData {
  return !!obj && 
         typeof obj === 'object' && 
         ('value' in obj || 'formula' in obj);
}

export function isSpreadSheet(obj: unknown): obj is SpreadSheet {
  return !!obj && typeof obj === 'object';
}

export function isSpreadWorkbook(obj: unknown): obj is SpreadWorkbook {
  return !!obj && 
         typeof obj === 'object' && 
         'sheets' in obj && 
         typeof (obj as any).sheets === 'object';
}

// 상수 정의
export const FULL_ROW_INDICATOR = -1;
export const FULL_COLUMN_INDICATOR = -1;

export type RowIndex = number;
export type ColumnIndex = number;
export type CellIndex = `${RowIndex}_${ColumnIndex}`;

// 기본 설정값
export const DEFAULT_PARSING_OPTIONS: Required<ParsingOptions> = {
  batchSize: 1000,
  maxDecimalPrecision: 65,
  maxDecimalScale: 30,
  useParameterizedQueries: true,
  logLevel: 'debug',
  maxTableNameLength: 64
};
  