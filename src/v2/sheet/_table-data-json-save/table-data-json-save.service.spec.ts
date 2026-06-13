import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { TableDataJsonSaveService } from './table-data-json-save.service';
import {
  createPrismaServiceMock,
  mockPrismaTransaction,
  PrismaServiceMock,
} from '../../../../test/prisma-service.mock';
import { UserService } from '../../user/user.service';

describe('TableDataJsonSaveService', () => {
  let service: TableDataJsonSaveService;
  let prisma: PrismaServiceMock;
  let userService: jest.Mocked<Pick<UserService, 'validateUser'>>;

  beforeEach(() => {
    prisma = createPrismaServiceMock();
    mockPrismaTransaction(prisma);
    userService = {
      validateUser: jest.fn().mockResolvedValue(undefined),
    };
    service = new TableDataJsonSaveService(
      prisma,
      userService as unknown as UserService,
    );
  });

  it('creates a spreadsheet with an initial version and chat container', async () => {
    const updatedAt = new Date('2026-06-14T00:00:00.000Z');
    prisma.spreadSheet.create.mockResolvedValue({
      id: 'sheet-1',
      fileName: '매출.xlsx',
      updatedAt,
      editLockVersion: 1,
    });
    prisma.spreadSheetVersionData.create.mockResolvedValue({
      id: 'version-1',
    });
    prisma.spreadSheet.update.mockResolvedValue({});
    prisma.chat.create.mockResolvedValue({ id: 'chat-1' });

    await expect(
      service.createSpreadSheet({
        fileName: '매출.xlsx',
        spreadsheetId: 'sheet-1',
        chatId: 'chat-1',
        userId: 'user-1',
        jsonData: { sheets: { Sheet1: {} } },
      }),
    ).resolves.toEqual({
      spreadSheetId: 'sheet-1',
      fileName: '매출.xlsx',
      headVersionId: 'version-1',
      lastModified: updatedAt,
      editLockVersion: 1,
    });
    expect(userService.validateUser).toHaveBeenCalledWith('user-1');
    expect(prisma.spreadSheetVersionData.create).toHaveBeenCalledWith({
      data: {
        spreadSheetId: 'sheet-1',
        parentId: null,
        authorId: 'user-1',
        name: null,
        data: { sheets: { Sheet1: {} } },
      },
    });
    expect(prisma.spreadSheet.update).toHaveBeenCalledWith({
      where: { id: 'sheet-1' },
      data: { headVersionId: 'version-1' },
    });
    expect(prisma.chat.create).toHaveBeenCalledWith({
      data: {
        id: 'chat-1',
        spreadSheetId: 'sheet-1',
        userId: 'user-1',
      },
    });
  });

  it('adds a child version and increments editLockVersion with optimistic locking', async () => {
    const updatedAt = new Date('2026-06-14T00:00:00.000Z');
    prisma.spreadSheet.findFirst.mockResolvedValue({
      id: 'sheet-1',
      fileName: '매출.xlsx',
      headVersionId: 'version-1',
    });
    prisma.spreadSheetVersionData.create.mockResolvedValue({
      id: 'version-2',
    });
    prisma.spreadSheet.update.mockResolvedValue({
      id: 'sheet-1',
      fileName: '매출.xlsx',
      updatedAt,
      editLockVersion: 4,
    });

    await expect(
      service.addNewVersionSpreadSheetData({
        spreadSheetId: 'sheet-1',
        userId: 'user-1',
        headVersionId: 'version-1',
        editLockVersion: 3,
        jsonData: { sheets: { Sheet1: { data: 'changed' } } },
      }),
    ).resolves.toMatchObject({
      spreadSheetId: 'sheet-1',
      headVersionId: 'version-2',
      editLockVersion: 4,
    });
    expect(prisma.spreadSheetVersionData.create).toHaveBeenCalledWith({
      data: {
        spreadSheetId: 'sheet-1',
        parentId: 'version-1',
        authorId: 'user-1',
        name: null,
        data: { sheets: { Sheet1: { data: 'changed' } } },
      },
    });
    expect(prisma.spreadSheet.update).toHaveBeenCalledWith({
      where: {
        id: 'sheet-1',
        editLockVersion: 3,
      },
      data: {
        headVersionId: 'version-2',
        editLockVersion: {
          increment: 1,
        },
      },
    });
  });

  it('maps a stale editLockVersion update to ConflictException', async () => {
    prisma.spreadSheet.findFirst.mockResolvedValue({
      id: 'sheet-1',
      headVersionId: 'version-1',
    });
    prisma.spreadSheetVersionData.create.mockResolvedValue({ id: 'version-2' });
    prisma.spreadSheet.update.mockRejectedValue({ code: 'P2025' });

    await expect(
      service.addNewVersionSpreadSheetData({
        spreadSheetId: 'sheet-1',
        userId: 'user-1',
        headVersionId: 'version-1',
        editLockVersion: 2,
        jsonData: { sheets: {} },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('loads the requested version data after ownership validation', async () => {
    prisma.spreadSheet.findFirst.mockResolvedValue({
      id: 'sheet-1',
      headVersionId: 'head-version',
    });
    prisma.spreadSheetVersionData.findUnique.mockResolvedValue({
      data: { sheets: { Sheet1: { rowCount: 1 } } },
    });

    await expect(
      service.loadWholeTableDataJson('sheet-1', 'user-1', 'version-2'),
    ).resolves.toEqual({ sheets: { Sheet1: { rowCount: 1 } } });
    expect(prisma.spreadSheetVersionData.findUnique).toHaveBeenCalledWith({
      where: { id: 'version-2' },
      select: { data: true },
    });
  });

  it('rejects rename when the spreadsheet is missing or owned by another user', async () => {
    prisma.spreadSheet.findFirst.mockResolvedValue(null);

    await expect(
      service.renameFileName('sheet-1', 'user-1', '새 이름.xlsx'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.spreadSheet.update).not.toHaveBeenCalled();
  });

  it('renames a spreadsheet after ownership validation', async () => {
    prisma.spreadSheet.findFirst.mockResolvedValue({
      id: 'sheet-1',
      fileName: '기존.xlsx',
    });
    prisma.spreadSheet.update.mockResolvedValue({});

    await expect(
      service.renameFileName('sheet-1', 'user-1', '새 이름.xlsx'),
    ).resolves.toBeUndefined();
    expect(prisma.spreadSheet.update).toHaveBeenCalledWith({
      where: { id: 'sheet-1' },
      data: {
        fileName: '새 이름.xlsx',
        updatedAt: expect.any(Date),
      },
    });
  });
});
