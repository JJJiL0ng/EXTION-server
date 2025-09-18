import { TaskManagerOutput } from "src/v2/ai-agent/types/taskManager.types";
import { dataEditChatRes } from "src/v2/ai-agent/types/dataEdit.types";

//=========================================================
// 기본 AI Chat API 요청/응답 타입
//=========================================================
export interface aiChatApiReq {
  websocketClientId: string; // 소켓 연결을 위한 클라이언트 ID
  spreadsheetId: string;
  chatId: string;
  chatSessionId: string | null; // 특정 채팅 세션을 구분하기 위한 ID (새로운 대화 시작시마다 변경) 처음 입력시에만 null 가능 이때는 백앤드에서 생성함
  userId: string;
  chatMode: 'agent' | 'edit';
  userQuestionMessage: string;
  parsedSheetNames: string[];
  jobId: string;
  spreadSheetVersionId: string; // Optional: 특정 버전 ID (없을 시 최신 버전 사용)
  newVersionSpreadSheetData?: Record<string, any>; // Optional: 새 버전의 데이터(변경사항이 있을시에만 프론트에서 보내줄 예정)
  editLockVersion?: number; // Optional: 낙관적 잠금을 위한 버전 번호
}

export interface aiChatApiRes {
  jobId: string;
  chatSessionId: string; // 응답에 chatSessionId 포함
  taskManagerOutput: TaskManagerOutput;
  dataEditChatRes: dataEditChatRes;
  spreadSheetVersionId: string; // 새로 생성된 버전 ID 
  editLockVersion: number; // Optional: 낙관적 잠금을 위한 버전 번호 (없을 시 최신 버전 사용)
}

//=========================================================
// llm api context용 필터링된 시트 데이터 반환 타입, 채팅 히스토리 타입
//=========================================================
export interface filteredSheetReturns {
  [sheetName: string]: any;
}

export interface PreviousMessages {
  chatId: string;
  messages: PreviousChatMessage[];
}

export interface UserPreviousMessage {
  role: 'user';
  userQuestionMessage: string;
}

export interface AiPreviousMessage {
  role: 'assistant';
  aiChatRes: aiChatApiRes;
}
export type PreviousChatMessage = UserPreviousMessage | AiPreviousMessage;

// 전체 히스토리 (시간순 배열)
export type ChatHistory = PreviousChatMessage[];

//=========================================================
// 클라이언트용 채팅 히스토리 불러오기 요청 및 응답 타입 (content만 반환, 전체 메시지 반환 x)
//=========================================================
export interface loadChatHistoryReq {
  chatId: string;
  userId: string;
}

export interface loadChatHistoryRes {
  wholeChatHistory: previousMessagesContent[];
}

export interface previousMessagesContent {
  role: 'user' | 'assistant';
  content: string;
}

