// import { Test, TestingModule } from '@nestjs/testing';
// import { TableDataJsonSaveController } from './table-data-json-save.controller';
// import { TableDataJsonSaveService } from './table-data-json-save.service';
// import {
//   CreateSpreadSheetDto,
//   LoadSpreadSheetDto,
//   ApplyDeltaDto,
// } from './dto/table-data-json-save.dto';
// import {
//   LoadSpreadSheetResponse,
//   ApplyDeltaResponse,
//   ForceSaveResponse,
//   DeleteResponse,
//   SpreadSheetListItem,
//   GPTReadyData,
//   SpreadSheetStructure,
// } from '../types/spreadsheet.types';
// import { DeltaAction } from '@prisma/client';

// describe('TableDataJsonSaveController', () => {
//   let controller: TableDataJsonSaveController;
//   let service: TableDataJsonSaveService;

//   const mockUser = {
//     user: { sub: 'test-user-id' },
//   };

//   const mockSpreadSheetId = 'test-spreadsheet-id';
//   const mockChatId = 'test-chat-id';
//   const mockFileName = 'test-spreadsheet.xlsx';

//   beforeEach(async () => {
//     const module: TestingModule = await Test.createTestingModule({
//       controllers: [TableDataJsonSaveController],
//       providers: [
//         {
//           provide: TableDataJsonSaveService,
//           useValue: {
//             createSpreadSheet: jest.fn(),
//             loadSpreadSheet: jest.fn(),
//             applyDelta: jest.fn(),
//             getCurrentState: jest.fn(),
//             getGPTReadyData: jest.fn(),
//             forceSave: jest.fn(),
//             getUserSpreadSheets: jest.fn(),
//             deleteSpreadSheet: jest.fn(),
//             cleanup: jest.fn(),
//           },
//         },
//       ],
//     }).compile();

//     controller = module.get<TableDataJsonSaveController>(TableDataJsonSaveController);
//     service = module.get<TableDataJsonSaveService>(TableDataJsonSaveService);
//   });

//   afterEach(() => {
//     jest.clearAllMocks();
//   });

//   describe('createSpreadSheet', () => {
//     it('새 스프레드시트를 성공적으로 생성해야 한다', async () => {
//       const createDto: CreateSpreadSheetDto = {
//         spreadsheetId: mockSpreadSheetId,
//         fileName: mockFileName,
//         chatId: mockChatId,
//         initialData: { sheets: [] },
//       };

//       const mockResponse: LoadSpreadSheetResponse = {
//         id: mockSpreadSheetId,
//         fileName: mockFileName,
//         version: 1,
//         data: { version: '18.1.4', sheets: {} },
//         lastModified: new Date(),
//       };

//       jest.spyOn(service, 'createSpreadSheet').mockResolvedValue(mockResponse);

//       const result = await controller.createSpreadSheet(mockUser, createDto);

//       expect(service.createSpreadSheet).toHaveBeenCalledWith({
//         ...createDto,
//         userId: mockUser.user.sub,
//       });
//       expect(result).toEqual({
//         success: true,
//         data: mockResponse,
//         message: 'SpreadSheet created successfully',
//       });
//     });

//     it('서비스에서 에러가 발생하면 에러를 던져야 한다', async () => {
//       const createDto: CreateSpreadSheetDto = {
//         fileName: mockFileName,
//       };

//       jest.spyOn(service, 'createSpreadSheet').mockRejectedValue(new Error('Creation failed'));

//       await expect(controller.createSpreadSheet(mockUser, createDto)).rejects.toThrow('Creation failed');
//     });
//   });

//   describe('loadSpreadSheet', () => {
//     it('스프레드시트를 성공적으로 로드해야 한다', async () => {
//       const loadDto: LoadSpreadSheetDto = {
//         spreadSheetId: mockSpreadSheetId,
//       };

//       const mockResponse: LoadSpreadSheetResponse = {
//         id: mockSpreadSheetId,
//         fileName: mockFileName,
//         version: 2,
//         data: { version: '18.1.4', sheets: { Sheet1: { name: 'Sheet1', data: { dataTable: {} } } } },
//         lastModified: new Date(),
//       };

//       jest.spyOn(service, 'loadSpreadSheet').mockResolvedValue(mockResponse);

//       const result = await controller.loadSpreadSheet(mockUser, loadDto);

//       expect(service.loadSpreadSheet).toHaveBeenCalledWith(mockSpreadSheetId, mockUser.user.sub);
//       expect(result).toEqual({
//         success: true,
//         data: mockResponse,
//         message: 'SpreadSheet loaded successfully',
//       });
//     });

//     it('존재하지 않는 스프레드시트 로드 시 에러를 던져야 한다', async () => {
//       const loadDto: LoadSpreadSheetDto = {
//         spreadSheetId: 'non-existent-id',
//       };

//       jest.spyOn(service, 'loadSpreadSheet').mockRejectedValue(new Error('SpreadSheet not found'));

//       await expect(controller.loadSpreadSheet(mockUser, loadDto)).rejects.toThrow('SpreadSheet not found');
//     });
//   });

//   describe('applyDelta', () => {
//     it('델타를 성공적으로 적용해야 한다', async () => {
//       const deltaDto: ApplyDeltaDto = {
//         action: DeltaAction.SET_CELL_VALUE,
//         sheetName: 'Sheet1',
//         cellAddress: 'A1',
//         value: 'Test Value',
//       };

//       const mockResponse: ApplyDeltaResponse = {
//         success: true,
//         version: 3,
//       };

//       jest.spyOn(service, 'applyDelta').mockResolvedValue(mockResponse);

//       const result = await controller.applyDelta(mockUser, deltaDto);

//       expect(service.applyDelta).toHaveBeenCalledWith(mockUser.user.sub, {
//         ...deltaDto,
//         timestamp: expect.any(Number),
//       });
//       expect(result).toEqual({
//         success: true,
//         data: {
//           version: 3,
//           applied: true,
//         },
//         message: 'Delta applied successfully',
//       });
//     });

//     it('스타일 변경 델타를 적용해야 한다', async () => {
//       const deltaDto: ApplyDeltaDto = {
//         action: DeltaAction.SET_CELL_STYLE,
//         sheetName: 'Sheet1',
//         cellAddress: 'B2',
//         style: {
//           backgroundColor: '#FF0000',
//           color: '#FFFFFF',
//           fontSize: 14,
//           fontWeight: 'bold',
//         },
//       };

//       const mockResponse: ApplyDeltaResponse = {
//         success: true,
//         version: 4,
//       };

//       jest.spyOn(service, 'applyDelta').mockResolvedValue(mockResponse);

//       const result = await controller.applyDelta(mockUser, deltaDto);

//       expect(service.applyDelta).toHaveBeenCalledWith(mockUser.user.sub, {
//         action: DeltaAction.SET_CELL_STYLE,
//         sheetName: 'Sheet1',
//         cellAddress: 'B2',
//         range: undefined,
//         value: undefined,
//         formula: undefined,
//         style: {
//           backgroundColor: '#FF0000',
//           color: '#FFFFFF',
//           fontSize: 14,
//           fontWeight: 'bold',
//         },
//         rowIndex: undefined,
//         columnIndex: undefined,
//         count: undefined,
//         timestamp: expect.any(Number),
//       });
//       expect(result.success).toBe(true);
//     });
//   });

//   describe('applyBatchDeltas', () => {
//     it('여러 델타를 일괄 적용해야 한다', async () => {
//       const batchDto = {
//         deltas: [
//           {
//             action: DeltaAction.SET_CELL_VALUE,
//             sheetName: 'Sheet1',
//             cellAddress: 'A1',
//             value: 'Value 1',
//           },
//           {
//             action: DeltaAction.SET_CELL_VALUE,
//             sheetName: 'Sheet1',
//             cellAddress: 'A2',
//             value: 'Value 2',
//           },
//         ] as ApplyDeltaDto[],
//       };

//       const mockResponse: ApplyDeltaResponse = {
//         success: true,
//         version: 5,
//       };

//       jest.spyOn(service, 'applyDelta').mockResolvedValue(mockResponse);

//       const result = await controller.applyBatchDeltas(mockUser, batchDto);

//       expect(service.applyDelta).toHaveBeenCalledTimes(2);
//       expect(result).toEqual({
//         success: true,
//         data: {
//           appliedCount: 2,
//           version: 5,
//         },
//         message: '2 deltas applied successfully',
//       });
//     });
//   });

//   describe('getCurrentState', () => {
//     it('현재 상태를 성공적으로 조회해야 한다', async () => {
//       const mockState: SpreadSheetStructure = {
//         version: '18.1.4',
//         sheets: { Sheet1: { name: 'Sheet1', data: { dataTable: {} } } },
//       };

//       jest.spyOn(service, 'getCurrentState').mockResolvedValue(mockState);

//       const result = await controller.getCurrentState(mockUser);

//       expect(service.getCurrentState).toHaveBeenCalledWith(mockUser.user.sub);
//       expect(result).toEqual({
//         success: true,
//         data: mockState,
//         message: 'Current state retrieved successfully',
//       });
//     });
//   });

//   describe('getGPTReadyData', () => {
//     it('GPT용 데이터를 성공적으로 조회해야 한다', async () => {
//       const mockGPTData: GPTReadyData = {
//         totalCells: 100,
//         sheets: new Map([
//           ['Sheet1', {
//             cellCount: 50,
//             csvData: 'A,B,C\n1,2,3',
//             metadata: { name: 'Sheet1', cellCount: 50 },
//           }],
//           ['Sheet2', {
//             cellCount: 50,
//             csvData: 'X,Y,Z\n4,5,6',
//             metadata: { name: 'Sheet2', cellCount: 50 },
//           }],
//         ]),
//         dataHash: 'test-hash',
//         parsedAt: new Date(),
//       };

//       jest.spyOn(service, 'getGPTReadyData').mockResolvedValue(mockGPTData);

//       const result = await controller.getGPTReadyData(mockUser);

//       expect(service.getGPTReadyData).toHaveBeenCalledWith(mockUser.user.sub);
//       expect(result).toEqual({
//         success: true,
//         data: {
//           totalCells: 100,
//           sheetCount: 2,
//           dataHash: 'test-hash',
//           parsedAt: mockGPTData.parsedAt,
//           sheets: [
//             {
//               name: 'Sheet1',
//               cellCount: 50,
//               csvData: 'A,B,C\n1,2,3',
//               metadata: { name: 'Sheet1', cellCount: 50 },
//             },
//             {
//               name: 'Sheet2',
//               cellCount: 50,
//               csvData: 'X,Y,Z\n4,5,6',
//               metadata: { name: 'Sheet2', cellCount: 50 },
//             },
//           ],
//         },
//         message: 'GPT data retrieved successfully',
//       });
//     });
//   });

//   describe('forceSave', () => {
//     it('강제 저장을 성공적으로 수행해야 한다', async () => {
//       const mockResponse: ForceSaveResponse = {
//         success: true,
//         savedDeltas: 5,
//       };

//       jest.spyOn(service, 'forceSave').mockResolvedValue(mockResponse);

//       const result = await controller.forceSave(mockUser);

//       expect(service.forceSave).toHaveBeenCalled();
//       expect(result).toEqual({
//         success: true,
//         data: {
//           savedDeltas: 5,
//         },
//         message: 'Saved 5 pending changes',
//       });
//     });
//   });

//   describe('getUserSpreadSheets', () => {
//     it('사용자 스프레드시트 목록을 성공적으로 조회해야 한다', async () => {
//       const mockSpreadSheets: SpreadSheetListItem[] = [
//         {
//           id: 'sheet1',
//           fileName: 'Sheet 1',
//           fileSize: 1024,
//           version: 1,
//           createdAt: new Date('2023-01-01'),
//           updatedAt: new Date('2023-01-02'),
//           lastOpened: new Date('2023-01-03'),
//           sheetCount: 2,
//           compressedSize: 512,
//           chatCount: 5,
//           editCount: 10,
//           isActive: true,
//         },
//         {
//           id: 'sheet2',
//           fileName: 'Sheet 2',
//           fileSize: 2048,
//           version: 2,
//           createdAt: new Date('2023-01-04'),
//           updatedAt: new Date('2023-01-05'),
//           lastOpened: new Date('2023-01-06'),
//           sheetCount: 1,
//           compressedSize: 1024,
//           chatCount: 3,
//           editCount: 7,
//           isActive: false,
//         },
//       ];

//       jest.spyOn(service, 'getUserSpreadSheets').mockResolvedValue(mockSpreadSheets);

//       const result = await controller.getUserSpreadSheets(mockUser, 1, 20);

//       expect(service.getUserSpreadSheets).toHaveBeenCalledWith(mockUser.user.sub);
//       expect(result).toEqual({
//         success: true,
//         data: {
//           spreadSheets: mockSpreadSheets,
//           pagination: {
//             currentPage: 1,
//             totalItems: 2,
//             totalPages: 1,
//             itemsPerPage: 20,
//           },
//         },
//         message: 'SpreadSheets retrieved successfully',
//       });
//     });

//     it('페이지네이션이 올바르게 작동해야 한다', async () => {
//       const mockSpreadSheets: SpreadSheetListItem[] = Array.from({ length: 25 }, (_, i) => ({
//         id: `sheet${i + 1}`,
//         fileName: `Sheet ${i + 1}`,
//         fileSize: 1024,
//         version: 1,
//         createdAt: new Date(),
//         updatedAt: new Date(),
//         lastOpened: new Date(),
//         sheetCount: 1,
//         compressedSize: 512,
//         chatCount: 0,
//         editCount: 0,
//         isActive: i < 5,
//       }));

//       jest.spyOn(service, 'getUserSpreadSheets').mockResolvedValue(mockSpreadSheets);

//       const result = await controller.getUserSpreadSheets(mockUser, 2, 10);

//       expect(result.data.spreadSheets).toHaveLength(10);
//       expect(result.data.spreadSheets[0].fileName).toBe('Sheet 11');
//       expect(result.data.pagination).toEqual({
//         currentPage: 2,
//         totalItems: 25,
//         totalPages: 3,
//         itemsPerPage: 10,
//       });
//     });
//   });

//   describe('deleteSpreadSheet', () => {
//     it('스프레드시트를 성공적으로 삭제해야 한다', async () => {
//       const mockResponse: DeleteResponse = {
//         success: true,
//       };

//       jest.spyOn(service, 'deleteSpreadSheet').mockResolvedValue(mockResponse);

//       const result = await controller.deleteSpreadSheet(mockUser, mockSpreadSheetId);

//       expect(service.deleteSpreadSheet).toHaveBeenCalledWith(mockSpreadSheetId, mockUser.user.sub);
//       expect(result).toEqual({
//         success: true,
//         message: 'SpreadSheet deleted successfully',
//       });
//     });
//   });

//   describe('cleanup', () => {
//     it('메모리 정리를 성공적으로 수행해야 한다', async () => {
//       jest.spyOn(service, 'cleanup').mockResolvedValue(undefined);

//       const result = await controller.cleanup(mockUser);

//       expect(service.cleanup).toHaveBeenCalled();
//       expect(result).toEqual({
//         success: true,
//         message: 'Memory cleanup completed',
//       });
//     });
//   });

//   describe('getStatus', () => {
//     it('활성 스프레드시트가 있을 때 상태를 조회해야 한다', async () => {
//       const mockGPTData: GPTReadyData = {
//         totalCells: 100,
//         sheets: new Map([['Sheet1', {
//           cellCount: 100,
//           csvData: 'test',
//           metadata: { name: 'Sheet1', cellCount: 100 },
//         }]]),
//         dataHash: 'test-hash',
//         parsedAt: new Date('2023-01-01'),
//       };

//       jest.spyOn(service, 'getGPTReadyData').mockResolvedValue(mockGPTData);

//       const result = await controller.getStatus(mockUser);

//       expect(result).toEqual({
//         success: true,
//         data: {
//           hasActiveSpreadSheet: true,
//           totalCells: 100,
//           sheetCount: 1,
//           dataHash: 'test-hash',
//           lastActivity: mockGPTData.parsedAt,
//         },
//         message: 'Status retrieved successfully',
//       });
//     });

//     it('활성 스프레드시트가 없을 때 상태를 조회해야 한다', async () => {
//       jest.spyOn(service, 'getGPTReadyData').mockRejectedValue(new Error('No active spreadsheet'));

//       const result = await controller.getStatus(mockUser);

//       expect(result).toEqual({
//         success: true,
//         data: {
//           hasActiveSpreadSheet: false,
//           totalCells: 0,
//           sheetCount: 0,
//           dataHash: null,
//           lastActivity: null,
//         },
//         message: 'No active spreadsheet',
//       });
//     });
//   });

//   describe('Style Conversion', () => {
//     it('스타일 DTO를 올바르게 변환해야 한다', async () => {
//       const deltaDto: ApplyDeltaDto = {
//         action: DeltaAction.SET_CELL_STYLE,
//         sheetName: 'Sheet1',
//         cellAddress: 'A1',
//         style: {
//           backgroundColor: '#FF0000',
//           color: '#FFFFFF',
//           fontSize: 14,
//           fontWeight: '700',
//           textAlign: 'center',
//           verticalAlign: 'middle',
//           border: {
//             top: { style: 'solid', color: '#000000', width: 1 },
//           },
//         },
//       };

//       const mockResponse: ApplyDeltaResponse = {
//         success: true,
//         version: 1,
//       };

//       jest.spyOn(service, 'applyDelta').mockResolvedValue(mockResponse);

//       await controller.applyDelta(mockUser, deltaDto);

//       expect(service.applyDelta).toHaveBeenCalledWith(mockUser.user.sub, {
//         action: DeltaAction.SET_CELL_STYLE,
//         sheetName: 'Sheet1',
//         cellAddress: 'A1',
//         range: undefined,
//         value: undefined,
//         formula: undefined,
//         style: {
//           backgroundColor: '#FF0000',
//           color: '#FFFFFF',
//           fontSize: 14,
//           fontWeight: 700,
//           textAlign: 'center',
//           verticalAlign: 'middle',
//           border: {
//             top: { style: 'solid', color: '#000000', width: 1 },
//           },
//         },
//         rowIndex: undefined,
//         columnIndex: undefined,
//         count: undefined,
//         timestamp: expect.any(Number),
//       });
//     });
//   });

//   it('컨트롤러가 정의되어야 한다', () => {
//     expect(controller).toBeDefined();
//     expect(service).toBeDefined();
//   });
// });
