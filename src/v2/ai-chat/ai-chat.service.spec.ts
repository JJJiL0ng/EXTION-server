import { AiAgentService } from '../ai-agent/ai-agent.service';
import { AiChatService } from './ai-chat.service';
import { AiChatBranchService } from './services/ai-chat-branch.service';
import { AiChatMessageService } from './services/ai-chat-message.service';
import { AiChatSpreadsheetContextService } from './services/ai-chat-spreadsheet-context.service';

describe('AiChatService', () => {
  let service: AiChatService;
  let aiAgentService: jest.Mocked<Pick<AiAgentService, 'runTaskManager' | 'runSingleTask'>>;
  let spreadsheetContextService: jest.Mocked<Pick<AiChatSpreadsheetContextService, 'loadParsedSpreadsheetData'>>;

  beforeEach(() => {
    aiAgentService = {
      runTaskManager: jest.fn(),
      runSingleTask: jest.fn(),
    };
    spreadsheetContextService = {
      loadParsedSpreadsheetData: jest.fn(),
    };

    service = new AiChatService(
      aiAgentService as unknown as AiAgentService,
      spreadsheetContextService as unknown as AiChatSpreadsheetContextService,
      {} as AiChatMessageService,
      {} as AiChatBranchService,
    );
  });

  it('plans tasks through AiAgentService without changing the response shape', async () => {
    const plan = { reason: 'plan', tasks: [] };
    aiAgentService.runTaskManager.mockResolvedValue(plan as any);

    await expect(
      service.planTasks(
        { userQuestionMessage: '정렬해줘' } as any,
        { Sheet1: [] },
        [],
      ),
    ).resolves.toEqual({ plan });
    expect(aiAgentService.runTaskManager).toHaveBeenCalledWith(
      '정렬해줘',
      { Sheet1: [] },
      [],
    );
  });

  it('runs planned tasks with the selected AI model', async () => {
    aiAgentService.runSingleTask
      .mockResolvedValueOnce({ command: 'first' } as any)
      .mockResolvedValueOnce({ command: 'second' } as any);

    await expect(
      service.runPlannedTasks(
        {
          userQuestionMessage: '값 바꿔줘',
          aiModel: 'Extion small',
        } as any,
        {
          tasks: [{ intent: 'VALUE_CHANGE' }, { intent: 'STYLE' }],
        } as any,
        { Sheet1: [] },
        [],
      ),
    ).resolves.toEqual({
      results: [{ command: 'first' }, { command: 'second' }],
    });
    expect(aiAgentService.runSingleTask).toHaveBeenCalledTimes(2);
    expect(aiAgentService.runSingleTask).toHaveBeenNthCalledWith(
      1,
      [],
      { intent: 'VALUE_CHANGE' },
      '값 바꿔줘',
      { Sheet1: [] },
      'Extion small',
    );
  });

  it('delegates spreadsheet context loading to the context service', async () => {
    spreadsheetContextService.loadParsedSpreadsheetData.mockResolvedValue({
      Sheet1: [{ value: 1 }],
    });

    await expect(
      service.loadParsedSpreadsheetData('sheet-1', ['Sheet1'], 'user-1', 'version-1'),
    ).resolves.toEqual({ Sheet1: [{ value: 1 }] });
    expect(spreadsheetContextService.loadParsedSpreadsheetData).toHaveBeenCalledWith(
      'sheet-1',
      ['Sheet1'],
      'user-1',
      'version-1',
    );
  });
});
