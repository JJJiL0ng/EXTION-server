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
} from '../types/spreadsheet.types';
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

  describe('Edge Cases & Error Handling', () => {
    describe('applyDelta - 델타 수 제한', () => {
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

      it('MAX_PENDING_DELTAS를 초과하면 강제 저장해야 한다', async () => {
        // Arrange
        const maxDeltas = 100;
        service['activeSpreadSheet']!.pendingDeltas = new Array(maxDeltas).fill(mockCellDelta);
        
        const forceSaveSpy = jest.spyOn(service, 'forceSave').mockResolvedValue({ success: true, savedDeltas: maxDeltas });

        // Act
        await service.applyDelta(mockUserId, mockCellDelta);

        // Assert
        expect(forceSaveSpy).toHaveBeenCalled();
      });
    });

    describe('loadSpreadSheet - 데이터 없는 경우', () => {
      it('압축된 데이터가 없으면 기본 구조를 반환해야 한다', async () => {
        // Arrange
        userService.validateUser.mockResolvedValue(undefined);
        const mockDataWithoutCompression = {
          ...mockSpreadSheetData,
          data: null,
        };
        prismaService.spreadSheet.findFirst.mockResolvedValue(mockDataWithoutCompression);
        prismaService.spreadSheet.update.mockResolvedValue(mockSpreadSheetData);

        // Act
        const result = await service.loadSpreadSheet(mockSpreadSheetId, mockUserId);

        // Assert
        expect(result.data).toEqual({
          version: '18.1.4',
          sheets: {
            Sheet1: {
              name: 'Sheet1',
              data: { dataTable: {} },
            },
          },
        });
      });
    });

    describe('createSpreadSheet - 유효한 초기 데이터', () => {
      it('유효한 초기 데이터로 스프레드시트를 생성해야 한다', async () => {
        // Arrange
        const createDtoWithData: CreateSpreadSheetDto = {
          fileName: mockFileName,
          userId: mockUserId,
          chatId: mockChatId,
          initialData: mockSpreadSheetStructure,
        };

        userService.validateUser.mockResolvedValue(undefined);
        userService.validateChat.mockResolvedValue(undefined);
        prismaService.spreadSheet.findFirst.mockResolvedValue(null);

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
        const result = await service.createSpreadSheet(createDtoWithData);

        // Assert
        expect(result.data).toEqual(mockSpreadSheetStructure);
      });
    });

    describe('deleteSpreadSheet - 활성 스프레드시트 삭제', () => {
      it('활성 스프레드시트를 삭제하면 메모리를 정리해야 한다', async () => {
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

        prismaService.spreadSheet.findFirst.mockResolvedValue(mockSpreadSheetData);
        prismaService.spreadSheet.update.mockResolvedValue(mockSpreadSheetData);

        const forceSaveSpy = jest.spyOn(service, 'forceSave').mockResolvedValue({ success: true, savedDeltas: 1 });

        // Act
        await service.deleteSpreadSheet(mockSpreadSheetId, mockUserId);

        // Assert
        expect(forceSaveSpy).toHaveBeenCalled();
        expect(service['activeSpreadSheet']).toBeNull();
      });
    });

    describe('cleanup - 더티 상태', () => {
      it('더티 상태에서 cleanup 시 저장 후 정리해야 한다', async () => {
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

        const forceSaveSpy = jest.spyOn(service, 'forceSave').mockResolvedValue({ success: true, savedDeltas: 1 });

        // Act
        await service.cleanup();

        // Assert
        expect(forceSaveSpy).toHaveBeenCalled();
        expect(service['activeSpreadSheet']).toBeNull();
      });
    });
  });

  describe('Delta Actions', () => {
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

    it('SET_CELL_FORMULA 액션을 처리해야 한다', async () => {
      // Arrange
      const formulaDelta: CellDelta = {
        action: DeltaAction.SET_CELL_FORMULA,
        sheetName: 'Sheet1',
        cellAddress: 'C1',
        formula: '=A1+B1',
        timestamp: Date.now(),
      };

      // Act
      const result = await service.applyDelta(mockUserId, formulaDelta);

      // Assert
      expect(result.success).toBe(true);
      expect(service['activeSpreadSheet']!.pendingDeltas).toHaveLength(1);
    });

    it('SET_CELL_STYLE 액션을 처리해야 한다', async () => {
      // Arrange
      const styleDelta: CellDelta = {
        action: DeltaAction.SET_CELL_STYLE,
        sheetName: 'Sheet1',
        cellAddress: 'A1',
        style: { backgroundColor: '#FF0000', fontWeight: 'bold' },
        timestamp: Date.now(),
      };

      // Act
      const result = await service.applyDelta(mockUserId, styleDelta);

      // Assert
      expect(result.success).toBe(true);
    });

    it('DELETE_CELLS 액션을 처리해야 한다', async () => {
      // Arrange
      const deleteDelta: CellDelta = {
        action: DeltaAction.DELETE_CELLS,
        sheetName: 'Sheet1',
        cellAddress: 'A1',
        timestamp: Date.now(),
      };

      // Act
      const result = await service.applyDelta(mockUserId, deleteDelta);

      // Assert
      expect(result.success).toBe(true);
    });

    it('INSERT_ROWS 액션을 처리해야 한다', async () => {
      // Arrange
      const insertRowsDelta: CellDelta = {
        action: DeltaAction.INSERT_ROWS,
        sheetName: 'Sheet1',
        rowIndex: 2,
        count: 1,
        timestamp: Date.now(),
      };

      // Act
      const result = await service.applyDelta(mockUserId, insertRowsDelta);

      // Assert
      expect(result.success).toBe(true);
    });

    it('DELETE_ROWS 액션을 처리해야 한다', async () => {
      // Arrange
      const deleteRowsDelta: CellDelta = {
        action: DeltaAction.DELETE_ROWS,
        sheetName: 'Sheet1',
        rowIndex: 2,
        count: 1,
        timestamp: Date.now(),
      };

      // Act
      const result = await service.applyDelta(mockUserId, deleteRowsDelta);

      // Assert
      expect(result.success).toBe(true);
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

      it('INSERT_ROWS 액션에서 rowIndex가 없으면 에러를 발생시켜야 한다', () => {
        // Arrange
        const invalidDelta = {
          action: DeltaAction.INSERT_ROWS,
          sheetName: 'Sheet1',
          timestamp: Date.now(),
        } as CellDelta;

        // Act & Assert
        expect(() => service['validateDelta'](invalidDelta)).toThrow(
          DeltaValidationError,
        );
      });

      it('DELETE_ROWS 액션에서 count가 0이면 에러를 발생시켜야 한다', () => {
        // Arrange
        const invalidDelta = {
          action: DeltaAction.DELETE_ROWS,
          sheetName: 'Sheet1',
          rowIndex: 1,
          count: 0,
          timestamp: Date.now(),
        } as CellDelta;

        // Act & Assert
        expect(() => service['validateDelta'](invalidDelta)).toThrow(
          DeltaValidationError,
        );
      });
    });

    describe('applyDeltaToData', () => {
      it('새로운 시트가 없으면 생성해야 한다', () => {
        // Arrange
        const emptyData: SpreadSheetStructure = {
          version: '18.1.4',
          sheets: {},
        };
        const delta: CellDelta = {
          action: DeltaAction.SET_CELL_VALUE,
          sheetName: 'NewSheet',
          cellAddress: 'A1',
          value: 'Test',
          timestamp: Date.now(),
        };

        // Act
        service['applyDeltaToData'](emptyData, delta);

        // Assert
        expect(emptyData.sheets.NewSheet).toBeDefined();
        expect(emptyData.sheets.NewSheet.name).toBe('NewSheet');
        expect(emptyData.sheets.NewSheet.data.dataTable.A1.value).toBe('Test');
      });

      it('기존 셀에 스타일을 병합해야 한다', () => {
        // Arrange
        const data = JSON.parse(JSON.stringify(mockSpreadSheetStructure));
        data.sheets.Sheet1.data.dataTable.A1.style = { backgroundColor: '#FF0000' };
        
        const styleDelta: CellDelta = {
          action: DeltaAction.SET_CELL_STYLE,
          sheetName: 'Sheet1',
          cellAddress: 'A1',
          style: { fontWeight: 'bold' },
          timestamp: Date.now(),
        };

        // Act
        service['applyDeltaToData'](data, styleDelta);

        // Assert
        expect(data.sheets.Sheet1.data.dataTable.A1.style).toEqual({
          backgroundColor: '#FF0000',
          fontWeight: 'bold',
        });
      });
    });

    describe('extractSheetCount', () => {
      it('시트가 없으면 1을 반환해야 한다', () => {
        // Arrange
        const dataWithoutSheets = { version: '18.1.4' } as any;

        // Act
        const count = service['extractSheetCount'](dataWithoutSheets);

        // Assert
        expect(count).toBe(1);
      });
    });

    describe('parseRowFromAddress / parseColFromAddress', () => {
      it('셀 주소를 올바르게 파싱해야 한다', () => {
        // Act
        const row = service['parseRowFromAddress']('B10');
        const col = service['parseColFromAddress']('B10');

        // Assert
        expect(row).toBe(9); // 0-based index
        expect(col).toBe(1); // B = 1
      });

      it('잘못된 주소 형식에 대해 기본값을 반환해야 한다', () => {
        // Act
        const row = service['parseRowFromAddress']('INVALID');
        const col = service['parseColFromAddress']('INVALID');

        // Assert
        expect(row).toBe(0);
        expect(col).toBe(0);
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

      it('잘못된 압축 데이터에 대해 ValidationError를 발생시켜야 한다', async () => {
        // Arrange
        const invalidCompressedData = Buffer.from('invalid data');

        // Act & Assert
        await expect(service['decompressData'](invalidCompressedData)).rejects.toThrow();
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

      it('빈 DataTable에 대해 빈 문자열을 반환해야 한다', () => {
        // Arrange
        const emptyDataTable = {};

        // Act
        const csv = service['convertToCSV'](emptyDataTable);

        // Assert
        expect(csv).toBe('');
      });

      it('formula 값이 있는 셀을 처리해야 한다', () => {
        // Arrange
        const dataTable = {
          A1: { formula: '=B1+C1' },
          B1: { value: 10 },
          C1: { value: 20 },
        };

        // Act
        const csv = service['convertToCSV'](dataTable);

        // Assert
        expect(csv).toContain('=B1+C1');
      });
    });

    describe('scheduleSave', () => {
      it('저장 타이머를 스케줄링해야 한다', () => {
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
            isDirty: true,
          },
        };

        // Act
        service['scheduleSave']();

        // Assert
        expect(service['activeSpreadSheet']!.metadata.saveScheduled).toBe(true);
        expect(service['saveTimer']).toBeDefined();

        // Cleanup
        service['clearSaveTimer']();
      });
    });

    describe('applyDeltasToData', () => {
      it('여러 델타를 타임스탬프 순서로 적용해야 한다', () => {
        // Arrange
        const baseData = JSON.parse(JSON.stringify(mockSpreadSheetStructure));
        const deltas: CellDelta[] = [
          {
            action: DeltaAction.SET_CELL_VALUE,
            sheetName: 'Sheet1',
            cellAddress: 'A1',
            value: 'First',
            timestamp: 2000,
          },
          {
            action: DeltaAction.SET_CELL_VALUE,
            sheetName: 'Sheet1',
            cellAddress: 'A1',
            value: 'Second',
            timestamp: 1000,
          },
          {
            action: DeltaAction.SET_CELL_VALUE,
            sheetName: 'Sheet1',
            cellAddress: 'A1',
            value: 'Third',
            timestamp: 3000,
          },
        ];

        // Act
        const result = service['applyDeltasToData'](baseData, deltas);

        // Assert
        // 가장 마지막 타임스탬프 값이 최종 값이어야 함
        expect(result.sheets.Sheet1.data.dataTable.A1.value).toBe('Third');
      });
    });

    describe('Error handling paths', () => {
      it('createSpreadSheet에서 압축 실패 시 에러를 발생시켜야 한다', async () => {
        // Arrange
        const createDto: CreateSpreadSheetDto = {
          fileName: mockFileName,
          userId: mockUserId,
        };

        userService.validateUser.mockResolvedValue(undefined);
        prismaService.spreadSheet.findFirst.mockResolvedValue(null);

        // Mock compression to fail
        jest.spyOn(service as any, 'compressData').mockRejectedValue(new Error('Compression failed'));

        // Act & Assert
        await expect(service.createSpreadSheet(createDto)).rejects.toThrow('Compression failed');
      });

      it('loadSpreadSheet에서 압축 해제 실패 시 에러를 발생시켜야 한다', async () => {
        // Arrange
        userService.validateUser.mockResolvedValue(undefined);
        
        const mockDataWithInvalidCompression = {
          ...mockSpreadSheetData,
          data: {
            ...mockSpreadSheetData.data,
            compressedData: Buffer.from('invalid compressed data'),
          },
        };

        prismaService.spreadSheet.findFirst.mockResolvedValue(mockDataWithInvalidCompression);

        // Act & Assert
        await expect(service.loadSpreadSheet(mockSpreadSheetId, mockUserId)).rejects.toThrow();
      });

      it('loadSpreadSheet에서 기존 활성 스프레드시트 저장 실패 시에도 계속 진행해야 한다', async () => {
        // Arrange
        service['activeSpreadSheet'] = {
          id: 'other-sheet-id',
          userId: mockUserId,
          baselineData: mockSpreadSheetStructure,
          pendingDeltas: [],
          parsedCache: null,
          metadata: {
            version: 1,
            lastActivity: new Date(),
            saveScheduled: false,
            isDirty: true,
          },
        };

        userService.validateUser.mockResolvedValue(undefined);
        
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

        // Mock forceSave to throw error
        jest.spyOn(service, 'forceSave').mockRejectedValue(new Error('Save failed'));

        // Act & Assert - should not throw, should continue loading
        const result = await service.loadSpreadSheet(mockSpreadSheetId, mockUserId);
        expect(result).toBeDefined();
      });

      it('createSpreadSheet에서 기존 활성 스프레드시트 저장 실패 시에도 계속 진행해야 한다', async () => {
        // Arrange
        service['activeSpreadSheet'] = {
          id: 'other-sheet-id',
          userId: mockUserId,
          baselineData: mockSpreadSheetStructure,
          pendingDeltas: [],
          parsedCache: null,
          metadata: {
            version: 1,
            lastActivity: new Date(),
            saveScheduled: false,
            isDirty: true,
          },
        };

        const createDto: CreateSpreadSheetDto = {
          fileName: mockFileName,
          userId: mockUserId,
        };

        userService.validateUser.mockResolvedValue(undefined);
        prismaService.spreadSheet.findFirst.mockResolvedValue(null);

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

        // Mock forceSave to throw error
        jest.spyOn(service, 'forceSave').mockRejectedValue(new Error('Save failed'));

        // Act & Assert - should not throw, should continue creating
        const result = await service.createSpreadSheet(createDto);
        expect(result).toBeDefined();
      });

      it('잘못된 데이터 구조로 decompressData 실패 시 ValidationError를 발생시켜야 한다', async () => {
        // Arrange
        const invalidJsonData = 'invalid json';
        const compressedInvalidData = zlib.gzipSync(invalidJsonData);

        // Act & Assert
        await expect(service['decompressData'](compressedInvalidData)).rejects.toThrow(ValidationError);
      });
    });

    describe('getUserSpreadSheets - active sheet 체크', () => {
      it('현재 활성 스프레드시트를 올바르게 표시해야 한다', async () => {
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
        expect(result[0].isActive).toBe(true);
      });
    });

    describe('Column parsing edge cases', () => {
      it('다중 문자 열을 올바르게 파싱해야 한다', () => {
        // Act
        const colAA = service['parseColFromAddress']('AA1');
        const colAB = service['parseColFromAddress']('AB1');
        const colZ = service['parseColFromAddress']('Z1');

        // Assert
        expect(colZ).toBe(25); // Z = 26 - 1 = 25 (0-based)
        expect(colAA).toBe(26); // AA = 27 - 1 = 26 (0-based)
        expect(colAB).toBe(27); // AB = 28 - 1 = 27 (0-based)
      });
    });

    describe('scheduleSave timeout callback', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('타이머 콜백에서 저장 실패 시 재시도를 스케줄링해야 한다', async () => {
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

        // Mock performSave to fail
        const performSaveSpy = jest.spyOn(service as any, 'performSave')
          .mockRejectedValue(new Error('Save failed'));
        
        const scheduleRetrySpy = jest.spyOn(service as any, 'scheduleSave');

        // Act
        service['scheduleSave']();
        
        // Fast-forward the initial timer
        jest.advanceTimersByTime(2000);
        
        // Wait for the async callback to complete
        await new Promise(resolve => setTimeout(resolve, 0));
        
        // Fast-forward the retry timer
        jest.advanceTimersByTime(5000);

        // Assert
        expect(performSaveSpy).toHaveBeenCalled();
        expect(scheduleRetrySpy).toHaveBeenCalledTimes(2); // Original call + retry
      });
    });

    describe('performSave edge cases', () => {
      it('활성 스프레드시트가 dirty하지 않으면 0을 반환해야 한다', async () => {
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
            isDirty: false, // not dirty
          },
        };

        // Act
        const result = await service['performSave']();

        // Assert
        expect(result).toBe(0);
        expect(prismaService.$transaction).not.toHaveBeenCalled();
      });

      it('델타가 없으면 isDirty를 false로 설정하고 0을 반환해야 한다', async () => {
        // Arrange
        service['activeSpreadSheet'] = {
          id: mockSpreadSheetId,
          userId: mockUserId,
          baselineData: mockSpreadSheetStructure,
          pendingDeltas: [], // no deltas
          parsedCache: null,
          metadata: {
            version: 1,
            lastActivity: new Date(),
            saveScheduled: false,
            isDirty: true, // dirty but no deltas
          },
        };

        // Act
        const result = await service['performSave']();

        // Assert
        expect(result).toBe(0);
        expect(service['activeSpreadSheet']!.metadata.isDirty).toBe(false);
        expect(prismaService.$transaction).not.toHaveBeenCalled();
      });
    });

    describe('decompressData validation', () => {
      it('유효하지 않은 스프레드시트 구조에 대해 ValidationError를 발생시켜야 한다', async () => {
        // Arrange - 올바른 JSON이지만 스프레드시트 구조가 아닌 데이터
        const invalidStructureData = { 
          notVersion: 'invalid', 
          notSheets: 'invalid' 
        };
        const compressedInvalidStructure = zlib.gzipSync(JSON.stringify(invalidStructureData));

        // Act & Assert
        await expect(service['decompressData'](compressedInvalidStructure))
          .rejects.toThrow(ValidationError);
        await expect(service['decompressData'](compressedInvalidStructure))
          .rejects.toThrow('Decompressed data is not a valid spreadsheet structure');
      });

      it('gunzip 실패 시 에러를 전파해야 한다', async () => {
        // Arrange
        const notCompressedData = Buffer.from('not compressed data');

        // Act & Assert
        await expect(service['decompressData'](notCompressedData)).rejects.toThrow();
      });
    });

    describe('Additional coverage cases', () => {
      it('applyDelta에서 스케줄된 저장을 올바르게 처리해야 한다', async () => {
        // Arrange
        service['activeSpreadSheet'] = {
          id: mockSpreadSheetId,
          userId: mockUserId,
          baselineData: mockSpreadSheetStructure,
          pendingDeltas: new Array(50).fill(mockCellDelta), // 중간 수준의 델타
          parsedCache: null,
          metadata: {
            version: 1,
            lastActivity: new Date(),
            saveScheduled: false,
            isDirty: false,
          },
        };

        const scheduleSpyy = jest.spyOn(service as any, 'scheduleSave');

        // Act
        await service.applyDelta(mockUserId, mockCellDelta);

        // Assert
        expect(scheduleSpyy).toHaveBeenCalled();
        expect(service['activeSpreadSheet']!.metadata.isDirty).toBe(true);
      });

      it('clearSaveTimer가 null 타이머에 대해 안전하게 동작해야 한다', () => {
        // Arrange
        service['saveTimer'] = null;

        // Act & Assert - should not throw
        expect(() => service['clearSaveTimer']()).not.toThrow();
      });

      it('cleanup에서 에러 발생 시 로깅 후 계속 진행해야 한다', async () => {
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

        const forceSaveSpy = jest.spyOn(service, 'forceSave')
          .mockRejectedValue(new Error('Cleanup save failed'));
        const loggerSpy = jest.spyOn(service['logger'], 'error');

        // Act
        await service.cleanup();

        // Assert
        expect(forceSaveSpy).toHaveBeenCalled();
        expect(loggerSpy).toHaveBeenCalledWith(
          expect.stringContaining('Cleanup failed'),
          expect.any(Object)
        );
        expect(service['activeSpreadSheet']).toBeNull();
      });
    });
  });
});