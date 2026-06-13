import { AiChatBranchService } from './ai-chat-branch.service';
import {
  createPrismaServiceMock,
  mockPrismaTransaction,
  PrismaServiceMock,
} from '../../../../test/prisma-service.mock';

describe('AiChatBranchService', () => {
  let service: AiChatBranchService;
  let prisma: PrismaServiceMock;

  beforeEach(() => {
    prisma = createPrismaServiceMock();
    mockPrismaTransaction(prisma);
    service = new AiChatBranchService(prisma);
  });

  it('rolls back to the parent branch and increments spreadsheet editLockVersion', async () => {
    prisma.chatSessionBranch.findUnique
      .mockResolvedValueOnce({
        parentBranchId: 'parent-branch',
        chatSessionId: 'session-1',
      })
      .mockResolvedValueOnce({
        id: 'parent-branch',
        spreadSheetVersionId: 'version-before-message',
      });
    prisma.chatSession.update.mockResolvedValue({});
    prisma.spreadSheet.update.mockResolvedValue({ editLockVersion: 5 });

    await expect(
      service.rollPreviousMessage('sheet-1', 'session-1', 'current-branch'),
    ).resolves.toEqual({
      spreadSheetVersionId: 'version-before-message',
      lastestBranchID: 'parent-branch',
      editLockVersion: 5,
    });
    expect(prisma.chatSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { latestBranchId: 'parent-branch' },
    });
    expect(prisma.spreadSheet.update).toHaveBeenCalledWith({
      where: { id: 'sheet-1' },
      data: { editLockVersion: { increment: 1 } },
      select: { editLockVersion: true },
    });
  });

  it('rejects rollback when the current branch has no parent', async () => {
    prisma.chatSessionBranch.findUnique.mockResolvedValueOnce({
      parentBranchId: null,
      chatSessionId: 'session-1',
    });

    await expect(
      service.rollPreviousMessage('sheet-1', 'session-1', 'root-branch'),
    ).rejects.toThrow('has no parent branch');
  });
});
