import { IsString, IsBoolean, IsOptional, IsArray, IsUUID } from 'class-validator';

export class ProcessChatRequest {
  @IsUUID()
  chatId: string;

  @IsString()
  userId: string;

  @IsArray()
  files: any[];

  @IsString()
  message: string;

  @IsBoolean()
  webSearchEnabled: boolean;

  @IsOptional()
  @IsArray()
  fileNames?: string[];

  @IsOptional()
  @IsArray()
  fileSizes?: string[];
}

// chat-sheet와 동일한 구조로 수정
export class TableGenerateSheetTableDataDto {
  id: string;
  name: string;
  index: number;
  data: any;
  createdAt: Date;
  updatedAt: Date;
}

export class TableGenerateSheetMetaDataDto {
  id: string;
  fileName: string;
  originalFileName?: string;
  fileSize?: number;
  fileType?: string;
  activeSheetIndex: number;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  sheetTableData: TableGenerateSheetTableDataDto[];
}

// 엑셀 렌더링용 응답 DTO (메시지 제외)
export class ProcessChatResponse {
  chatId: string;
  sheetMetaData?: TableGenerateSheetMetaDataDto;
  success?: boolean;  // 성공 여부 표시
  error?: string;     // 에러 메시지
  message?: string;   // 추가 메시지
  processingTime?: number; // 처리 시간 정보
}

// 내부 처리용 DTO (기존 유지)
export class GeneratedSheetData {
  name: string;
  index: number;
  data: any[][];
}

export class TableGenerationResult {
  sheets: GeneratedSheetData[];
  fileName: string;
  originalFileName?: string;
  fileSize?: number;
  fileType?: string;
  activeSheetIndex: number;
}
