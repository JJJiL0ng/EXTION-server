import { BaseResponseDto } from './base-response.dto';
import { FunctionDetailsDto } from '../common/function-details.dto';

export class FunctionChatDataDto {
  explanation: string;
  functionDetails: FunctionDetailsDto;
}

export class FunctionChatResponseDto extends BaseResponseDto {
  chatType: 'function-chat' = 'function-chat';
  data: FunctionChatDataDto;
}