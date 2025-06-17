import { BaseResponseDto } from './base-response.dto';
import { SpreadsheetMetadataDto } from '../common/spreadsheet-metadata.dto';

export class GeneralChatDataDto {
  message: string;
  spreadsheetMetadata?: SpreadsheetMetadataDto;
}

export class GeneralChatResponseDto extends BaseResponseDto {
  chatType: 'general-chat' = 'general-chat';
  data: GeneralChatDataDto;
}