import { Injectable, Logger } from '@nestjs/common';
import {
  ParsedSheetData,
  ParsedSheetStyle,
  SqlTableDefinition,
  TableInfo,
  CellData,
  SqlColumnDefinition,
  NamedStyle,
  SpreadWorkbook,
  SpreadSheet,
  isCellData,
  isSpreadWorkbook,
  isSpreadSheet,
  FULL_ROW_INDICATOR,
  FULL_COLUMN_INDICATOR,
  CellIndex,
  RowIndex,
  ColumnIndex,
  ParsingOptions,
  DEFAULT_PARSING_OPTIONS,
  ParameterizedInsert,
  NumberFormatOptions
} from './interface/table-data-json-parsing.interface';

@Injectable()
export class TableDataJsonParsingService {
  private readonly logger = new Logger(TableDataJsonParsingService.name);
  private readonly tableNameCache = new Map<string, string>();
  private readonly options: Required<ParsingOptions>;

  constructor(options?: ParsingOptions) {
    this.options = { ...DEFAULT_PARSING_OPTIONS, ...options };
  }

  /**
   * 시트의 데이터만 파싱하는 함수
   * @param workbook - 스프레드시트 워크북 데이터
   * @returns 파싱된 시트 데이터 배열
   * @throws 파싱 중 심각한 오류 발생 시 예외를 던질 수 있음
   */
  onlyDataParser(workbook: SpreadWorkbook): ParsedSheetData[] {
    const startTime = Date.now();
    const result: ParsedSheetData[] = [];

    try {
      // 타입 가드를 통한 안전한 검증
      if (!isSpreadWorkbook(workbook)) {
        this.logWarn('Invalid workbook format provided');
        return result;
      }

      const sheetNames = Object.keys(workbook.sheets);
      this.logDebug(`Processing ${sheetNames.length} sheets: ${sheetNames.join(', ')}`);

      // 각 시트별로 데이터 파싱
      for (const sheetName in workbook.sheets) {
        const sheet = workbook.sheets[sheetName];
        if (!isSpreadSheet(sheet)) {
          this.logWarn(`Skipping invalid sheet: ${sheetName}`);
          continue;
        }

        const parsedSheet = this.parseSheetData(sheetName, sheet);
        if (parsedSheet) {
          result.push(parsedSheet);
        }
      }

      const elapsedTime = Date.now() - startTime;
      this.logDebug(`Data parsing completed in ${elapsedTime}ms`);

      return result;
    } catch (error) {
      this.logger.error(`Error during data parsing: ${error.message}`, error.stack);
      throw new Error(`Failed to parse spreadsheet data: ${error.message}`);
    }
  }

  /**
   * 개별 시트 데이터 파싱 - 성능 최적화된 버전
   */
  private parseSheetData(sheetName: string, sheet: SpreadSheet): ParsedSheetData | null {
    const parsedSheet: ParsedSheetData = {
      sheetName,
      cells: [],
      tables: []
    };

    let cellCount = 0;

    // dataTable에서 셀 데이터 추출 - 최적화된 반복문 사용
    if (sheet.data?.dataTable) {
      const dataTable = sheet.data.dataTable;

      // Object.entries() 대신 for...in + 타입 변환 최적화
      for (const rowIndexStr in dataTable) {
        const rowNum = +rowIndexStr; // parseInt() 대신 + 연산자 사용
        if (isNaN(rowNum)) continue;

        const rowData = dataTable[rowIndexStr];
        if (!rowData || typeof rowData !== 'object') {
          continue;
        }

        for (const colIndexStr in rowData) {
          const colNum = +colIndexStr;
          if (isNaN(colNum)) continue;

          const cellData = rowData[colIndexStr];
          if (!isCellData(cellData)) {
            continue;
          }

          if (cellData.value !== undefined || cellData.formula !== undefined) {
            parsedSheet.cells.push({
              row: rowNum,
              col: colNum,
              value: cellData.value,
              formula: cellData.formula
            });
            cellCount++;
          }
        }
      }
    }

    // 테이블 정보 추출
    if (sheet.tables && Array.isArray(sheet.tables)) {
      for (const table of sheet.tables) {
        if (!table || typeof table !== 'object' || !table.name) {
          this.logWarn(`Skipping invalid table in sheet: ${sheetName}`);
          continue;
        }

        parsedSheet.tables?.push({
          name: table.name,
          startRow: table.row || 0,
          startCol: table.col || 0,
          endRow: (table.row || 0) + (table.rowCount || 1) - 1,
          endCol: (table.col || 0) + (table.colCount || 1) - 1,
          columns: Array.isArray(table.columns) ? table.columns : []
        });
      }
    }

    // 셀 정렬 (성능 최적화를 위해 한 번만 정렬)
    if (parsedSheet.cells.length > 0) {
      parsedSheet.cells.sort((a, b) => {
        if (a.row !== b.row) return a.row - b.row;
        return a.col - b.col;
      });
    }

    this.logDebug(`Parsed sheet '${sheetName}': ${cellCount} cells, ${parsedSheet.tables?.length || 0} tables`);
    return parsedSheet;
  }

  /**
   * 시트의 스타일만 파싱하는 함수
   */
  onlyStyleParser(workbook: SpreadWorkbook): ParsedSheetStyle[] {
    const result: ParsedSheetStyle[] = [];

    try {
      if (!isSpreadWorkbook(workbook)) {
        this.logWarn('Invalid workbook format for style parsing');
        return result;
      }

      // 각 시트별로 스타일 파싱
      for (const sheetName in workbook.sheets) {
        const sheet = workbook.sheets[sheetName];
        if (!isSpreadSheet(sheet)) {
          continue;
        }

        const parsedStyle: ParsedSheetStyle = {
          sheetName,
          cellStyles: [],
          namedStyles: [],
          tableStyles: []
        };

        // 셀 스타일 추출 - 최적화된 반복문
        if (sheet.data?.dataTable) {
          for (const rowIndexStr in sheet.data.dataTable) {
            const rowNum = +rowIndexStr;
            if (isNaN(rowNum)) continue;

            const rowData = sheet.data.dataTable[rowIndexStr];
            if (!rowData || typeof rowData !== 'object') {
              continue;
            }

            for (const colIndexStr in rowData) {
              const colNum = +colIndexStr;
              if (isNaN(colNum)) continue;

              const cellData = rowData[colIndexStr];
              if (!isCellData(cellData) || !cellData.style) {
                continue;
              }

              parsedStyle.cellStyles.push({
                row: rowNum,
                col: colNum,
                style: this.expandStyle(cellData.style, workbook.namedStyles || [])
              });
            }
          }
        }

        // 행 스타일 추출
        if (sheet.data?.rowDataArray) {
          sheet.data.rowDataArray.forEach((rowStyle, index) => {
            if (rowStyle?.style) {
              parsedStyle.cellStyles.push({
                row: index,
                col: FULL_COLUMN_INDICATOR,
                style: this.expandStyle(rowStyle.style, workbook.namedStyles || [])
              });
            }
          });
        }

        // 열 스타일 추출
        if (sheet.data?.columnDataArray) {
          sheet.data.columnDataArray.forEach((colStyle, index) => {
            if (colStyle?.style) {
              parsedStyle.cellStyles.push({
                row: FULL_ROW_INDICATOR,
                col: index,
                style: this.expandStyle(colStyle.style, workbook.namedStyles || [])
              });
            }
          });
        }

        // 스타일 정렬
        parsedStyle.cellStyles.sort((a, b) => {
          if (a.row !== b.row) return a.row - b.row;
          return a.col - b.col;
        });

        result.push(parsedStyle);
      }

      // 전역 스타일 정보 추가
      if (result.length > 0 && workbook.namedStyles) {
        result[0].namedStyles = workbook.namedStyles;
      }
      if (result.length > 0 && workbook.tableStyles) {
        result[0].tableStyles = workbook.tableStyles;
      }

      return result;
    } catch (error) {
      this.logger.error(`Error during style parsing: ${error.message}`, error.stack);
      throw new Error(`Failed to parse spreadsheet styles: ${error.message}`);
    }
  }

  /**
   * 시트의 데이터와 스타일을 모두 sql 문으로 파싱하는 함수 
   * todo: 
            🚫 현재 구조의 한계점
            1. SQL 생성만 가능, 실행 불가

            현재: SqlTableDefinition[] 문자열만 반환
            필요: 실제 DB 연결 및 실행 엔진

            2. 일방향 변환만 지원

            현재: SpreadJS → SQL만 가능
            필요: SQL 쿼리 결과 → SpreadJS 역변환

            3. 인메모리 데이터 처리 없음

            현재: 파일 → SQL 변환 후 종료
            필요: 실시간 쿼리 실행 환경
   */
  sqlVersionParser(workbook: SpreadWorkbook): SqlTableDefinition[] {
    const result: SqlTableDefinition[] = [];

    try {
      if (!isSpreadWorkbook(workbook)) {
        this.logWarn('Invalid workbook format for SQL parsing');
        return result;
      }

      const parsedData = this.onlyDataParser(workbook);
      const parsedStyles = this.onlyStyleParser(workbook);

      // 각 시트별로 SQL 생성
      for (const sheetData of parsedData) {
        const styleData = parsedStyles.find(s => s.sheetName === sheetData.sheetName);

        // 테이블이 있는 경우 테이블 기반 SQL 생성
        if (sheetData.tables && sheetData.tables.length > 0) {
          for (const table of sheetData.tables) {
            const tableDefinition = this.generateTableSQL(table, sheetData, styleData);
            result.push(tableDefinition);
          }
        } else {
          // 테이블이 없는 경우 일반 시트 데이터 SQL 생성
          const tableName = this.getUniqueTableName(sheetData.sheetName);
          const sheetDefinition = this.generateSheetSQL(tableName, sheetData, styleData);
          result.push(sheetDefinition);
        }
      }

      return result;
    } catch (error) {
      this.logger.error(`Error during SQL generation: ${error.message}`, error.stack);
      throw new Error(`Failed to generate SQL: ${error.message}`);
    }
  }

  /**
   * 스타일 참조를 실제 스타일로 확장
   */
  private expandStyle(style: any, namedStyles: any[]): any {
    if (typeof style === 'string' && style.startsWith('__builtIn')) {
      // named style 참조인 경우
      const namedStyle = namedStyles?.find(s => s.name === style);
      if (namedStyle) {
        return namedStyle;
      }
    }
    return style;
  }

  /**
   * 정밀한 숫자 문자열 변환 - 지수 표기 방지
   */
  private formatNumberPrecisely(value: number, options?: NumberFormatOptions): string {
    if (!isFinite(value) || isNaN(value)) {
      return 'NULL';
    }

    const opts = {
      maxFractionDigits: 15,
      useExponential: false,
      preservePrecision: true,
      ...options
    };

    try {
      // 지수 표기를 방지하기 위한 정밀한 변환
      if (Math.abs(value) < 1e-15) {
        return '0';
      }

      // 매우 큰 수나 작은 수의 경우 특별 처리
      if (Math.abs(value) >= 1e15) {
        // 정수인 경우 그대로 반환
        if (Number.isInteger(value)) {
          return value.toFixed(0);
        }
        // 소수인 경우 최대 정밀도로 처리
        return value.toPrecision(15);
      }

      // 일반적인 경우: 소수점 자릿수 계산
      const valueStr = value.toString();
      if (valueStr.includes('e') || valueStr.includes('E')) {
        // 이미 지수 표기인 경우 고정 소수점으로 변환
        const parts = valueStr.toLowerCase().split('e');
        const mantissa = parseFloat(parts[0]);
        const exponent = parseInt(parts[1]);

        if (exponent >= 0) {
          return (mantissa * Math.pow(10, exponent)).toFixed(0);
        } else {
          return (mantissa * Math.pow(10, exponent)).toFixed(Math.abs(exponent));
        }
      }

      // 소수점이 있는 경우
      const decimalIndex = valueStr.indexOf('.');
      if (decimalIndex !== -1) {
        const fractionalPart = valueStr.substring(decimalIndex + 1);
        const significantDigits = Math.min(fractionalPart.length, opts.maxFractionDigits);
        return value.toFixed(significantDigits);
      }

      // 정수인 경우
      return value.toFixed(0);
    } catch (error) {
      this.logWarn(`Error formatting number ${value}: ${error.message}`);
      return value.toString();
    }
  }

  /**
   * 테이블명 중복 방지 및 길이 제한 보장
   */
  private getUniqueTableName(name: string): string {
    let baseName = this.sanitizeTableName(name);

    // 기본 이름이 길이 제한을 초과하면 미리 자르기
    const maxLength = this.options.maxTableNameLength;
    if (baseName.length > maxLength - 10) { // 여유분 확보
      baseName = baseName.substring(0, maxLength - 10);
    }

    if (!this.tableNameCache.has(baseName)) {
      this.tableNameCache.set(baseName, baseName);
      return baseName;
    }

    // 중복인 경우 _2, _3 등을 붙여서 유니크하게 만듦
    let counter = 2;
    let uniqueName = `${baseName}_${counter}`;

    while (this.tableNameCache.has(uniqueName)) {
      counter++;
      uniqueName = `${baseName}_${counter}`;

      // 길이 제한 체크
      if (uniqueName.length > maxLength) {
        const suffix = `_${counter}`;
        baseName = baseName.substring(0, maxLength - suffix.length);
        uniqueName = `${baseName}${suffix}`;
      }
    }

    // 최종 길이 체크 및 자르기
    if (uniqueName.length > maxLength) {
      uniqueName = uniqueName.substring(0, maxLength);
    }

    this.tableNameCache.set(uniqueName, uniqueName);
    return uniqueName;
  }

  /**
   * 테이블명 정제 (SQL 호환)
   */
  private sanitizeTableName(name: string): string {
    return name.replace(/[^a-zA-Z0-9가-힣_]/g, '_')
      .replace(/^[0-9]/, '_$&') // 숫자로 시작하는 경우 _ 추가
      .substring(0, this.options.maxTableNameLength); // 설정된 최대 길이
  }

  /**
   * 로깅 레벨에 따른 디버그 로그
   */
  private logDebug(message: string): void {
    if (this.options.logLevel === 'verbose' || this.options.logLevel === 'debug') {
      // 프로덕션 환경에서는 로그 억제
      if (process.env.NODE_ENV !== 'production') {
        this.logger.debug(message);
      }
    }
  }

  /**
   * 경고 로그
   */
  private logWarn(message: string): void {
    if (this.options.logLevel !== 'error') {
      this.logger.warn(message);
    }
  }

  /**
   * 대용량 데이터 처리를 위한 배치 INSERT 생성 - 파라미터 바인딩 지원
   * @param tableName - 테이블명
   * @param columns - 컬럼 정보
   * @param rows - 행 데이터
   * @param batchSize - 배치 크기
   */
  private generateBatchInserts(
    tableName: string,
    columns: SqlColumnDefinition[],
    rows: any[][],
    batchSize?: number
  ): string[] {
    const statements: string[] = [];
    const actualBatchSize = batchSize || this.options.batchSize;

    try {
      for (let i = 0; i < rows.length; i += actualBatchSize) {
        const batch = rows.slice(i, i + actualBatchSize);
        const values = batch
          .map(row => `(${row.map(v => this.formatSQLValue(v)).join(', ')})`)
          .join(',\n  ');

        const statement = `INSERT INTO ${tableName} (${columns.map(c => c.name).join(', ')}) VALUES\n  ${values};`;
        statements.push(statement);
      }
    } catch (error) {
      this.logger.error(`Error generating batch inserts: ${error.message}`);
      // 개별 INSERT로 폴백
      return rows.map(row =>
        `INSERT INTO ${tableName} (${columns.map(c => c.name).join(', ')}) VALUES (${row.map(v => this.formatSQLValue(v)).join(', ')});`
      );
    }

    return statements;
  }

  /**
   * 파라미터 바인딩을 사용한 안전한 배치 INSERT 생성
   * @param tableName - 테이블명
   * @param columns - 컬럼 정보
   * @param rows - 행 데이터
   * @param batchSize - 배치 크기
   */
  private generateParameterizedInserts(
    tableName: string,
    columns: SqlColumnDefinition[],
    rows: any[][],
    batchSize?: number
  ): ParameterizedInsert[] {
    const results: ParameterizedInsert[] = [];
    const actualBatchSize = batchSize || this.options.batchSize;

    try {
      for (let i = 0; i < rows.length; i += actualBatchSize) {
        const batch = rows.slice(i, i + actualBatchSize);

        // 플레이스홀더 생성 (?, ?, ?)
        const placeholders = columns.map(() => '?').join(', ');
        const valuesPlaceholders = batch.map(() => `(${placeholders})`).join(', ');

        const query = `INSERT INTO ${tableName} (${columns.map(c => c.name).join(', ')}) VALUES ${valuesPlaceholders}`;

        // 파라미터 배열 평탄화
        const parameters: any[] = [];
        for (const row of batch) {
          for (const value of row) {
            parameters.push(this.sanitizeParameterValue(value));
          }
        }

        results.push({
          query,
          parameters: [parameters] // 배치이므로 하나의 배열로
        });
      }
    } catch (error) {
      this.logger.error(`Error generating parameterized inserts: ${error.message}`);
      // 폴백으로 개별 INSERT 생성
      return rows.map(row => ({
        query: `INSERT INTO ${tableName} (${columns.map(c => c.name).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
        parameters: [row.map(v => this.sanitizeParameterValue(v))]
      }));
    }

    return results;
  }

  /**
   * 파라미터 바인딩용 값 정제
   */
  private sanitizeParameterValue(value: any): any {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'number') {
      if (isNaN(value) || !isFinite(value)) {
        return null;
      }
      return value;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      return value; // DB 드라이버가 이스케이프 처리
    }

    // 기타 타입은 JSON 문자열로 변환
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  /**
   * 테이블 기반 SQL 생성 - 파라미터 바인딩 옵션 지원
   */
  private generateTableSQL(
    table: TableInfo,
    sheetData: ParsedSheetData,
    styleData?: ParsedSheetStyle
  ): SqlTableDefinition {
    const tableName = this.getUniqueTableName(table.name);

    // 성능 최적화: 셀 데이터를 Map으로 변환
    const cellMap = new Map<CellIndex, any>();
    for (const cell of sheetData.cells) {
      cellMap.set(`${cell.row}_${cell.col}`, cell.value);
    }

    const columns: SqlColumnDefinition[] = table.columns.map(col => {
      const columnType = this.inferColumnTypeAdvanced(table, col.id, cellMap);
      return {
        name: this.sanitizeTableName(col.name || `col_${col.id}`),
        ...columnType
      };
    });

    // CREATE TABLE 문 생성
    const createTableStatement = `CREATE TABLE IF NOT EXISTS ${tableName} (
  id INT PRIMARY KEY AUTO_INCREMENT,
${columns.map(col => this.formatColumnDefinition(col)).join(',\n')},
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`;

    // 데이터 행 수집
    const rows: any[][] = [];
    for (let row = table.startRow + 1; row <= table.endRow; row++) {
      const rowData: any[] = [];

      for (let col = table.startCol; col <= table.endCol; col++) {
        const cellValue = cellMap.get(`${row}_${col}`);
        rowData.push(cellValue);
      }

      // 푸터 행 제외 (보통 마지막 행)
      const isFooterRow = row === table.endRow && table.columns.some(col => col.footerFormula);
      if (!isFooterRow && rowData.some(v => v !== null && v !== undefined)) {
        rows.push(rowData);
      }
    }

    const result: SqlTableDefinition = { createTableStatement, insertStatements: [] };

    // 파라미터 바인딩 사용 여부에 따라 다른 방식 적용
    if (this.options.useParameterizedQueries) {
      result.parameterizedInserts = this.generateParameterizedInserts(tableName, columns, rows);
      // 호환성을 위해 기존 방식도 제공
      result.insertStatements = this.generateBatchInserts(tableName, columns, rows);
    } else {
      result.insertStatements = this.generateBatchInserts(tableName, columns, rows);
    }

    return result;
  }

  /**
   * 일반 시트 데이터 SQL 생성 - 파라미터 바인딩 옵션 지원
   */
  private generateSheetSQL(
    tableName: string,
    sheetData: ParsedSheetData,
    styleData?: ParsedSheetStyle
  ): SqlTableDefinition {
    // 열 범위 결정
    const maxCol = Math.max(...sheetData.cells.map(c => c.col));
    const columns: SqlColumnDefinition[] = Array.from({ length: maxCol + 1 }, (_, i) => ({
      name: `col_${i}`,
      type: 'TEXT'
    }));

    // CREATE TABLE 문 생성
    const createTableStatement = `CREATE TABLE IF NOT EXISTS ${tableName} (
  row_id INT PRIMARY KEY,
${columns.map(col => this.formatColumnDefinition(col)).join(',\n')},
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`;

    // 행별로 데이터 그룹화
    const rowMap = new Map<number, any[]>();
    for (const cell of sheetData.cells) {
      if (!rowMap.has(cell.row)) {
        rowMap.set(cell.row, Array(maxCol + 1).fill(null));
      }
      rowMap.get(cell.row)![cell.col] = cell.value;
    }

    // 데이터 행 수집
    const rows: any[][] = [];
    for (const [rowIndex, rowData] of rowMap) {
      if (rowData.some(v => v !== null && v !== undefined)) {
        rows.push([rowIndex, ...rowData]);
      }
    }

    const result: SqlTableDefinition = { createTableStatement, insertStatements: [] };

    // row_id 포함한 컬럼 정의
    const extendedColumns = [{ name: 'row_id', type: 'INT' as const }, ...columns];

    // 파라미터 바인딩 사용 여부에 따라 다른 방식 적용
    if (this.options.useParameterizedQueries) {
      result.parameterizedInserts = this.generateParameterizedInserts(tableName, extendedColumns, rows);
      // 호환성을 위해 기존 방식도 제공
      result.insertStatements = this.generateBatchInserts(tableName, extendedColumns, rows);
    } else {
      result.insertStatements = this.generateBatchInserts(tableName, extendedColumns, rows);
    }

    return result;
  }

  /**
   * 고급 열 데이터 타입 추론 - DECIMAL 정밀도 동적 계산
   */
  private inferColumnTypeAdvanced(
    table: TableInfo,
    columnId: number,
    cellMap: Map<CellIndex, any>
  ): Pick<SqlColumnDefinition, 'type' | 'precision' | 'scale'> {
    const columnIndex = table.columns.findIndex(col => col.id === columnId);
    if (columnIndex === -1) return { type: 'TEXT' };

    const col = table.startCol + columnIndex;
    const values: any[] = [];

    try {
      // 해당 열의 데이터 수집
      for (let row = table.startRow + 1; row <= table.endRow; row++) {
        const cellValue = cellMap.get(`${row}_${col}`);
        if (cellValue !== undefined && cellValue !== null) {
          values.push(cellValue);
        }
      }

      if (values.length === 0) {
        return { type: 'TEXT' };
      }

      // 모든 값이 정수인지 확인
      if (values.every(v => typeof v === 'number' && Number.isInteger(v) && !isNaN(v))) {
        return { type: 'INT' };
      }

      // 모든 값이 숫자인지 확인 - 정밀도 동적 계산
      if (values.every(v => typeof v === 'number' && !isNaN(v))) {
        const { precision, scale } = this.calculateDecimalPrecision(values);
        return { type: 'DECIMAL', precision, scale };
      }

      // 모든 값이 불린인지 확인
      if (values.every(v => typeof v === 'boolean')) {
        return { type: 'BOOLEAN' };
      }

      // 문자열 길이 기반으로 TEXT vs VARCHAR 결정
      const maxLength = Math.max(...values
        .filter(v => v != null)
        .map(v => v.toString().length));

      if (maxLength > 255) {
        return { type: 'TEXT' };
      } else {
        return { type: 'VARCHAR(255)' };
      }
    } catch (error) {
      this.logWarn(`Error inferring column type for column ${columnId}: ${error.message}`);
      return { type: 'TEXT' };
    }
  }

  /**
   * DECIMAL 타입의 정밀도와 스케일 계산
   */
  private calculateDecimalPrecision(values: number[]): { precision: number; scale: number } {
    let maxIntegerDigits = 0;
    let maxDecimalDigits = 0;

    for (const value of values) {
      const valueStr = Math.abs(value).toString();
      const parts = valueStr.split('.');

      const integerDigits = parts[0].length;
      const decimalDigits = parts[1] ? parts[1].length : 0;

      maxIntegerDigits = Math.max(maxIntegerDigits, integerDigits);
      maxDecimalDigits = Math.max(maxDecimalDigits, decimalDigits);
    }

    // MySQL 최대 정밀도는 65, 스케일은 30
    const precision = Math.min(maxIntegerDigits + maxDecimalDigits, 65);
    const scale = Math.min(maxDecimalDigits, 30);

    return { precision: Math.max(precision, 1), scale };
  }

  /**
   * 컬럼 정의 포맷팅
   */
  private formatColumnDefinition(col: SqlColumnDefinition): string {
    if (col.type === 'DECIMAL' && col.precision && col.scale !== undefined) {
      return `  ${col.name} DECIMAL(${col.precision},${col.scale})`;
    }
    return `  ${col.name} ${col.type}`;
  }

  /**
   * SQL 값 포맷팅 - 보안 강화 및 성능 최적화
   */
  private formatSQLValue(value: any): string {
    try {
      if (value === null || value === undefined) {
        return 'NULL';
      }

      if (typeof value === 'string') {
        // SQL 인젝션 방지를 위한 더 안전한 이스케이프
        const escaped = value
          .replace(/\\/g, '\\\\')  // 백슬래시 이스케이프
          .replace(/'/g, "''")     // 싱글 쿼트 이스케이프
          .replace(/"/g, '""')     // 더블 쿼트 이스케이프 (일부 DB에서 필요)
          .replace(/\x00/g, '\\0') // NULL 바이트 제거
          .replace(/\n/g, '\\n')   // 개행 문자 이스케이프
          .replace(/\r/g, '\\r')   // 캐리지 리턴 이스케이프
          .replace(/\x1a/g, '\\Z'); // Ctrl+Z 이스케이프

        return `'${escaped}'`;
      }

      if (typeof value === 'boolean') {
        return value ? '1' : '0';
      }

      if (typeof value === 'number') {
        if (isNaN(value) || !isFinite(value)) {
          this.logWarn(`Invalid number value encountered: ${value}`);
          return 'NULL';
        }
        return this.formatNumberPrecisely(value);
      }

      // 기타 타입은 JSON으로 직렬화 후 문자열로 처리
      const jsonString = JSON.stringify(value);
      return this.formatSQLValue(jsonString);
    } catch (error) {
      this.logWarn(`Error formatting SQL value: ${error.message}`);
      return 'NULL';
    }
  }
}