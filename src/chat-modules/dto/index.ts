// 요청 DTO
export * from './request/orchestrator-chat-request.dto';

// 공통 DTO
export * from './common/spreadsheet-metadata.dto';
export * from './common/edited-data.dto';
export * from './common/function-details.dto';

// 응답 DTO
import { GeneralChatResponseDto } from './response/general-chat-response.dto';
import { FunctionChatResponseDto } from './response/function-chat-response.dto';
import { EditChatResponseDto } from './response/edit-chat-response.dto';
import { GenerateChatResponseDto } from './response/generate-chat-response.dto';
import { VisualizationChatResponseDto } from './response/visualization-chat-response.dto';
import { BaseResponseDto } from './response/base-response.dto';

export * from './response/base-response.dto';
export * from './response/general-chat-response.dto';
export * from './response/function-chat-response.dto';
export * from './response/edit-chat-response.dto';
export * from './response/generate-chat-response.dto';
export * from './response/visualization-chat-response.dto';

// 통합 응답 타입
export type OrchestratorChatResponseDto = 
  | GeneralChatResponseDto
  | FunctionChatResponseDto
  | EditChatResponseDto
  | GenerateChatResponseDto
  | VisualizationChatResponseDto
  | BaseResponseDto; // 에러 응답용