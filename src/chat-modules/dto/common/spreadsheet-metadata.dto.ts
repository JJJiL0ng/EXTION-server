export class SpreadsheetMetadataDto {
    hasSpreadsheet: boolean;
    fileName?: string;
    totalSheets?: number;
    activeSheetIndex?: number;
    sheetNames?: string[];
  }