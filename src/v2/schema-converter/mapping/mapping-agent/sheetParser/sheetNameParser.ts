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
 * 스프레드시트 데이터에서 특정 시트들을 필터링하는 유틸리티 함수
 * @param parsedSheetNames 파싱할 시트 이름 배열 (빈 배열이면 모든 시트 반환)
 * @param newVersionSpreadSheetData 스프레드시트 데이터
 * @param options logger 등의 옵션
 * @returns 필터링된 시트들 또는 null
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

    // 실제 데이터 구조에 따라 sheets 접근 경로 수정
    let sheets: any;

    if (rawData.spreadsheetData?.sheets) {
      sheets = rawData.spreadsheetData.sheets;
    } else if (rawData.sheets) {
      sheets = rawData.sheets;
    } else {
      logger?.warn(`[sheetNameParser] No sheets found. Available keys: ${Object.keys(rawData).join(', ')}`);
      return null;
    }

    const availableSheets = Object.keys(sheets);

    // 특정 시트 필터링 (있는 경우)
    if (parsedSheetNames && parsedSheetNames.length > 0) {
      const filteredSheets: { [sheetName: string]: any } = {};

      for (const sheetName of parsedSheetNames) {
        if (sheets[sheetName]) {
          filteredSheets[sheetName] = sheets[sheetName]; // 참조 복사 (얕은 복사)
        } else {
          logger?.warn(`[sheetNameParser] Sheet '${sheetName}' not found. Available: ${availableSheets.join(', ')}`);
        }
      }

      if (Object.keys(filteredSheets).length === 0) {
        logger?.warn(`[sheetNameParser] None of the requested sheets were found`);
        return null;
      }

      logger?.log(`[sheetNameParser] Filtered ${Object.keys(filteredSheets).length}/${parsedSheetNames.length} sheets`);
      return filteredSheets;
    } else {
      // 모든 시트 반환
      logger?.log(`[sheetNameParser] Returning all ${availableSheets.length} sheets`);
      return sheets;
    }
  } catch (error) {
    const safeError = createSafeError(error);
    logger?.error(`[sheetNameParser] Failed to parse: ${safeError.message}`, safeError.details);
    return null;
  }
}
