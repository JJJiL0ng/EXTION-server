export class SheetTableDataDto {
  id: string;
  name: string;
  index: number;
  data: any;
  createdAt: Date;
  updatedAt: Date;
}

export class SheetMetaDataWithTablesDto {
  id: string;
  fileName: string;
  originalFileName?: string;
  fileSize?: number;
  fileType?: string;
  activeSheetIndex: number;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  sheetTableData: SheetTableDataDto[];
}

export class MessageDto {
  id: string;
  content: string;
  timestamp: Date;
  role: 'USER' | 'EXTION_AI' | 'SYSTEM';
  type: 'TEXT' | 'FILE_UPLOAD' | 'FORMULA' | 'VISUALIZATION' | 'DATA_GENERATION' | 'FUNCTION' | 'DATA_EDIT';
  mode?: 'NORMAL' | 'FORMULA' | 'VISUALIZATION' | 'DATA_GENERATION' | 'DATA_FIX' | 'DATA_EDIT' | 'FUNCTION';
  sheetContext?: any;
  formulaData?: any;
  artifactData?: any;
  dataChangeInfo?: any;
  fileUploadInfo?: any;
  metadata?: any;
}

export class ChatDto {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  status: 'ACTIVE' | 'ARCHIVED' | 'DELETED';
  analytics?: any;
  userId: string;
  messages: MessageDto[];
}

export class ChatSheetDataResponseDto {
  chatId: string;
  chat?: ChatDto;
  sheetMetaData?: SheetMetaDataWithTablesDto;
}