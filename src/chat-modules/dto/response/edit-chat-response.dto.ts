import { BaseResponseDto } from './base-response.dto';
import { EditedDataDto } from '../common/edited-data.dto';
import { SpreadsheetMetadataDto } from '../common/spreadsheet-metadata.dto';

export class ChangesDto {
  type: 'sort' | 'filter' | 'modify' | 'transform';
  details: string;
}

export class EditChatDataDto {
  editedData: EditedDataDto;
  sheetIndex: number;
  explanation: string;
  changes: ChangesDto;
  spreadsheetMetadata?: SpreadsheetMetadataDto;
}

export class EditChatResponseDto extends BaseResponseDto {
  chatType: 'edit-chat' = 'edit-chat';
  data: EditChatDataDto;
} 