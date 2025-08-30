// ===============================
// Spreadsheet Type Definitions
// ===============================

// DeltaAction enum 정의 (Prisma 스키마에서 삭제되었으므로 직접 정의)
export enum DeltaAction {
  SET_CELL_VALUE = 'SET_CELL_VALUE',
  SET_CELL_FORMULA = 'SET_CELL_FORMULA', 
  SET_CELL_STYLE = 'SET_CELL_STYLE',
  DELETE_CELLS = 'DELETE_CELLS',
  INSERT_ROWS = 'INSERT_ROWS',
  DELETE_ROWS = 'DELETE_ROWS',
  INSERT_COLUMNS = 'INSERT_COLUMNS',
  DELETE_COLUMNS = 'DELETE_COLUMNS',
  ADD_SHEET = 'ADD_SHEET',
  DELETE_SHEET = 'DELETE_SHEET',
  RENAME_SHEET = 'RENAME_SHEET'
}

// ===============================
// Core Spreadsheet Types
// ===============================

export interface CellStyle {
  backgroundColor?: string;
  color?: string;
  fontWeight?: 'normal' | 'bold' | 'bolder' | 'lighter' | number;
  fontSize?: number;
  fontFamily?: string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  border?: {
    top?: BorderStyle;
    right?: BorderStyle;
    bottom?: BorderStyle;
    left?: BorderStyle;
  };
  [key: string]: unknown;
}

export interface BorderStyle {
  style: 'none' | 'solid' | 'dashed' | 'dotted' | 'double';
  color: string;
  width: number;
}

export interface CellData {
  value?: string | number | boolean | null;
  formula?: string;
  style?: CellStyle;
  [key: string]: unknown;
}

export interface DataTable {
  [cellAddress: string]: CellData;
}

export interface SheetData {
  dataTable: DataTable;
  [key: string]: unknown;
}

export interface Sheet {
  name: string;
  data: SheetData;
  [key: string]: unknown;
}

export interface SpreadSheetStructure {
  version: string;
  sheets: {
    [sheetName: string]: Sheet;
  };
  [key: string]: unknown;
}

// ===============================
// SpreadJS Format Types
// ===============================

export interface SpreadJSFormat {
  version?: string;
  name?: string;
  docProps?: any;
  sheetCount?: number;
  frc?: number;
  tabStripRatio?: number;
  sheets?: {
    [sheetName: string]: SpreadJSSheet;
  };
  [key: string]: any;
}

export interface SpreadJSSheet {
  name: string;
  isSelected?: boolean;
  rowCount?: number;
  columnCount?: number;
  visible?: number;
  frozenRowCount?: number;
  frozenColCount?: number;
  theme?: any;
  data?: {
    dataTable?: SpreadJSDataTable;
    [key: string]: any;
  };
  [key: string]: any;
}

export interface SpreadJSDataTable {
  [rowIndex: string]: {
    [colIndex: string]: SpreadJSCellData;
  };
}

export interface SpreadJSCellData {
  value?: any;
  formula?: string;
  style?: SpreadJSCellStyle;
  [key: string]: any;
}

export interface SpreadJSCellStyle {
  hAlign?: number | string;
  vAlign?: number | string;
  font?: string;
  fontSize?: string | number;
  fontFamily?: string;
  fontWeight?: string | number;
  backColor?: string;
  foreColor?: string;
  border?: any;
  [key: string]: any;
}

// ===============================
// Delta Types
// ===============================

export interface CellDelta {
  action: DeltaAction;
  spreadSheetId: string; // 스프레드시트 ID 추가
  parsedSheetName: string;
  cellAddress?: string;
  range?: string;
  value?: string | number | boolean | null;
  formula?: string;
  style?: CellStyle;
  rowIndex?: number;
  columnIndex?: number;
  count?: number;
  timestamp: number;
}

// ===============================
// Memory Management Types
// ===============================

export interface SpreadSheetMetadata {
  version: number;
  lastActivity: Date;
  saveScheduled: boolean;
  isDirty: boolean;
}

export interface MemorySpreadSheetData {
  id: string;
  userId: string;
  baselineData: SpreadSheetStructure;
  pendingDeltas: CellDelta[];
  parsedCache: GPTReadyData | null;
  metadata: SpreadSheetMetadata;
}

// ===============================
// Response Types
// ===============================

export interface LoadSpreadSheetResponse {
  id: string;
  fileName: string;
  // data: SpreadSheetStructure;
  version: number;
  lastModified: Date;
}

export interface GPTSheetData {
  csvData: string;
  cellCount: number;
  metadata: {
    name: string;
    cellCount: number;
    includeFormulas?: boolean;
    includeStyles?: boolean;
  };
}

export interface GPTReadyData {
  sheets: Map<string, GPTSheetData>;
  totalCells: number;
  dataHash: string;
  parsedAt: Date;
  options?: ParsingOptions;
}

export interface ApplyDeltaResponse {
  success: boolean;
  version: number;
}

export interface ForceSaveResponse {
  success: boolean;
  savedDeltas: number;
}

export interface DeleteResponse {
  success: boolean;
}

export interface SpreadSheetListItem {
  id: string;
  fileName: string;
  fileSize: number | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  lastOpened: Date;
  sheetCount: number;
  chatCount: number;
  editCount: number;
  isActive: boolean;
}

// ===============================
// Cache-related Types (새로 추가)
// ===============================

export interface CacheOptions {
  includeFormulas?: boolean;
  includeStyles?: boolean;
  maxSheets?: number;
  sheetNames?: string[];
  compressionLevel?: number;
  ttl?: number; // Time to live in seconds
}

export interface CacheResult<T> {
  data: T;
  source: 'memory' | 'redis' | 'generated' | 'pending';
  timing: number; // Response time in milliseconds
  cached: boolean;
  hitCount?: number;
}

export interface InvalidationResult {
  success: boolean;
  invalidatedCount: number;
  affectedSheets: string[];
  error?: string;
}

export interface OptimizationResult {
  success: boolean;
  optimizedCount: number;
  freedMemory: number; // Bytes freed
  currentMemoryUsage: number; // Current memory usage in bytes
  error?: string;
}

export interface ParsingOptions {
  includeFormulas?: boolean;
  includeStyles?: boolean;
  maxSheets?: number;
  sheetNames?: string[];
  cellLimit?: number;
  compressionThreshold?: number;
}

export interface CacheMetrics {
  // Hit rates
  l1HitRate: number; // L1 cache hit rate (%)
  l2HitRate: number; // L2 cache hit rate (%)
  overallHitRate: number; // Overall hit rate (%)
  
  // Response times
  avgResponseTime: number; // Average response time (ms)
  p95ResponseTime: number; // 95th percentile response time (ms)
  p99ResponseTime: number; // 99th percentile response time (ms)
  
  // Memory usage
  memoryUsage: number; // Current memory usage (bytes)
  memoryHitCount: number; // Number of memory hits
  
  // Redis performance
  redisLatency: number; // Average Redis latency (ms)
  redisConnectionCount: number; // Number of Redis connections
}

export interface CacheConfiguration {
  memory: {
    maxSize: number; // Maximum number of entries
    maxAge: number; // TTL in milliseconds
    maxUserCacheSize: number; // Maximum cache size per user (bytes)
  };
  redis: {
    ttl: number; // TTL in seconds
    keyPrefix: string;
    compressionThreshold: number; // Minimum size to compress (bytes)
  };
  performance: {
    compressionLevel: number; // 1-9
    batchSize: number;
    batchTimeout: number; // milliseconds
  };
}

export interface CacheEntry {
  key: string;
  data: GPTReadyData;
  metadata: CacheEntryMetadata;
  dependencies: CacheDependencies;
}

export interface CacheEntryMetadata {
  userId: string;
  dataVersion: number;
  optionsHash: string;
  createdAt: number;
  lastAccessed: number;
  hitCount: number;
  size: number; // Size in bytes
  ttl?: number; // TTL in seconds
}

export interface CacheDependencies {
  affectedSheets: Set<string>;
  deltaTimestamp: number;
  dataHash: string;
}

export interface CacheStats {
  l1Hits: number;
  l1Misses: number;
  l2Hits: number;
  l2Misses: number;
  totalRequests: number;
  avgResponseTime: number;
  memoryUsage: number;
  redisLatency: number;
}

// ===============================
// AI Service Types (새로 추가)
// ===============================

export interface AnalysisOptions {
  includeFormulas?: boolean;
  includeStyles?: boolean;
  maxSheets?: number;
  sheetNames?: string[];
  maxTokens?: number;
  analysisContext?: string;
  temperature?: number;
  model?: string;
}

export interface AIAnalysisResult {
  analysis: string;
  responseTime: number;
  model: string;
  chainMetadata?: {
    intent?: string;
    processingSteps?: string[];
    promptId?: string;
  };
}

export interface PromptOptions {
  includeMetadata?: boolean;
  includeDataSummary?: boolean;
  contextFormat?: 'csv' | 'json' | 'table';
  maxPromptLength?: number;
}

// ===============================
// Error Types
// ===============================

export class SpreadSheetError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'SpreadSheetError';
  }
}

export class ValidationError extends SpreadSheetError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class DeltaValidationError extends ValidationError {
  constructor(message: string, public delta: Partial<CellDelta>) {
    super(message, { delta });
    this.name = 'DeltaValidationError';
  }
}

export class MemoryStateError extends SpreadSheetError {
  constructor(message: string, public userId?: string) {
    super(message, 'MEMORY_STATE_ERROR', { userId });
    this.name = 'MemoryStateError';
  }
}

export class CacheError extends SpreadSheetError {
  constructor(message: string, public operation?: string, public cacheLevel?: 'l1' | 'l2' | 'redis') {
    super(message, 'CACHE_ERROR', { operation, cacheLevel });
    this.name = 'CacheError';
  }
}

export class AIServiceError extends SpreadSheetError {
  constructor(message: string, public aiProvider?: string, public model?: string) {
    super(message, 'AI_SERVICE_ERROR', { aiProvider, model });
    this.name = 'AIServiceError';
  }
}

// ===============================
// Type Guards
// ===============================

export function isValidCellAddress(address: string): boolean {
  return /^[A-Z]+[0-9]+$/.test(address);
}

export function isValidRange(range: string): boolean {
  return /^[A-Z]+[0-9]+:[A-Z]+[0-9]+$/.test(range);
}

export function isSpreadSheetStructure(data: unknown): data is SpreadSheetStructure {
  if (!data || typeof data !== 'object') return false;
  
  const obj = data as Record<string, unknown>;
  if (typeof obj.version !== 'string' || !obj.sheets || typeof obj.sheets !== 'object' || obj.sheets === null) {
    return false;
  }
  return (
    typeof obj.version === 'string' &&
    obj.sheets &&
    typeof obj.sheets === 'object' &&
    obj.sheets !== null
  );
}

export function isCellData(data: unknown): data is CellData {
  if (!data || typeof data !== 'object') return false;
  
  const obj = data as Record<string, unknown>;
  return (
    (obj.value === undefined || 
     typeof obj.value === 'string' || 
     typeof obj.value === 'number' || 
     typeof obj.value === 'boolean' || 
     obj.value === null) &&
    (obj.formula === undefined || typeof obj.formula === 'string') &&
    (obj.style === undefined || (typeof obj.style === 'object' && obj.style !== null))
  );
}

export function hasRequiredDeltaFields(delta: Partial<CellDelta>): delta is CellDelta {
  return !!(
    delta.action && 
    delta.parsedSheetName && 
    typeof delta.timestamp === 'number'
  );
}

export function isValidDeltaAction(action: unknown): action is DeltaAction {
  return Object.values(DeltaAction).includes(action as DeltaAction);
}

export function isCacheOptions(options: unknown): options is CacheOptions {
  if (!options || typeof options !== 'object') return true; // 빈 옵션은 유효
  
  const obj = options as Record<string, unknown>;
  return (
    (obj.includeFormulas === undefined || typeof obj.includeFormulas === 'boolean') &&
    (obj.includeStyles === undefined || typeof obj.includeStyles === 'boolean') &&
    (obj.maxSheets === undefined || (typeof obj.maxSheets === 'number' && obj.maxSheets > 0)) &&
    (obj.sheetNames === undefined || Array.isArray(obj.sheetNames)) &&
    (obj.ttl === undefined || (typeof obj.ttl === 'number' && obj.ttl > 0))
  );
}

export function isGPTReadyData(data: unknown): data is GPTReadyData {
  if (!data || typeof data !== 'object') return false;
  
  const obj = data as Record<string, unknown>;
  return (
    obj.sheets instanceof Map &&
    typeof obj.totalCells === 'number' &&
    typeof obj.dataHash === 'string' &&
    obj.parsedAt instanceof Date
  );
}

export function isCacheResult<T>(result: unknown): result is CacheResult<T> {
  if (!result || typeof result !== 'object') return false;
  
  const obj = result as Record<string, unknown>;
  return (
    obj.data !== undefined &&
    typeof obj.source === 'string' &&
    ['memory', 'redis', 'generated'].includes(obj.source) &&
    typeof obj.timing === 'number' &&
    typeof obj.cached === 'boolean'
  );
}

// ===============================
// Utility Types
// ===============================

export type SafeError = {
  message: string;
  code?: string;
  details?: unknown;
};

export function createSafeError(error: unknown): SafeError {
  if (error instanceof SpreadSheetError) {
    return {
      message: error.message,
      code: error.code,
      details: error.details
    };
  }
  
  if (error instanceof Error) {
    return {
      message: error.message,
      code: 'UNKNOWN_ERROR'
    };
  }
  
  if (typeof error === 'string') {
    return {
      message: error,
      code: 'STRING_ERROR'
    };
  }
  
  return {
    message: 'Unknown error occurred',
    code: 'UNKNOWN_ERROR',
    details: error
  };
}

// ===============================
// Cache Utility Types
// ===============================

export type CacheLevel = 'l1' | 'l2' | 'redis' | 'database';
export type CacheOperation = 'get' | 'set' | 'delete' | 'invalidate' | 'optimize';
export type CacheSource = 'memory' | 'redis' | 'generated';

export interface CacheKey {
  userId: string;
  dataHash: string;
  optionsHash: string;
}

export interface CacheHit {
  level: CacheLevel;
  key: string;
  responseTime: number;
  dataSize: number;
}

export interface CacheMiss {
  level: CacheLevel;
  key: string;
  reason: 'not_found' | 'expired' | 'invalid' | 'corrupted';
}

// ===============================
// Performance Monitoring Types
// ===============================

export interface PerformanceMetrics {
  responseTime: {
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  };
  throughput: {
    requestsPerSecond: number;
    cacheHitsPerSecond: number;
    cacheMissesPerSecond: number;
  };
  memory: {
    usage: number; // bytes
    peak: number; // bytes
    gcCollections: number;
  };
  errors: {
    count: number;
    rate: number; // errors per second
    types: Record<string, number>;
  };
}

export interface AlertThreshold {
  metric: keyof PerformanceMetrics;
  operator: '>' | '<' | '==' | '>=' | '<=';
  value: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// ===============================
// Configuration Types
// ===============================

export interface ServiceConfiguration {
  cache: CacheConfiguration;
  ai: {
    provider: 'openai' | 'anthropic' | 'google';
    model: string;
    maxTokens: number;
    temperature: number;
    timeout: number; // milliseconds
  };
  monitoring: {
    enabled: boolean;
    alertThresholds: AlertThreshold[];
    metricsInterval: number; // milliseconds
  };
  performance: {
    maxConcurrentRequests: number;
    requestTimeout: number; // milliseconds
    retryCount: number;
    circuitBreakerThreshold: number;
  };
}

// ===============================
// DTOs (Data Transfer Objects)
// ===============================

export interface CreateSpreadSheetDto {
  userId: string;
  fileName: string;
  chatId?: string;
  initialData?: SpreadSheetStructure;
}

export interface ApplyDeltaDto {
  delta: CellDelta;
  options?: {
    skipValidation?: boolean;
    forceSave?: boolean;
  };
}

export interface AnalyzeSpreadSheetDto {
  question: string;
  includeFormulas?: boolean;
  includeStyles?: boolean;
  maxTokens?: number;
  context?: string;
  sheetNames?: string[];
}

export interface CacheStatsDto {
  timeRange: 'hour' | 'day' | 'week' | 'month';
  includeDetails?: boolean;
  groupBy?: 'user' | 'sheet' | 'operation';
}