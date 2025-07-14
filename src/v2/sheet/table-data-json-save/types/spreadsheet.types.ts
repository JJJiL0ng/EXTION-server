// ===============================
// Spreadsheet Type Definitions
// ===============================

import { DeltaAction } from '@prisma/client';

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
// Delta Types
// ===============================

export interface CellDelta {
  action: DeltaAction;
  sheetName: string;
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
  data: SpreadSheetStructure;
  version: number;
  lastModified: Date;
}

export interface GPTSheetData {
  csvData: string;
  cellCount: number;
  metadata: {
    name: string;
    cellCount: number;
  };
}

export interface GPTReadyData {
  sheets: Map<string, GPTSheetData>;
  totalCells: number;
  dataHash: string;
  parsedAt: Date;
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
  compressedSize: number;
  chatCount: number;
  editCount: number;
  isActive: boolean;
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
    delta.sheetName && 
    typeof delta.timestamp === 'number'
  );
}

export function isValidDeltaAction(action: unknown): action is DeltaAction {
  return Object.values(DeltaAction).includes(action as DeltaAction);
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