import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TableDataJsonSaveService } from './table-data-json-save.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { UserService } from 'src/v2/user/user.service';
import { SpreadSheetStatus, DeltaAction } from '@prisma/client';
import {
  SpreadSheetStructure,
  CellDelta,
  ValidationError,
  DeltaValidationError,
  MemoryStateError,
  GPTReadyData,
} from './types/spreadsheet.types';
import { CreateSpreadSheetDto } from './dto/create-spread-sheet.dto';
import * as zlib from 'zlib';
import { createHash } from 'crypto';

// Mock 타입 정의
type MockPrismaService = {
  spreadSheet: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    [key: string]: any;
  };
  spreadSheetData: {
    create: jest.Mock;
    upsert: jest.Mock;
    [key: string]: any;
  };
  editHistory: {
    create: jest.Mock;
    [key: string]: any;
  };
  deltaRecord: {
    createMany: jest.Mock;
    [key: string]: any;
  };
  $transaction: jest.Mock;
  [key: string]: any;
};

type MockUserService = {
  validateUser: jest.Mock;
  validateChat: jest.Mock;
  [key: string]: any;
};

describe('TableDataJsonSaveService', () => {
  let service: TableDataJsonSaveService;
  let prismaService: MockPrismaService;
  let userService: MockUserService;

  // Mock data
  const mockUserId = 'test-user-id';
  const mockSpreadSheetId = 'test-spreadsheet-id';
  const mockChatId = 'test-chat-id';
  const mockFileName = 'test-spreadsheet.xlsx';

  const mockSpreadSheetStructure: SpreadSheetStructure = {
    version: '18.1.4',
    sheets: {
      Sheet1: {
        name: 'Sheet1',
        data: {
          dataTable: {
            A1: { value: 'Name' },
            B1: { value: 'Age' },
            A2: { value: 'John' },
            B2: { value: 25 },
          },
        },
      },
    },
  };

  const mockSpreadSheetData = {
    id: mockSpreadSheetId,
    fileName: mockFileName,
    fileSize: 1024,
    userId: mockUserId,
    chatId: mockChatId,
    version: 1,
    status: SpreadSheetStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastOpened: new Date(),
    data: {
      id: 'data-id',
      spreadSheetId: mockSpreadSheetId,
      compressedData: Buffer.from('compressed-data'),
      dataHash: 'hash-123',
      originalSize: 1024,
      compressedSize: 512,
      sheetCount: 1,
      version: '18.1.4',
      savedAt: new Date(),
    },
  };

  const mockCellDelta: CellDelta = {
    action: DeltaAction.SET_CELL_VALUE,
    sheetName: 'Sheet1',
    cellAddress: 'A1',
    value: 'Updated Value',
    timestamp: Date.now(),
  };

  beforeEach(async () => {
    const mockPrismaService: MockPrismaService = {
      spreadSheet: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      spreadSheetData: {
        create: jest.fn(),
        upsert: jest.fn(),
      },
      editHistory: {
        create: jest.fn(),
      },
      deltaRecord: {
        createMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const mockUserService: MockUserService = {
      validateUser: jest.fn(),
      validateChat: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TableDataJsonSaveService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
      ],
    }).compile();

    service = module.get<TableDataJsonSaveService>(TableDataJsonSaveService);
    prismaService = module.get(PrismaService) as MockPrismaService;
    userService = module.get(UserService) as MockUserService;

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('기본 서비스 초기화', () => {
    it('서비스가 정의되어야 한다', () => {
      expect(service).toBeDefined();
    });
  });

  describe('createSpreadSheet', () => {
    const createDto: CreateSpreadSheetDto = {
      fileName: mockFileName,
      userId: mockUserId,
      chatId: mockChatId,
    };

    it('새로운 스프레드시트를 성공적으로 생성해야 한다', async () => {
      // Arrange
      userService.validateUser.mockResolvedValue(undefined);
      userService.validateChat.mockResolvedValue(undefined);
      prismaService.spreadSheet.findFirst.mockResolvedValue(null); // 파일명 중복 없음

      const mockCreatedSpreadSheet = {
        ...mockSpreadSheetData,
        id: 'new-spreadsheet-id',
      };

      prismaService.$transaction.mockImplementation(async (callback) => {
        return await callback({
          spreadSheet: {
            create: jest.fn().mockResolvedValue(mockCreatedSpreadSheet),
          },
          spreadSheetData: {
            create: jest.fn().mockResolvedValue({}),
          },
          editHistory: {
            create: jest.fn().mockResolvedValue({}),
          },
        } as any);
      });

      // Act
      const result = await service.createSpreadSheet(createDto);

      // Assert
      expect(result).toEqual({
        id: 'new-spreadsheet-id',
        fileName: mockFileName,
        data: expect.any(Object),
        version: 1,
        lastModified: expect.any(Date),
      });
      expect(userService.validateUser).toHaveBeenCalledWith(mockUserId);
      expect(userService.validateChat).toHaveBeenCalledWith(mockChatId, mockUserId);
    });

    it('파일명이 중복되면 BadRequestException을 발생시켜야 한다', async () => {
      // Arrange
      userService.validateUser.mockResolvedValue(undefined);
      userService.validateChat.mockResolvedValue(undefined);
      prismaService.spreadSheet.findFirst.mockResolvedValue(mockSpreadSheetData);

      // Act & Assert
      await expect(service.createSpreadSheet(createDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('잘못된 초기 데이터로 ValidationError를 발생시켜야 한다', async () => {
      // Arrange
      const invalidDto = {
        ...createDto,
        initialData: { invalid: 'data' },
      };

      userService.validateUser.mockResolvedValue(undefined);
      userService.validateChat.mockResolvedValue(undefined);
      prismaService.spreadSheet.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(service.createSpreadSheet(invalidDto)).rejects.toThrow(
        ValidationError,
      );
    });
  });

  describe('loadSpreadSheet', () => {
    it('스프레드시트를 성공적으로 로드해야 한다', async () => {
      // Arrange
      userService.validateUser.mockResolvedValue(undefined);
      prismaService.spreadSheet.findFirst.mockResolvedValue(mockSpreadSheetData);

      // Mock compression/decompression
      const compressedData = zlib.gzipSync(JSON.stringify(mockSpreadSheetStructure));
      const mockDataWithCompression = {
        ...mockSpreadSheetData,
        data: {
          ...mockSpreadSheetData.data,
          compressedData: compressedData,
        },
      };

      prismaService.spreadSheet.findFirst.mockResolvedValue(mockDataWithCompression);
      prismaService.spreadSheet.update.mockResolvedValue(mockSpreadSheetData);

      // Act
      const result = await service.loadSpreadSheet(mockSpreadSheetId, mockUserId);

      // Assert
      expect(result).toEqual({
        id: mockSpreadSheetId,
        fileName: mockFileName,
        data: expect.any(Object),
        version: 1,
        lastModified: expect.any(Date),
      });
      expect(prismaService.spreadSheet.update).toHaveBeenCalledWith({
        where: { id: mockSpreadSheetId },
        data: { lastOpened: expect.any(Date) },
      });
    });

    it('존재하지 않는 스프레드시트에 대해 NotFoundException을 발생시켜야 한다', async () => {
      // Arrange
      userService.validateUser.mockResolvedValue(undefined);
      prismaService.spreadSheet.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.loadSpreadSheet(mockSpreadSheetId, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('applyDelta', () => {
    beforeEach(() => {
      // Setup active spreadsheet in memory
      service['activeSpreadSheet'] = {
        id: mockSpreadSheetId,
        userId: mockUserId,
        baselineData: mockSpreadSheetStructure,
        pendingDeltas: [],
        parsedCache: null,
        metadata: {
          version: 1,
          lastActivity: new Date(),
          saveScheduled: false,
          isDirty: false,
        },
      };
    });

    it('유효한 델타를 성공적으로 적용해야 한다', async () => {
      // Act
      const result = await service.applyDelta(mockUserId, mockCellDelta);

      // Assert
      expect(result).toEqual({
        success: true,
        version: 1,
      });
      expect(service['activeSpreadSheet']!.pendingDeltas).toHaveLength(1);
      expect(service['activeSpreadSheet']!.metadata.isDirty).toBe(true);
    });

    it('활성 스프레드시트가 없으면 MemoryStateError를 발생시켜야 한다', async () => {
      // Arrange
      service['activeSpreadSheet'] = null;

      // Act & Assert
      await expect(service.applyDelta(mockUserId, mockCellDelta)).rejects.toThrow(
        MemoryStateError,
      );
    });

    it('잘못된 델타에 대해 DeltaValidationError를 발생시켜야 한다', async () => {
      // Arrange
      const invalidDelta = {
        ...mockCellDelta,
        action: 'INVALID_ACTION' as any,
      };

      // Act & Assert
      await expect(service.applyDelta(mockUserId, invalidDelta)).rejects.toThrow(
        DeltaValidationError,
      );
    });
  });

  describe('getCurrentState', () => {
    beforeEach(() => {
      service['activeSpreadSheet'] = {
        id: mockSpreadSheetId,
        userId: mockUserId,
        baselineData: mockSpreadSheetStructure,
        pendingDeltas: [],
        parsedCache: null,
        metadata: {
          version: 1,
          lastActivity: new Date(),
          saveScheduled: false,
          isDirty: false,
        },
      };
    });

    it('현재 상태를 성공적으로 반환해야 한다', async () => {
      // Act
      const result = await service.getCurrentState(mockUserId);

      // Assert
      expect(result).toEqual(mockSpreadSheetStructure);
    });

    it('펜딩 델타가 있으면 적용된 상태를 반환해야 한다', async () => {
      // Arrange
      service['activeSpreadSheet']!.pendingDeltas = [mockCellDelta];

      // Act
      const result = await service.getCurrentState(mockUserId);

      // Assert
      expect(result).toBeDefined();
      expect(result.sheets.Sheet1.data.dataTable.A1.value).toBe('Updated Value');
    });

    it('활성 스프레드시트가 없으면 MemoryStateError를 발생시켜야 한다', async () => {
      // Arrange
      service['activeSpreadSheet'] = null;

      // Act & Assert
      await expect(service.getCurrentState(mockUserId)).rejects.toThrow(
        MemoryStateError,
      );
    });
  });

  describe('getGPTReadyData', () => {
    beforeEach(() => {
      service['activeSpreadSheet'] = {
        id: mockSpreadSheetId,
        userId: mockUserId,
        baselineData: mockSpreadSheetStructure,
        pendingDeltas: [],
        parsedCache: null,
        metadata: {
          version: 1,
          lastActivity: new Date(),
          saveScheduled: false,
          isDirty: false,
        },
      };
    });

    it('GPT용 데이터를 성공적으로 파싱해야 한다', async () => {
      // Act
      const result = await service.getGPTReadyData(mockUserId);

      // Assert
      expect(result).toEqual({
        sheets: expect.any(Map),
        totalCells: expect.any(Number),
        dataHash: expect.any(String),
        parsedAt: expect.any(Date),
      });
      expect(result.sheets.size).toBeGreaterThan(0);
    });

    it('캐시된 데이터가 있으면 캐시를 반환해야 한다', async () => {
      // Arrange
      const cachedData: GPTReadyData = {
        sheets: new Map([['Sheet1', { csvData: 'cached', cellCount: 2, metadata: { name: 'Sheet1', cellCount: 2 } }]]),
        totalCells: 2,
        dataHash: 'cached-hash',
        parsedAt: new Date(),
      };
      service['activeSpreadSheet']!.parsedCache = cachedData;

      // Act
      const result = await service.getGPTReadyData(mockUserId);

      // Assert
      expect(result).toBe(cachedData);
    });
  });

  describe('forceSave', () => {
    it('변경사항이 있으면 저장해야 한다', async () => {
      // Arrange
      service['activeSpreadSheet'] = {
        id: mockSpreadSheetId,
        userId: mockUserId,
        baselineData: mockSpreadSheetStructure,
        pendingDeltas: [mockCellDelta],
        parsedCache: null,
        metadata: {
          version: 1,
          lastActivity: new Date(),
          saveScheduled: false,
          isDirty: true,
        },
      };

      prismaService.$transaction.mockImplementation(async (callback) => {
        return await callback({
          spreadSheetData: {
            upsert: jest.fn().mockResolvedValue({}),
          },
          spreadSheet: {
            update: jest.fn().mockResolvedValue({}),
          },
          editHistory: {
            create: jest.fn().mockResolvedValue({ id: 'edit-history-id' }),
          },
          deltaRecord: {
            createMany: jest.fn().mockResolvedValue({}),
          },
        } as any);
      });

      // Act
      const result = await service.forceSave();

      // Assert
      expect(result).toEqual({
        success: true,
        savedDeltas: 1,
      });
      expect(service['activeSpreadSheet']!.metadata.isDirty).toBe(false);
    });

    it('변경사항이 없으면 저장하지 않고 성공을 반환해야 한다', async () => {
      // Arrange
      service['activeSpreadSheet'] = {
        id: mockSpreadSheetId,
        userId: mockUserId,
        baselineData: mockSpreadSheetStructure,
        pendingDeltas: [],
        parsedCache: null,
        metadata: {
          version: 1,
          lastActivity: new Date(),
          saveScheduled: false,
          isDirty: false,
        },
      };

      // Act
      const result = await service.forceSave();

      // Assert
      expect(result).toEqual({
        success: true,
        savedDeltas: 0,
      });
      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('getUserSpreadSheets', () => {
    it('사용자의 스프레드시트 목록을 반환해야 한다', async () => {
      // Arrange
      const mockSpreadSheets = [
        {
          ...mockSpreadSheetData,
          _count: { chats: 1, editHistory: 2 },
        },
      ];
      prismaService.spreadSheet.findMany.mockResolvedValue(mockSpreadSheets);

      // Act
      const result = await service.getUserSpreadSheets(mockUserId);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: mockSpreadSheetId,
        fileName: mockFileName,
        fileSize: 1024,
        version: 1,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
        lastOpened: expect.any(Date),
        sheetCount: 1,
        compressedSize: 512,
        chatCount: 1,
        editCount: 2,
        isActive: false,
      });
    });
  });

  describe('deleteSpreadSheet', () => {
    it('스프레드시트를 성공적으로 삭제해야 한다', async () => {
      // Arrange
      prismaService.spreadSheet.findFirst.mockResolvedValue(mockSpreadSheetData);
      prismaService.spreadSheet.update.mockResolvedValue(mockSpreadSheetData);

      // Act
      const result = await service.deleteSpreadSheet(mockSpreadSheetId, mockUserId);

      // Assert
      expect(result).toEqual({ success: true });
      expect(prismaService.spreadSheet.update).toHaveBeenCalledWith({
        where: { id: mockSpreadSheetId },
        data: {
          status: SpreadSheetStatus.DELETED,
          updatedAt: expect.any(Date),
        },
      });
    });

    it('존재하지 않는 스프레드시트에 대해 NotFoundException을 발생시켜야 한다', async () => {
      // Arrange
      prismaService.spreadSheet.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.deleteSpreadSheet(mockSpreadSheetId, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('cleanup', () => {
    it('메모리를 성공적으로 정리해야 한다', async () => {
      // Arrange
      service['activeSpreadSheet'] = {
        id: mockSpreadSheetId,
        userId: mockUserId,
        baselineData: mockSpreadSheetStructure,
        pendingDeltas: [],
        parsedCache: null,
        metadata: {
          version: 1,
          lastActivity: new Date(),
          saveScheduled: false,
          isDirty: false,
        },
      };

      // Act
      await service.cleanup();

      // Assert
      expect(service['activeSpreadSheet']).toBeNull();
    });
  });

  describe('Private Methods', () => {
    describe('validateDelta', () => {
      it('유효한 델타를 검증해야 한다', () => {
        // Test private method via public interface
        expect(() => service['validateDelta'](mockCellDelta)).not.toThrow();
      });

      it('잘못된 셀 주소에 대해 DeltaValidationError를 발생시켜야 한다', () => {
        // Arrange
        const invalidDelta = {
          ...mockCellDelta,
          cellAddress: 'INVALID',
        };

        // Act & Assert
        expect(() => service['validateDelta'](invalidDelta)).toThrow(
          DeltaValidationError,
        );
      });
    });

    describe('compressData/decompressData', () => {
      it('데이터를 압축하고 해제해야 한다', async () => {
        // Act
        const compressed = await service['compressData'](mockSpreadSheetStructure);
        const decompressed = await service['decompressData'](compressed);

        // Assert
        expect(decompressed).toEqual(mockSpreadSheetStructure);
      });
    });

    describe('generateDataHash', () => {
      it('데이터 해시를 생성해야 한다', () => {
        // Arrange
        const data = Buffer.from('test data');

        // Act
        const hash = service['generateDataHash'](data);

        // Assert
        expect(hash).toBe(createHash('sha256').update(data).digest('hex'));
      });
    });

    describe('convertToCSV', () => {
      it('DataTable을 CSV로 변환해야 한다', () => {
        // Arrange
        const dataTable = {
          A1: { value: 'Name' },
          B1: { value: 'Age' },
          A2: { value: 'John' },
          B2: { value: 25 },
        };

        // Act
        const csv = service['convertToCSV'](dataTable);

        // Assert
        expect(csv).toContain('Name');
        expect(csv).toContain('Age');
        expect(csv).toContain('John');
        expect(csv).toContain('25');
      });
    });
  });
});