export interface AddNewVersionSpreadSheetData {
  spreadSheetId: string;
  userId: string;
  spreadSheetVersionNumber: number; // 기존 버전 번호
  jsonData: Record<string, any>; // 새 버전의 시트 데이터
}


export interface LoadSpreadSheetResponse {
  id: string;
  fileName: string;
  version: number;
  lastModified: Date;
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
  isActive: boolean;
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


export class MemoryStateError extends SpreadSheetError {
  constructor(message: string, public userId?: string) {
    super(message, 'MEMORY_STATE_ERROR', { userId });
    this.name = 'MemoryStateError';
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

export type SafeError = {
  message: string;
  code?: string;
  details?: unknown;
};

// 단순화된 에러 래퍼: 어떤 입력이든 SafeError 하나의 형태로 정규화
export function createSafeError(err: unknown): SafeError {
  if (typeof err === 'object' && err !== null) {
    const anyErr = err as any;
    const message = typeof anyErr.message === 'string' ? anyErr.message : 'Unknown error';
    const code = typeof anyErr.code === 'string' ? anyErr.code : undefined;
    const details = anyErr.details !== undefined ? anyErr.details : err;
    return { message, code, details };
  }
  if (typeof err === 'string') {
    return { message: err };
  }
  return { message: 'Unknown error', details: err };
}




