import { TableDataJsonParsingService } from './table-data-json-parsing.service';
import { SpreadWorkbook, ParsingOptions } from './interface/table-data-json-parsing.interface';

describe('TableDataJsonParsingService', () => {
  let service: TableDataJsonParsingService;
  let serviceWithOptions: TableDataJsonParsingService;

  beforeEach(async () => {
    // 기본 서비스 인스턴스 (직접 생성)
    service = new TableDataJsonParsingService();
    
    // 옵션이 있는 서비스 인스턴스
    const customOptions: ParsingOptions = {
      batchSize: 500,
      useParameterizedQueries: true,
      logLevel: 'warn',
      maxTableNameLength: 32
    };
    serviceWithOptions = new TableDataJsonParsingService(customOptions);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(serviceWithOptions).toBeDefined();
  });

  describe('Constructor Options', () => {
    it('should use custom options', () => {
      const customOptions: ParsingOptions = {
        batchSize: 2000,
        useParameterizedQueries: false,
        logLevel: 'error'
      };
      
      const customService = new TableDataJsonParsingService(customOptions);
      expect(customService).toBeDefined();
    });
  });

  describe('Number Precision', () => {
    it('should handle large numbers without exponential notation', () => {
      const workbook: SpreadWorkbook = {
        sheets: {
          'PrecisionTest': {
            data: {
              dataTable: {
                '1': {
                  '0': { value: 1234567890123456 }, // 큰 정수
                  '1': { value: 0.000000000000001 }  // 작은 소수
                }
              }
            },
            tables: [{
              name: 'PrecisionTest',
              row: 0, col: 0, rowCount: 2, colCount: 2,
              columns: [
                { id: 1, name: 'BigInt' },
                { id: 2, name: 'SmallDecimal' }
              ]
            }]
          }
        }
      };

      const result = service.sqlVersionParser(workbook);
      
      // 지수 표기가 아닌 고정 소수점으로 변환되어야 함
      expect(result[0].insertStatements[0]).not.toContain('e+');
      expect(result[0].insertStatements[0]).not.toContain('e-');
      expect(result[0].insertStatements[0]).not.toContain('E+');
      expect(result[0].insertStatements[0]).not.toContain('E-');
    });

    it('should preserve decimal precision for financial data', () => {
      const workbook: SpreadWorkbook = {
        sheets: {
          'Financial': {
            data: {
              dataTable: {
                '1': { '0': { value: 123.456789123456 } },
                '2': { '0': { value: 987.654321987654 } }
              }
            },
            tables: [{
              name: 'Financial',
              row: 0, col: 0, rowCount: 3, colCount: 1,
              columns: [{ id: 1, name: 'Amount' }]
            }]
          }
        }
      };

      const result = service.sqlVersionParser(workbook);
      
      // DECIMAL 타입이 적절한 정밀도로 생성되어야 함
      expect(result[0].createTableStatement).toContain('DECIMAL(');
      expect(result[0].insertStatements[0]).toContain('123.456789123456');
      expect(result[0].insertStatements[0]).toContain('987.654321987654');
    });
  });

  describe('Parameterized Queries', () => {
    it('should generate parameterized inserts when enabled', () => {
      const workbook: SpreadWorkbook = {
        sheets: {
          'ParameterTest': {
            data: {
              dataTable: {
                '1': { '0': { value: 'Test Data' }, '1': { value: 123 } }
              }
            },
            tables: [{
              name: 'ParameterTest',
              row: 0, col: 0, rowCount: 2, colCount: 2,
              columns: [
                { id: 1, name: 'Text' },
                { id: 2, name: 'Number' }
              ]
            }]
          }
        }
      };

      const result = serviceWithOptions.sqlVersionParser(workbook);
      
      // 파라미터화된 쿼리가 생성되어야 함
      expect(result[0].parameterizedInserts).toBeDefined();
      expect(result[0].parameterizedInserts!.length).toBeGreaterThan(0);
      expect(result[0].parameterizedInserts![0].query).toContain('?');
      expect(result[0].parameterizedInserts![0].parameters).toBeDefined();
    });

    it('should handle SQL injection attempts in parameterized mode', () => {
      const workbook: SpreadWorkbook = {
        sheets: {
          'InjectionTest': {
            data: {
              dataTable: {
                '0': { '0': { value: "'; DROP TABLE users; --" } }
              }
            }
          }
        }
      };

      const result = serviceWithOptions.sqlVersionParser(workbook);
      
      if (result[0].parameterizedInserts) {
        // 파라미터 값에는 원본 값이 그대로 포함되어야 함 (DB 드라이버가 처리)
        expect(result[0].parameterizedInserts[0].parameters[0]).toContain("'; DROP TABLE users; --");
        // 쿼리 문자열에는 플레이스홀더만 있어야 함
        expect(result[0].parameterizedInserts[0].query).toContain('?');
        expect(result[0].parameterizedInserts[0].query).not.toContain('DROP TABLE');
      }
    });
  });

  describe('Table Name Length Limits', () => {
    it('should enforce table name length limits', () => {
      const longName = 'a'.repeat(100); // 100자 길이
      const workbook: SpreadWorkbook = {
        sheets: {
          [longName]: {
            data: {
              dataTable: {
                '0': { '0': { value: 'test' } }
              }
            }
          }
        }
      };

      const result = serviceWithOptions.sqlVersionParser(workbook);
      
      // 테이블명이 32자 제한을 준수해야 함
      const tableNameMatch = result[0].createTableStatement.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
      expect(tableNameMatch).toBeTruthy();
      if (tableNameMatch) {
        expect(tableNameMatch[1].length).toBeLessThanOrEqual(32);
      }
    });

    it('should handle table name conflicts with length limits', () => {
      const baseName = 'a'.repeat(30);
      const workbook: SpreadWorkbook = {
        sheets: {
          [baseName + '1']: {
            data: { dataTable: { '0': { '0': { value: 'test1' } } } },
            tables: [{ name: baseName, row: 0, col: 0, rowCount: 1, colCount: 1, columns: [] }]
          },
          [baseName + '2']: {
            data: { dataTable: { '0': { '0': { value: 'test2' } } } },
            tables: [{ name: baseName, row: 0, col: 0, rowCount: 1, colCount: 1, columns: [] }]
          }
        }
      };

      const result = serviceWithOptions.sqlVersionParser(workbook);
      
      expect(result).toHaveLength(2);
      // 두 테이블명이 다르고 길이 제한을 준수해야 함
      const tableName1 = result[0].createTableStatement.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1];
      const tableName2 = result[1].createTableStatement.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1];
      
      expect(tableName1).toBeTruthy();
      expect(tableName2).toBeTruthy();
      expect(tableName1).not.toBe(tableName2);
      expect(tableName1!.length).toBeLessThanOrEqual(32);
      expect(tableName2!.length).toBeLessThanOrEqual(32);
    });
  });

  describe('Performance Optimizations', () => {
    it('should handle iteration performance improvements', () => {
      // 대량 데이터로 성능 테스트
      const largeDataTable: any = {};
      for (let row = 0; row < 1000; row++) {
        largeDataTable[row] = {};
        for (let col = 0; col < 10; col++) {
          largeDataTable[row][col] = { value: `cell_${row}_${col}` };
        }
      }

      const workbook: SpreadWorkbook = {
        sheets: {
          'PerformanceTest': {
            data: { dataTable: largeDataTable }
          }
        }
      };

      const startTime = Date.now();
      const result = service.onlyDataParser(workbook);
      const endTime = Date.now();

      expect(result[0].cells).toHaveLength(10000);
      expect(endTime - startTime).toBeLessThan(3000); // 3초 이내
    });

    it('should use custom batch size', () => {
      const workbook: SpreadWorkbook = {
        sheets: {
          'BatchTest': {
            data: {
              dataTable: Object.fromEntries(
                Array.from({ length: 1200 }, (_, i) => [
                  i.toString(),
                  { '0': { value: `row_${i}` } }
                ])
              )
            },
            tables: [{
              name: 'BatchTest',
              row: 0, col: 0, rowCount: 1200, colCount: 1,
              columns: [{ id: 1, name: 'data' }]
            }]
          }
        }
      };

      const result = serviceWithOptions.sqlVersionParser(workbook);
      
      // 배치 크기가 500이므로 최소 3개의 배치가 생성되어야 함
      expect(result[0].insertStatements.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Logging Levels', () => {
    it('should respect log level settings', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const workbook: SpreadWorkbook = {
        sheets: {
          'LogTest': {
            data: {
              dataTable: {
                '0': { '0': { value: 'test' } }
              }
            }
          }
        }
      };

      // warn 레벨이므로 debug 로그는 출력되지 않아야 함
      serviceWithOptions.onlyDataParser(workbook);
      
      consoleSpy.mockRestore();
    });
  });

  describe('onlyDataParser', () => {
    it('should return empty array when no sheets exist', () => {
      const workbook: SpreadWorkbook = { sheets: {} };
      const result = service.onlyDataParser(workbook);
      expect(result).toEqual([]);
    });

    it('should return empty array for invalid workbook', () => {
      const invalidData = { version: '18.1.4' } as any;
      const result = service.onlyDataParser(invalidData);
      expect(result).toEqual([]);
    });

    it('should parse simple cell data correctly', () => {
      const workbook: SpreadWorkbook = {
        sheets: {
          'Sheet1': {
            data: {
              dataTable: {
                '0': {
                  '0': { value: 'Hello' },
                  '1': { value: 'World' }
                },
                '1': {
                  '0': { value: 123 },
                  '1': { value: 456 }
                }
              }
            }
          }
        }
      };

      const result = service.onlyDataParser(workbook);
      
      expect(result).toHaveLength(1);
      expect(result[0].sheetName).toBe('Sheet1');
      expect(result[0].cells).toHaveLength(4);
      expect(result[0].cells[0]).toEqual({ row: 0, col: 0, value: 'Hello' });
      expect(result[0].cells[1]).toEqual({ row: 0, col: 1, value: 'World' });
      expect(result[0].cells[2]).toEqual({ row: 1, col: 0, value: 123 });
      expect(result[0].cells[3]).toEqual({ row: 1, col: 1, value: 456 });
    });

    it('should parse formulas correctly', () => {
      const workbook: SpreadWorkbook = {
        sheets: {
          '목록': {
            data: {
              dataTable: {
                '3': {
                  '2': { 
                    value: 3483, 
                    formula: 'SUM(목록[비용])'
                  }
                }
              }
            }
          }
        }
      };

      const result = service.onlyDataParser(workbook);
      
      expect(result[0].cells[0]).toEqual({
        row: 3,
        col: 2,
        value: 3483,
        formula: 'SUM(목록[비용])'
      });
    });

    it('should parse table information correctly', () => {
      const workbook: SpreadWorkbook = {
        sheets: {
          '목록': {
            data: { dataTable: {} },
            tables: [{
              name: '목록',
              row: 4,
              col: 2,
              rowCount: 4,
              colCount: 2,
              columns: [
                { id: 1, name: '항목' },
                { id: 4, name: '비용' }
              ]
            }]
          }
        }
      };

      const result = service.onlyDataParser(workbook);
      
      expect(result[0].tables).toHaveLength(1);
      if (result[0].tables) {
        expect(result[0].tables[0]).toEqual({
          name: '목록',
          startRow: 4,
          startCol: 2,
          endRow: 7,
          endCol: 3,
          columns: [
            { id: 1, name: '항목' },
            { id: 4, name: '비용' }
          ]
        });
      }
    });

    it('should handle multiple sheets', () => {
      const workbook: SpreadWorkbook = {
        sheets: {
          'Sheet1': {
            data: {
              dataTable: {
                '0': { '0': { value: 'Sheet1 Data' } }
              }
            }
          },
          'Sheet2': {
            data: {
              dataTable: {
                '0': { '0': { value: 'Sheet2 Data' } }
              }
            }
          }
        }
      };

      const result = service.onlyDataParser(workbook);
      
      expect(result).toHaveLength(2);
      expect(result[0].sheetName).toBe('Sheet1');
      expect(result[1].sheetName).toBe('Sheet2');
    });

    it('should sort cells by row then column', () => {
      const workbook: SpreadWorkbook = {
        sheets: {
          'Sheet1': {
            data: {
              dataTable: {
                '2': { '1': { value: 'D' } },
                '0': { '2': { value: 'B' }, '0': { value: 'A' } },
                '1': { '0': { value: 'C' } },
              }
            }
          }
        }
      };

      const result = service.onlyDataParser(workbook);
      const values = result[0].cells.map(c => c.value);
      
      expect(values).toEqual(['A', 'B', 'C', 'D']);
    });
  });

  describe('onlyStyleParser', () => {
    it('should return empty array when no sheets exist', () => {
      const jsonData = { version: '18.1.4' } as any;
      const result = service.onlyStyleParser(jsonData);
      expect(result).toEqual([]);
    });

    it('should parse cell styles correctly', () => {
      const jsonData = {
        sheets: {
          'Sheet1': {
            data: {
              dataTable: {
                '0': {
                  '0': {
                    value: 'Styled Cell',
                    style: {
                      font: '14px Arial',
                      backColor: '#ff0000'
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = service.onlyStyleParser(jsonData);
      
      expect(result[0].cellStyles).toHaveLength(1);
      expect(result[0].cellStyles[0]).toEqual({
        row: 0,
        col: 0,
        style: {
          font: '14px Arial',
          backColor: '#ff0000'
        }
      });
    });

    it('should expand named styles', () => {
      const jsonData = {
        namedStyles: [
          {
            name: '__builtInStyle1',
            font: '16px Calibri',
            foreColor: '#000000'
          }
        ],
        sheets: {
          'Sheet1': {
            data: {
              dataTable: {
                '0': {
                  '0': {
                    value: 'Named Style',
                    style: '__builtInStyle1'
                  }
                }
              }
            }
          }
        }
      };

      const result = service.onlyStyleParser(jsonData);
      
      expect(result[0].cellStyles[0].style).toEqual({
        name: '__builtInStyle1',
        font: '16px Calibri',
        foreColor: '#000000'
      });
    });

    it('should parse row styles', () => {
      const jsonData = {
        sheets: {
          'Sheet1': {
            data: {
              rowDataArray: [
                null,
                { style: { backColor: '#f0f0f0' } },
                null
              ]
            }
          }
        }
      };

      const result = service.onlyStyleParser(jsonData);
      
      expect(result[0].cellStyles).toContainEqual({
        row: 1,
        col: -1,
        style: { backColor: '#f0f0f0' }
      });
    });

    it('should parse column styles', () => {
      const jsonData = {
        sheets: {
          'Sheet1': {
            data: {
              columnDataArray: [
                null,
                null,
                { style: { width: 100 } }
              ]
            }
          }
        }
      };

      const result = service.onlyStyleParser(jsonData);
      
      expect(result[0].cellStyles).toContainEqual({
        row: -1,
        col: 2,
        style: { width: 100 }
      });
    });

    it('should include global styles', () => {
      const jsonData = {
        namedStyles: [{ name: 'Style1' }],
        tableStyles: [{ name: 'TableStyle1' }],
        sheets: {
          'Sheet1': { data: {} }
        }
      };

      const result = service.onlyStyleParser(jsonData);
      
      expect(result[0].namedStyles).toEqual([{ name: 'Style1' }]);
      expect(result[0].tableStyles).toEqual([{ name: 'TableStyle1' }]);
    });
  });

  describe('sqlVersionParser', () => {
    it('should generate SQL with dynamic DECIMAL precision', () => {
      const workbook: SpreadWorkbook = {
        sheets: {
          'PrecisionTest': {
            data: {
              dataTable: {
                '5': {
                  '2': { value: 123.456789 },
                },
                '6': {
                  '2': { value: 9876.543210 },
                }
              }
            },
            tables: [{
              name: 'PrecisionTest',
              row: 4,
              col: 2,
              rowCount: 3,
              colCount: 1,
              columns: [
                { id: 1, name: 'DecimalCol' }
              ]
            }]
          }
        }
      };

      const result = service.sqlVersionParser(workbook);
      
      expect(result).toHaveLength(1);
      // DECIMAL(10,6)이어야 함 (정수 4자리 + 소수 6자리)
      expect(result[0].createTableStatement).toContain('DecimalCol DECIMAL(10,6)');
    });

    it('should use batch INSERT for large datasets', () => {
      const workbook: SpreadWorkbook = {
        sheets: {
          'BatchTest': {
            data: {
              dataTable: Object.fromEntries(
                Array.from({ length: 2500 }, (_, i) => [
                  i.toString(),
                  { '0': { value: `row_${i}` } }
                ])
              )
            },
            tables: [{
              name: 'BatchTest',
              row: 0,
              col: 0,
              rowCount: 2500,
              colCount: 1,
              columns: [{ id: 1, name: 'data' }]
              
            }]
          }
        }
      };

      const result = service.sqlVersionParser(workbook);
      
      // 배치 INSERT로 여러 개의 INSERT 문이 생성되어야 함
      expect(result[0].insertStatements.length).toBeGreaterThan(1);
      // 각 INSERT 문에는 VALUES가 여러 개 포함되어야 함
      expect(result[0].insertStatements[0]).toContain('VALUES\n  (');
    });

    it('should handle table name conflicts', () => {
      const workbook: SpreadWorkbook = {
        sheets: {
          'Sheet1': {
            data: {
              dataTable: { '0': { '0': { value: 'data1' } } }
            },
            tables: [{ name: 'TestTable', row: 0, col: 0, rowCount: 1, colCount: 1, columns: [] }]
          },
          'Sheet2': {
            data: {
              dataTable: { '0': { '0': { value: 'data2' } } }
            },
            tables: [{ name: 'TestTable', row: 0, col: 0, rowCount: 1, colCount: 1, columns: [] }]
          }
        }
      };

      const result = service.sqlVersionParser(workbook);
      
      expect(result).toHaveLength(2);
      expect(result[0].createTableStatement).toContain('TestTable');
      expect(result[1].createTableStatement).toContain('TestTable_2');
    });

    it('should generate SQL for table-based data', () => {
      const workbook: SpreadWorkbook = {
        sheets: {
          '목록': {
            data: {
              dataTable: {
                '5': {
                  '2': { value: '항목1' },
                  '3': { value: 24 }
                },
                '6': {
                  '2': { value: '항목2' },
                  '3': { value: 3444 }
                }
              }
            },
            tables: [{
              name: '목록',
              row: 4,
              col: 2,
              rowCount: 3,
              colCount: 2,
              columns: [
                { id: 1, name: '항목' },
                { id: 4, name: '비용' }
              ]
            }]
          }
        }
      };

      const result = service.sqlVersionParser(workbook);
      
      expect(result).toHaveLength(1);
      expect(result[0].createTableStatement).toContain('CREATE TABLE IF NOT EXISTS 목록');
      expect(result[0].createTableStatement).toContain('항목');
      expect(result[0].createTableStatement).toContain('비용');
      expect(result[0].insertStatements).toHaveLength(1);
      expect(result[0].insertStatements[0]).toContain("VALUES\n  ('항목1', 24),\n  ('항목2', 3444)");
    });

    it('should generate SQL for sheet without tables', () => {
      const workbook: SpreadWorkbook = {
        sheets: {
          'Sheet1': {
            data: {
              dataTable: {
                '0': {
                  '0': { value: 'A1' },
                  '1': { value: 'B1' },
                  '2': { value: 'C1' }
                },
                '1': {
                  '0': { value: 'A2' },
                  '1': { value: 'B2' },
                  '2': { value: 'C2' }
                }
              }
            }
          }
        }
      };

      const result = service.sqlVersionParser(workbook);
      
      expect(result).toHaveLength(1);
      expect(result[0].createTableStatement).toContain('CREATE TABLE IF NOT EXISTS Sheet1');
      expect(result[0].createTableStatement).toContain('col_0 TEXT');
      expect(result[0].createTableStatement).toContain('col_1 TEXT');
      expect(result[0].createTableStatement).toContain('col_2 TEXT');
      expect(result[0].insertStatements).toHaveLength(1);
    });

    it('should sanitize table names', () => {
      const jsonData = {
        sheets: {
          '특수!문자@포함#시트': {
            data: {
              dataTable: {
                '0': { '0': { value: 'test' } }
              }
            }
          }
        }
      };

      const result = service.sqlVersionParser(jsonData);
      
      expect(result[0].createTableStatement).toContain('특수_문자_포함_시트');
    });

    it('should infer column types correctly', () => {
      const jsonData = {
        sheets: {
          'TypeTest': {
            data: {
              dataTable: {
                '5': {
                  '2': { value: 123 },
                  '3': { value: 'Text' },
                  '4': { value: 45.67 },
                  '5': { value: true }
                },
                '6': {
                  '2': { value: 456 },
                  '3': { value: 'More text' },
                  '4': { value: 78.90 },
                  '5': { value: false }
                }
              }
            },
            tables: [{
              name: 'TypeTest',
              row: 4,
              col: 2,
              rowCount: 3,
              colCount: 4,
              columns: [
                { id: 1, name: 'IntCol' },
                { id: 2, name: 'TextCol' },
                { id: 3, name: 'DecimalCol' },
                { id: 4, name: 'BoolCol' }
              ]
            }]
          }
        }
      };

      const result = service.sqlVersionParser(jsonData);
      
      expect(result[0].createTableStatement).toContain('IntCol INT');
      expect(result[0].createTableStatement).toContain('TextCol VARCHAR(255)');
      expect(result[0].createTableStatement).toContain('DecimalCol DECIMAL(4,2)');
      expect(result[0].createTableStatement).toContain('BoolCol BOOLEAN');
    });

    it('should handle SQL injection in values', () => {
      const workbook: SpreadWorkbook = {
        sheets: {
          'Sheet1': {
            data: {
              dataTable: {
                '0': { '0': { value: "It's a test" } },
                '1': { '0': { value: "'; DROP TABLE users; --" } }
              }
            }
          }
        }
      };

      const result = service.sqlVersionParser(workbook);
      
      expect(result[0].insertStatements[0]).toContain("'It''s a test'");
      expect(result[0].insertStatements[0]).toContain("'''; DROP TABLE users; --'");
    });

    it('should skip footer rows in tables', () => {
      const jsonData = {
        sheets: {
          '목록': {
            data: {
              dataTable: {
                '5': { '2': { value: '항목1' }, '3': { value: 24 } },
                '6': { '2': { value: '항목2' }, '3': { value: 30 } },
                '7': { 
                  '2': { value: '합계' }, 
                  '3': { value: 54, formula: 'SUM(C5:C6)' } 
                }
              }
            },
            tables: [{
              name: '목록',
              row: 4,
              col: 2,
              rowCount: 4,
              colCount: 2,
              columns: [
                { id: 1, name: '항목' },
                { id: 4, name: '비용', footerFormula: 'sum' }
              ]
            }]
          }
        }
      };

      const result = service.sqlVersionParser(jsonData);
      
      expect(result[0].insertStatements).toHaveLength(1);
      expect(result[0].insertStatements[0]).not.toContain('합계');
    });

    it('should handle null and undefined values', () => {
      const jsonData = {
        sheets: {
          'Sheet1': {
            data: {
              dataTable: {
                '0': {
                  '0': { value: null },
                  '1': { value: undefined },
                  '2': { value: 'Valid' }
                }
              }
            }
          }
        }
      };

      const result = service.sqlVersionParser(jsonData);
      
      expect(result[0].insertStatements[0]).toContain('NULL, NULL,');
    });

    // 추가 테스트 케이스들
    it('should handle malformed data gracefully', () => {
      const jsonData = {
        sheets: {
          'Sheet1': {
            data: {
              dataTable: {
                '0': null, // 잘못된 형태의 데이터
                '1': 'invalid', // 문자열이 와서는 안 되는 곳
                '2': { '0': { value: 'Valid' } }
              }
            }
          }
        }
      } as any;

      expect(() => service.onlyDataParser(jsonData)).not.toThrow();
      const result = service.onlyDataParser(jsonData);
      expect(result[0].cells).toHaveLength(1);
    });

    it('should handle extremely large values', () => {
      const largeValue = 'x'.repeat(10000);
      const jsonData = {
        sheets: {
          'Sheet1': {
            data: {
              dataTable: {
                '0': { '0': { value: largeValue } }
              }
            }
          }
        }
      };

      const result = service.sqlVersionParser(jsonData);
      expect(result[0].createTableStatement).toContain('TEXT'); // 큰 값은 TEXT로 처리되어야 함
    });

    it('should handle circular references in named styles', () => {
      const namedStyles = [
        { name: 'style1', baseStyle: 'style2' },
        { name: 'style2', baseStyle: 'style1' }
      ];

      const jsonData = {
        namedStyles,
        sheets: {
          'Sheet1': {
            data: {
              dataTable: {
                '0': { '0': { value: 'test', style: 'style1' } }
              }
            }
          }
        }
      };

      expect(() => service.onlyStyleParser(jsonData)).not.toThrow();
    });
  });

  // 성능 테스트 추가
  describe('Performance Tests', () => {
    it('should handle large datasets efficiently', () => {
      const largeDataTable: any = {};
      
      // 1000x1000 크기의 데이터 생성
      for (let row = 0; row < 1000; row++) {
        largeDataTable[row] = {};
        for (let col = 0; col < 100; col++) {
          largeDataTable[row][col] = { value: `cell_${row}_${col}` };
        }
      }

      const jsonData = {
        sheets: {
          'LargeSheet': {
            data: { dataTable: largeDataTable }
          }
        }
      };

      const startTime = Date.now();
      const result = service.onlyDataParser(jsonData);
      const endTime = Date.now();

      expect(result[0].cells).toHaveLength(100000);
      expect(endTime - startTime).toBeLessThan(5000); // 5초 이내에 완료되어야 함
    });
  });

  // 통합 테스트 추가
  describe('Integration Tests', () => {
    it('should parse complex spreadsheet with all features', () => {
      const complexJsonData = {
        namedStyles: [
          { name: 'headerStyle', font: 'bold 14px Arial', backColor: '#cccccc' }
        ],
        tableStyles: [
          { name: 'tableStyle1', borderStyle: 'solid' }
        ],
        sheets: {
          '복합시트': {
            data: {
              dataTable: {
                '0': { 
                  '0': { value: '제품명', style: 'headerStyle' },
                  '1': { value: '가격', style: 'headerStyle' }
                },
                '1': { 
                  '0': { value: '제품A' },
                  '1': { value: 10000 }
                },
                '2': { 
                  '0': { value: '제품B' },
                  '1': { value: 20000 }
                },
                '3': { 
                  '0': { value: '합계' },
                  '1': { value: 30000, formula: 'SUM(B2:B3)' }
                }
              },
              rowDataArray: [
                null,
                { style: { height: 25 } }
              ],
              columnDataArray: [
                { style: { width: 100 } },
                { style: { width: 80 } }
              ]
            },
            tables: [{
              name: '제품목록',
              row: 0,
              col: 0,
              rowCount: 4,
              colCount: 2,
              columns: [
                { id: 1, name: '제품명' },
                { id: 2, name: '가격', footerFormula: 'sum' }
              ]
            }]
          }
        }
      };

      const dataResult = service.onlyDataParser(complexJsonData);
      const styleResult = service.onlyStyleParser(complexJsonData);
      const sqlResult = service.sqlVersionParser(complexJsonData);

      // 데이터 파싱 검증
      expect(dataResult).toHaveLength(1);
      expect(dataResult[0].cells).toHaveLength(8);
      expect(dataResult[0].tables).toHaveLength(1);

      // 스타일 파싱 검증
      expect(styleResult[0].cellStyles.length).toBeGreaterThan(0);
      expect(styleResult[0].namedStyles).toBeDefined();

      // SQL 생성 검증
      expect(sqlResult).toHaveLength(1);
      expect(sqlResult[0].createTableStatement).toContain('제품목록');
      expect(sqlResult[0].insertStatements).toHaveLength(1); // 배치 INSERT
    });
  });
});