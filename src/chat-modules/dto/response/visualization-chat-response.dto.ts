import { BaseResponseDto } from './base-response.dto';
import { SpreadsheetMetadataDto } from '../common/spreadsheet-metadata.dto';

export class ExplanationDto {
  korean: string;
}

export class VisualizationChatDataDto {
  code: string;
  type: 'chart' | 'table' | 'analysis';
  title: string;
  explanation: ExplanationDto;
  spreadsheetMetadata?: SpreadsheetMetadataDto;
}

export class VisualizationChatResponseDto extends BaseResponseDto {
  chatType: 'visualization-chat' = 'visualization-chat';
  data: VisualizationChatDataDto;
}