import { TaskManagerOutput } from "src/v2/ai-agent/types/taskManager.types";
import { dataEditChatRes } from "src/v2/ai-agent/types/dataEdit.types";

export interface aiChatApiReq {
    spreadsheetId: string;
    chatId: string;
    userId: string;
    userQuestionMessage: string;
}

export interface aiChatApiRes {
    taskManagerOutput: TaskManagerOutput;
    
    dataEditChatRes?: dataEditChatRes;
    
}
