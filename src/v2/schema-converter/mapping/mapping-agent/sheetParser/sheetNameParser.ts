import { createSafeError } from '../../../../sheet/types/spreadsheet.types';
import { Logger } from '@nestjs/common';

export interface SheetNameParserOptions {
  logger?: Logger;
}

export interface SheetNameParserResult {
  sheets: Record<string, any>;
  foundSheetCount: number;
  requestedSheetCount: number;
}

/**
 * 시트의 dataTable을 LLM이 읽기 좋은 형식으로 변환
 * @param dataTable 변환할 dataTable
 * @returns LLM 친화적 형식의 데이터
 */
function convertDataTableToLLMFormat(dataTable: Record<string, any>): Record<string, any> {
  try {
    if (!dataTable || typeof dataTable !== 'object') {
      return {};
    }

    // 행 번호 추출 (숫자 키만)
    const rowNumbers = Object.keys(dataTable)
      .map(k => parseInt(k, 10))
      .filter(n => !isNaN(n))
      .sort((a, b) => a - b);

    if (rowNumbers.length === 0) {
      return {};
    }

    // 첫 행을 헤더로 사용
    const headerRowNumber = rowNumbers[0];
    const headerRow = dataTable[headerRowNumber];

    if (!headerRow) {
      return {};
    }

    // 열 번호 추출 (숫자 키만)
    const columnNumbers = Object.keys(headerRow)
      .map(k => parseInt(k, 10))
      .filter(n => !isNaN(n))
      .sort((a, b) => a - b);

    // 헤더 추출
    const headers: Array<{ name: string; location: string }> = [];
    for (const colIdx of columnNumbers) {
      const headerCell = headerRow[colIdx];
      if (!headerCell) continue;

      const headerValue = headerCell.value;

      // value가 객체인 경우 (richText 포함) text 또는 value 속성 사용
      let headerName: string;
      if (typeof headerValue === 'object' && headerValue !== null) {
        headerName =
          (headerValue as any).text ||
          (headerValue as any).value ||
          `Column${colIdx}`;
      } else {
        headerName = String(headerValue || `Column${colIdx}`);
      }

      headers.push({
        name: headerName,
        location: `R${headerRowNumber}C${colIdx}`,
      });
    }

    // 데이터 행 변환
    const rows: Array<Record<string, any>> = [];

    for (let i = 1; i < rowNumbers.length; i++) {
      const rowIdx = rowNumbers[i];
      const row = dataTable[rowIdx];

      if (!row) continue;

      const rowData: Record<string, any> = {
        location: `R${rowIdx}`,
        cells: {},
      };

      for (let colPos = 0; colPos < columnNumbers.length; colPos++) {
        const colIdx = columnNumbers[colPos];
        const cell = row[colIdx];

        if (!cell) {
          // 빈 셀도 표시
          const headerName = headers[colPos]?.name || `Column${colIdx}`;
          rowData.cells[`${headerName}(C${colIdx})`] = null;
          continue;
        }

        const headerName = headers[colPos]?.name || `Column${colIdx}`;

        // value 추출 (다양한 형태 처리)
        let cellValue: any;
        if (typeof cell.value === 'object' && cell.value !== null) {
          // richText 객체인 경우
          cellValue = (cell.value as any).value || (cell.value as any).text || '';
        } else {
          cellValue = cell.value;
        }

        rowData.cells[`${headerName}(C${colIdx})`] = cellValue;
      }

      rows.push(rowData);
    }

    return {
      headers,
      rows,
      metadata: {
        totalRows: rows.length,
        totalColumns: headers.length,
      },
    };
  } catch (error) {
    throw new Error(`Failed to convert dataTable to LLM format: ${error.message}`);
  }
}

/**
 * 스프레드시트 데이터에서 특정 시트들을 필터링하고 LLM 친화적 형식으로 변환
 * @param parsedSheetNames 파싱할 시트 이름 배열
 * @param newVersionSpreadSheetData 스프레드시트 전체 데이터
 * @param options logger 등의 옵션
 * @returns 필터링된 시트들을 LLM 포맷으로 변환한 결과 또는 null
 */
export async function sheetNameParser(
  parsedSheetNames: string[],
  newVersionSpreadSheetData: Record<string, any>,
  options?: SheetNameParserOptions,
): Promise<Record<string, any> | null> {
  const logger = options?.logger;

  if (!newVersionSpreadSheetData) {
    logger?.warn(`[sheetNameParser] newVersionSpreadSheetData is null or undefined`);
    return null;
  }

  try {
    const rawData = newVersionSpreadSheetData;

    // sheets 데이터 접근
    const sheets = rawData.sheets;

    if (!sheets || typeof sheets !== 'object') {
      logger?.warn(
        `[sheetNameParser] No sheets found. Available keys: ${Object.keys(rawData).join(', ')}`,
      );
      return null;
    }

    const availableSheets = Object.keys(sheets);

    // 특정 시트 필터링
    let targetSheetNames: string[] = [];

    if (parsedSheetNames && parsedSheetNames.length > 0) {
      // 요청한 시트 중 실제 존재하는 것들만 필터링
      targetSheetNames = parsedSheetNames.filter(name => {
        if (!sheets[name]) {
          logger?.warn(
            `[sheetNameParser] Sheet '${name}' not found. Available: ${availableSheets.join(', ')}`,
          );
          return false;
        }
        return true;
      });

      if (targetSheetNames.length === 0) {
        logger?.warn(`[sheetNameParser] None of the requested sheets were found`);
        return null;
      }

      logger?.log(
        `[sheetNameParser] Found ${targetSheetNames.length}/${parsedSheetNames.length} requested sheets`,
      );
    } else {
      // 모든 시트 사용
      targetSheetNames = availableSheets;
      logger?.log(`[sheetNameParser] Processing all ${availableSheets.length} sheets`);
    }

    // 각 시트를 LLM 포맷으로 변환
    const llmFormattedSheets: Record<string, any> = {};

    for (const sheetName of targetSheetNames) {
      try {
        const sheetData = sheets[sheetName];
        const dataTable = sheetData?.data?.dataTable;

        if (!dataTable || typeof dataTable !== 'object') {
          logger?.warn(
            `[sheetNameParser] No valid dataTable found in sheet '${sheetName}', skipping`,
          );
          llmFormattedSheets[sheetName] = null;
          continue;
        }

        const converted = convertDataTableToLLMFormat(dataTable);
        llmFormattedSheets[sheetName] = converted;
        logger?.log(
          `[sheetNameParser] Successfully converted sheet '${sheetName}' (rows: ${converted.metadata?.totalRows}, columns: ${converted.metadata?.totalColumns})`,
        );
      } catch (error) {
        const err = error as Error;
        logger?.error(
          `[sheetNameParser] Failed to convert sheet '${sheetName}': ${err.message}`,
        );
        llmFormattedSheets[sheetName] = null;
      }
    }

    return llmFormattedSheets;
  } catch (error) {
    const safeError = createSafeError(error);
    logger?.error(`[sheetNameParser] Failed to parse: ${safeError.message}`, safeError.details);
    return null;
  }
}