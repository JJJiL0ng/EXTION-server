import { TaskManagerOutput } from "src/v2/ai-agent/types/taskManager.types";
import { dataEditChatRes } from "src/v2/ai-agent/types/dataEdit.types";

export interface aiChatApiReq {
    websocketClientId: string; // 소켓 연결을 위한 클라이언트 ID
    spreadsheetId: string;
    chatId: string;
    userId: string;
    chatMode: 'agent' | 'edit';
    userQuestionMessage: string;
    parsedSheetNames: string[];
    jobId: string;
    spreadsheetVersionNumber: number; // 특정 버전을 지정하여 시트 데이터를 꺼내오기 위함
    newVersionSpreadSheetData?: Record<string, any>; // Optional: 새 버전의 데이터(변경사항이 있을시에만 프론트에서 보내줄 예정)
}

export interface aiChatApiRes {
    jobId: string;
    taskManagerOutput: TaskManagerOutput;
    dataEditChatRes: dataEditChatRes;
    spreadsheetVersionNumber: number;
}
