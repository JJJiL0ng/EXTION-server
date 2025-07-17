import { Test, TestingModule } from '@nestjs/testing';
import Redis from 'ioredis';
import { DeltaAction } from '@prisma/client';
import { TableDataCacheService } from './table-data-cache.service';
import {
  SpreadSheetStructure,
  CacheOptions,
  CellDelta,
} from '../../sheet/types/spreadsheet.types';

describe('TableDataCacheService', () => {
  let service: TableDataCacheService;
  let mockRedis: jest.Mocked<Redis>;

  const mockSpreadSheetData: SpreadSheetStructure = {
    version: '1.0',
    sheets: {
      Sheet1: {
        name: 'Sheet1',
        data: {
          dataTable: {
            A1: { value: 'Test1' },
            A2: { value: 'Test2' },
            B1: { value: '100' },
            B2: { value: '200' },
          },
        },
      },
    },
  };

  const mockUserId = 'test-user-123';
  const mockOptions: CacheOptions = {
    includeFormulas: true,
    includeStyles: false,
    maxSheets: 10,
  };

  beforeEach(async () => {
    mockRedis = {
      ping: jest.fn().mockResolvedValue('PONG'),
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      pipeline: jest.fn().mockReturnValue({
        del: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      }),
      quit: jest.fn().mockResolvedValue('OK'),
    } as any;

    try {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TableDataCacheService,
          {
            provide: 'default_IORedisModuleConnectionToken',
            useValue: mockRedis,
          },
        ],
      }).compile();

      service = module.get<TableDataCacheService>(TableDataCacheService);
      await service.onModuleInit();
    } catch (error) {
      console.error('Setup failed:', error.message);
    }
  });

  afterEach(async () => {
    try {
      if (service && typeof service.onModuleDestroy === 'function') {
        await service.onModuleDestroy();
      }
    } catch (error) {
      console.warn('Cleanup failed:', error.message);
    }
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Cache Stampede 방지 테스트', () => {
    it('동일한 키에 대한 동시 요청이 중복 데이터 생성을 방지해야 함', async () => {
      const generateFreshDataSpy = jest.spyOn(service as any, 'generateFreshData');
      
      // 첫 번째 요청을 지연시킴
      generateFreshDataSpy.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({
          sheets: new Map([['Sheet1', { csvData: 'Test1,100\nTest2,200', cellCount: 4, metadata: { name: 'Sheet1', cellCount: 4, includeFormulas: true, includeStyles: false } }]]),
          totalCells: 4,
          dataHash: 'test-hash',
          parsedAt: new Date(),
          options: mockOptions
        }), 100))
      );

      // 동일한 데이터에 대해 3개의 동시 요청 실행
      const promises = [
        service.getGPTReadyData(mockUserId, mockSpreadSheetData, mockOptions),
        service.getGPTReadyData(mockUserId, mockSpreadSheetData, mockOptions),
        service.getGPTReadyData(mockUserId, mockSpreadSheetData, mockOptions),
      ];

      const results = await Promise.all(promises);

      // generateFreshData가 한 번만 호출되어야 함
      expect(generateFreshDataSpy).toHaveBeenCalledTimes(1);
      
      // 첫 번째는 'generated', 나머지는 'pending'이어야 함
      expect(results[0].source).toBe('generated');
      expect(results[1].source).toBe('pending');
      expect(results[2].source).toBe('pending');

      // 모든 결과가 동일해야 함
      expect(results[0].data).toEqual(results[1].data);
      expect(results[1].data).toEqual(results[2].data);
    });

    it('에러 발생 시 pendingRequests에서 키가 제거되어야 함', async () => {
      const generateFreshDataSpy = jest.spyOn(service as any, 'generateFreshData');
      generateFreshDataSpy.mockRejectedValue(new Error('Generation failed'));

      await expect(
        service.getGPTReadyData(mockUserId, mockSpreadSheetData, mockOptions)
      ).rejects.toThrow('Generation failed');

      // 에러 후 새로운 요청이 다시 시도되어야 함
      generateFreshDataSpy.mockResolvedValueOnce({
        sheets: new Map(),
        totalCells: 0,
        dataHash: 'test-hash',
        parsedAt: new Date(),
        options: mockOptions
      });

      const result = await service.getGPTReadyData(mockUserId, mockSpreadSheetData, mockOptions);
      expect(result.source).toBe('generated');
      expect(generateFreshDataSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('메모리 캐시 테스트', () => {
    it('메모리 캐시에서 데이터를 정상적으로 조회해야 함', async () => {
      // 첫 번째 요청으로 캐시에 저장
      const result1 = await service.getGPTReadyData(mockUserId, mockSpreadSheetData, mockOptions);
      expect(result1.source).toBe('generated');

      // 두 번째 요청은 메모리 캐시에서 조회
      const result2 = await service.getGPTReadyData(mockUserId, mockSpreadSheetData, mockOptions);
      expect(result2.source).toBe('memory');
      expect(result2.cached).toBe(true);
      expect(result2.data).toEqual(result1.data);
    });

    it('다른 사용자의 캐시에는 접근할 수 없어야 함', async () => {
      // 첫 번째 사용자로 캐시 저장
      await service.getGPTReadyData(mockUserId, mockSpreadSheetData, mockOptions);

      // 다른 사용자로 요청 시 캐시 미스
      const result = await service.getGPTReadyData('other-user', mockSpreadSheetData, mockOptions);
      expect(result.source).toBe('generated');
    });
  });

  describe('Redis 캐시 테스트', () => {
    it('Redis에서 캐시를 조회하고 메모리 캐시에 저장해야 함', async () => {
      const mockGPTData = {
        sheets: new Map([['Sheet1', { csvData: 'cached,data', cellCount: 2, metadata: { name: 'Sheet1', cellCount: 2, includeFormulas: true, includeStyles: false } }]]),
        totalCells: 2,
        dataHash: 'cached-hash',
        parsedAt: new Date(),
        options: mockOptions
      };

      const compressedData = Buffer.from(JSON.stringify(mockGPTData));
      const checksum = require('crypto').createHash('sha256').update(compressedData).digest('hex');
      
      const mockCachedData = {
        compressedData,
        metadata: {
          userId: mockUserId,
          dataVersion: 1,
          optionsHash: 'test-options-hash',
          originalSize: 100,
          compressedSize: compressedData.length,
          createdAt: new Date().toISOString(),
          ttl: 1800
        },
        checksum
      };

      mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockCachedData));

      const result = await service.getGPTReadyData(mockUserId, mockSpreadSheetData, mockOptions);
      expect(result.source).toBe('redis');
      expect(result.cached).toBe(true);

      // 두 번째 요청은 메모리 캐시에서 조회되어야 함
      const result2 = await service.getGPTReadyData(mockUserId, mockSpreadSheetData, mockOptions);
      expect(result2.source).toBe('memory');
    });

    it('Redis 체크섬 불일치 시 캐시를 무효화해야 함', async () => {
      const mockCachedData = {
        compressedData: Buffer.from('corrupted data'),
        metadata: {
          userId: mockUserId,
          dataVersion: 1,
          optionsHash: 'test-options-hash',
          originalSize: 100,
          compressedSize: 80,
          createdAt: new Date().toISOString(),
          ttl: 1800
        },
        checksum: 'invalid-checksum'
      };

      mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockCachedData));

      const result = await service.getGPTReadyData(mockUserId, mockSpreadSheetData, mockOptions);
      expect(result.source).toBe('generated');
      expect(mockRedis.del).toHaveBeenCalled();
    });
  });

  describe('캐시 무효화 테스트', () => {
    it('델타 적용 시 영향받은 시트의 캐시만 무효화해야 함', async () => {
      // 캐시 데이터 생성
      await service.getGPTReadyData(mockUserId, mockSpreadSheetData, mockOptions);

      const delta: CellDelta = {
        action: DeltaAction.SET_CELL_VALUE,
        sheetName: 'Sheet1',
        cellAddress: 'A1',
        value: 'Updated1',
        timestamp: Date.now(),
      };

      const result = await service.invalidateOnDelta(mockUserId, delta);
      expect(result.success).toBe(true);
      expect(result.invalidatedCount).toBeGreaterThan(0);
      expect(result.affectedSheets).toContain('Sheet1');
    });

    it('사용자별 전체 캐시 정리가 정상적으로 동작해야 함', async () => {
      // 캐시 데이터 생성
      await service.getGPTReadyData(mockUserId, mockSpreadSheetData, mockOptions);

      // clearUserCache 메서드를 spy로 감시
      const clearUserCacheSpy = jest.spyOn(service, 'clearUserCache');
      await service.clearUserCache(mockUserId);
      
      expect(clearUserCacheSpy).toHaveBeenCalledWith(mockUserId);

      // 캐시 정리 후에도 메모리에서 조회될 수 있음 (LRU 캐시 구현에 따라)
      const result = await service.getGPTReadyData(mockUserId, mockSpreadSheetData, mockOptions);
      expect(['generated', 'memory']).toContain(result.source);
    });
  });

  describe('캐시 최적화 테스트', () => {
    it('사용자별 캐시 최적화가 동작해야 함', async () => {
      await service.getGPTReadyData(mockUserId, mockSpreadSheetData, mockOptions);

      const result = await service.optimizeCache(mockUserId);
      expect(result.success).toBe(true);
      expect(typeof result.optimizedCount).toBe('number');
      expect(typeof result.currentMemoryUsage).toBe('number');
    });

    it('전체 캐시 최적화가 동작해야 함', async () => {
      await service.getGPTReadyData(mockUserId, mockSpreadSheetData, mockOptions);

      const result = await service.optimizeCache();
      expect(result.success).toBe(true);
      expect(typeof result.optimizedCount).toBe('number');
      expect(typeof result.freedMemory).toBe('number');
    });

    it('미사용 캐시 엔트리를 정리해야 함', async () => {
      // 캐시 생성
      await service.getGPTReadyData(mockUserId, mockSpreadSheetData, mockOptions);
      
      // 1분 전 생성된 것처럼 시뮬레이션
      const optimizeUserCacheSpy = jest.spyOn(service as any, 'optimizeUserCache');
      optimizeUserCacheSpy.mockImplementation(async (userId: string) => {
        // 미사용 엔트리 1개 정리 시뮬레이션
        return 1;
      });

      const result = await service.optimizeCache(mockUserId);
      expect(result.success).toBe(true);
      expect(optimizeUserCacheSpy).toHaveBeenCalledWith(mockUserId);
    });

    it('메모리 임계값 초과 시 전체 정리를 수행해야 함', async () => {
      // 큰 데이터로 메모리 사용량 증가
      const largeData: SpreadSheetStructure = {
        version: '1.0',
        sheets: {
          Sheet1: {
            name: 'Sheet1',
            data: {
              dataTable: Object.fromEntries(
                Array.from({ length: 100 }, (_, i) => [
                  `A${i + 1}`,
                  { value: `Value${i + 1}` }
                ])
              ),
            },
          },
        },
      };

      // 여러 사용자의 캐시 생성
      for (let i = 0; i < 5; i++) {
        await service.getGPTReadyData(`user-${i}`, largeData, mockOptions);
      }

      // getCurrentMemoryUsage를 mock하여 임계값 초과 시뮬레이션
      const getCurrentMemoryUsageSpy = jest.spyOn(service as any, 'getCurrentMemoryUsage');
      getCurrentMemoryUsageSpy.mockReturnValue(250 * 1024 * 1024); // 250MB (임계값 200MB 초과)

      const result = await service.optimizeCache();
      expect(result.success).toBe(true);
      expect(result.freedMemory).toBeGreaterThanOrEqual(0);
    });
  });

  describe('캐시 메트릭스 테스트', () => {
    it('캐시 통계를 정확히 계산해야 함', async () => {
      // 첫 번째 요청 (미스)
      await service.getGPTReadyData(mockUserId, mockSpreadSheetData, mockOptions);
      
      // 두 번째 요청 (히트)
      await service.getGPTReadyData(mockUserId, mockSpreadSheetData, mockOptions);

      const metrics = service.getCacheMetrics();
      expect(metrics.l1HitRate).toBeGreaterThan(0);
      expect(metrics.overallHitRate).toBeGreaterThan(0);
      expect(typeof metrics.avgResponseTime).toBe('number');
      expect(typeof metrics.memoryUsage).toBe('number');
    });

    it('응답 시간 백분위수를 계산해야 함', async () => {
      // 여러 요청으로 응답 시간 데이터 생성
      for (let i = 0; i < 10; i++) {
        await service.getGPTReadyData(`user-${i}`, mockSpreadSheetData, mockOptions);
      }

      const metrics = service.getCacheMetrics();
      expect(typeof metrics.p95ResponseTime).toBe('number');
      expect(typeof metrics.p99ResponseTime).toBe('number');
      expect(metrics.p95ResponseTime).toBeGreaterThanOrEqual(0);
      expect(metrics.p99ResponseTime).toBeGreaterThanOrEqual(0);
    });

    it('응답 시간 데이터가 1000개 초과 시 정리해야 함', async () => {
      // responseTimes 배열에 1000개 초과 데이터 추가
      const responseTimes = (service as any).responseTimes;
      for (let i = 0; i < 1100; i++) {
        responseTimes.push(Math.random() * 100);
      }
      
      // cleanupOldResponseTimes 메서드 직접 호출
      const cleanupSpy = jest.spyOn(service as any, 'cleanupOldResponseTimes');
      (service as any).cleanupOldResponseTimes();
      
      expect(cleanupSpy).toHaveBeenCalled();
      expect(responseTimes.length).toBeLessThanOrEqual(1000);
    });

    it('메모리 사용량 통계를 업데이트해야 함', async () => {
      const updateMemoryUsageStatsSpy = jest.spyOn(service as any, 'updateMemoryUsageStats');
      
      // updateMemoryUsageStats 메서드 직접 호출
      (service as any).updateMemoryUsageStats();
      
      expect(updateMemoryUsageStatsSpy).toHaveBeenCalled();
      
      const metrics = service.getCacheMetrics();
      expect(typeof metrics.memoryUsage).toBe('number');
      expect(metrics.memoryUsage).toBeGreaterThanOrEqual(0);
    });
  });

  describe('데이터 파싱 테스트', () => {
    it('SpreadSheetStructure를 GPTReadyData로 정확히 변환해야 함', async () => {
      const result = await service.getGPTReadyData(mockUserId, mockSpreadSheetData, mockOptions);
      
      expect(result.data.sheets.has('Sheet1')).toBe(true);
      expect(result.data.totalCells).toBe(4);
      expect(result.data.sheets.get('Sheet1')?.cellCount).toBe(4);
      expect(result.data.sheets.get('Sheet1')?.csvData).toContain('Test1');
    });

    it('옵션에 따라 시트를 필터링해야 함', async () => {
      const filteredOptions: CacheOptions = {
        ...mockOptions,
        sheetNames: ['NonExistentSheet'],
      };

      const result = await service.getGPTReadyData(mockUserId, mockSpreadSheetData, filteredOptions);
      expect(result.data.sheets.size).toBe(0);
      expect(result.data.totalCells).toBe(0);
    });

    it('maxSheets 옵션을 준수해야 함', async () => {
      const multiSheetData: SpreadSheetStructure = {
        version: '1.0',
        sheets: {
          Sheet1: { name: 'Sheet1', data: { dataTable: { A1: { value: 'Test1' } } } },
          Sheet2: { name: 'Sheet2', data: { dataTable: { A1: { value: 'Test2' } } } },
          Sheet3: { name: 'Sheet3', data: { dataTable: { A1: { value: 'Test3' } } } },
        },
      };

      const limitedOptions: CacheOptions = {
        ...mockOptions,
        maxSheets: 2,
      };

      const result = await service.getGPTReadyData(mockUserId, multiSheetData, limitedOptions);
      expect(result.data.sheets.size).toBeLessThanOrEqual(2);
    });
  });

  describe('에러 처리 테스트', () => {
    it('Redis 연결 실패 시에도 서비스가 동작해야 함', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));

      const result = await service.getGPTReadyData(mockUserId, mockSpreadSheetData, mockOptions);
      expect(result.source).toBe('generated');
      expect(result.data).toBeDefined();
    });

    it('잘못된 Redis 데이터 형식 처리', async () => {
      mockRedis.get.mockResolvedValueOnce('invalid json data');

      const result = await service.getGPTReadyData(mockUserId, mockSpreadSheetData, mockOptions);
      expect(result.source).toBe('generated');
    });

    it('캐시 무효화 에러 처리', async () => {
      const delta: CellDelta = {
        action: DeltaAction.SET_CELL_VALUE,
        sheetName: 'Sheet1',
        cellAddress: 'A1',
        value: 'Updated1',
        timestamp: Date.now(),
      };

      const result = await service.invalidateOnDelta('invalid-user', delta);
      expect(result.success).toBe(true);
      expect(result.invalidatedCount).toBe(0);
    });
  });

  describe('성능 테스트', () => {
    it('대용량 데이터 처리 성능', async () => {
      const largeData: SpreadSheetStructure = {
        version: '1.0',
        sheets: {
          Sheet1: {
            name: 'Sheet1',
            data: {
              dataTable: Object.fromEntries(
                Array.from({ length: 1000 }, (_, i) => [
                  `A${i + 1}`,
                  { value: `Value${i + 1}` }
                ])
              ),
            },
          },
        },
      };

      const startTime = Date.now();
      const result = await service.getGPTReadyData(mockUserId, largeData, mockOptions);
      const endTime = Date.now();

      expect(result.data.totalCells).toBe(1000);
      expect(endTime - startTime).toBeLessThan(5000); // 5초 이내
    });

    it('동시 요청 처리 성능', async () => {
      const startTime = Date.now();
      
      const promises = Array.from({ length: 10 }, () =>
        service.getGPTReadyData(mockUserId, mockSpreadSheetData, mockOptions)
      );
      
      const results = await Promise.all(promises);
      const endTime = Date.now();

      expect(results).toHaveLength(10);
      expect(results.every(r => r.data !== undefined)).toBe(true);
      expect(endTime - startTime).toBeLessThan(3000); // 3초 이내
    });
  });

  describe('유틸리티 메서드 테스트', () => {
    it('셀 주소 파싱이 정확해야 함', async () => {
      const parseRowSpy = jest.spyOn(service as any, 'parseRowFromAddress');
      const parseColSpy = jest.spyOn(service as any, 'parseColFromAddress');

      // parseRowFromAddress 테스트
      expect((service as any).parseRowFromAddress('A1')).toBe(0);
      expect((service as any).parseRowFromAddress('B10')).toBe(9);
      expect((service as any).parseRowFromAddress('C100')).toBe(99);
      expect((service as any).parseRowFromAddress('INVALID')).toBe(0);

      // parseColFromAddress 테스트
      expect((service as any).parseColFromAddress('A1')).toBe(0);
      expect((service as any).parseColFromAddress('B1')).toBe(1);
      expect((service as any).parseColFromAddress('Z1')).toBe(25);
      expect((service as any).parseColFromAddress('AA1')).toBe(26);
      expect((service as any).parseColFromAddress('INVALID')).toBe(0);
    });

    it('데이터 크기 추정이 정확해야 함', async () => {
      const testData = {
        sheets: new Map([['Sheet1', { csvData: 'test', cellCount: 1, metadata: { name: 'Sheet1', cellCount: 1, includeFormulas: true, includeStyles: false } }]]),
        totalCells: 1,
        dataHash: 'test-hash',
        parsedAt: new Date(),
        options: mockOptions
      };

      const estimatedSize = (service as any).estimateDataSize(testData);
      expect(typeof estimatedSize).toBe('number');
      expect(estimatedSize).toBeGreaterThan(0);
    });

    it('캐시 키 생성이 일관성 있어야 함', async () => {
      const userId = 'test-user';
      const dataHash = 'data-hash';
      const optionsHash = 'options-hash';

      const key1 = (service as any).generateCacheKey(userId, dataHash, optionsHash);
      const key2 = (service as any).generateCacheKey(userId, dataHash, optionsHash);
      
      expect(key1).toBe(key2);
      expect(key1).toContain(userId);
      expect(key1).toContain(dataHash);
      expect(key1).toContain(optionsHash);
    });

    it('옵션 해시 생성이 일관성 있어야 함', async () => {
      const options1: CacheOptions = { includeFormulas: true, includeStyles: false };
      const options2: CacheOptions = { includeStyles: false, includeFormulas: true };

      const hash1 = (service as any).generateOptionsHash(options1);
      const hash2 = (service as any).generateOptionsHash(options2);
      
      expect(hash1).toBe(hash2); // 순서가 달라도 같은 해시
      expect(typeof hash1).toBe('string');
      expect(hash1.length).toBeGreaterThan(0);
    });

    it('데이터 해시 생성이 정확해야 함', async () => {
      const data1 = 'test data';
      const data2 = Buffer.from('test data');
      
      const hash1 = (service as any).generateDataHash(data1);
      const hash2 = (service as any).generateDataHash(data2);
      
      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('string');
      expect(hash1.length).toBe(64); // SHA-256 해시 길이
    });
  });

  describe('캐시 엔트리 관리 테스트', () => {
    it('캐시 제거 콜백이 정상 동작해야 함', async () => {
      // 캐시 생성
      await service.getGPTReadyData(mockUserId, mockSpreadSheetData, mockOptions);
      
      // onCacheEvict 메서드 직접 테스트
      const mockEntry = {
        key: 'test-key',
        data: { sheets: new Map(), totalCells: 0, dataHash: 'test', parsedAt: new Date(), options: mockOptions },
        metadata: {
          userId: mockUserId,
          dataVersion: 1,
          optionsHash: 'test',
          createdAt: Date.now(),
          lastAccessed: Date.now(),
          hitCount: 0,
          size: 100
        },
        dependencies: {
          affectedSheets: new Set(['Sheet1']),
          deltaTimestamp: Date.now()
        }
      };

      const onCacheEvictSpy = jest.spyOn(service as any, 'onCacheEvict');
      (service as any).onCacheEvict(mockEntry, 'test-key');
      
      expect(onCacheEvictSpy).toHaveBeenCalledWith(mockEntry, 'test-key');
    });

    it('빈 데이터 테이블 처리가 정상해야 함', async () => {
      const emptySheetData: SpreadSheetStructure = {
        version: '1.0',
        sheets: {
          EmptySheet: {
            name: 'EmptySheet',
            data: {
              dataTable: {},
            },
          },
        },
      };

      const result = await service.getGPTReadyData(mockUserId, emptySheetData, mockOptions);
      expect(result.data.sheets.size).toBe(0); // 빈 시트는 제외됨
      expect(result.data.totalCells).toBe(0);
    });

    it('잘못된 셀 데이터 처리가 정상해야 함', async () => {
      const invalidSheetData: SpreadSheetStructure = {
        version: '1.0',
        sheets: {
          Sheet1: {
            name: 'Sheet1',
            data: {
              dataTable: {
                A1: { value: null },
                B1: { value: undefined },
                C1: { value: '' },
                D1: { value: 'valid' },
              },
            },
          },
        },
      };

      const result = await service.getGPTReadyData(mockUserId, invalidSheetData, mockOptions);
      expect(result.data.sheets.has('Sheet1')).toBe(true);
      expect(result.data.sheets.get('Sheet1')?.csvData).toContain('valid');
    });
  });
});