import { UserContextDto } from '../common/user-context.dto';

export class BaseResponseDto {
  success: boolean;
  chatType: 'general-chat' | 'function-chat' | 'edit-chat' | 'generate-chat' | 'visualization-chat' | null;
  chatId?: string;
  userMessageId?: string;
  aiMessageId?: string;
  timestamp: string;
  userContext?: UserContextDto; // 사용자 국가/언어 컨텍스트
  error?: string;
}