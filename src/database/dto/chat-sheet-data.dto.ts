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

export class ChatSheetDataResponseDto {
  chatId: string;
  sheetMetaData?: SheetMetaDataWithTablesDto;
} 