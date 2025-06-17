import { BaseResponseDto } from './base-response.dto';
import { EditedDataDto } from '../common/edited-data.dto';

export class ChangeLogDto {
  action: string;
  details: string;
}

export class GenerateChatDataDto {
  editedData: EditedDataDto;
  sheetIndex: number | null;
  explanation: string;
  changeLog: ChangeLogDto[];
  spreadsheetId: string;
}

export class GenerateChatResponseDto extends BaseResponseDto {
  chatType: 'generate-chat' = 'generate-chat';
  data: GenerateChatDataDto;
}