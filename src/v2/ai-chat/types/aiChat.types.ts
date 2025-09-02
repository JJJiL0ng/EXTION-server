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
}

export interface aiChatApiRes {
    jobId: string;
    taskManagerOutput: TaskManagerOutput;
    dataEditChatRes: dataEditChatRes;
}
