// src/common/interfaces/firebase.interface.ts - Firebase 인터페이스
export interface FirebaseUser {
    id: string;
    email: string;
    displayName: string;
    photoURL?: string;
    createdAt: Date;
    lastActiveAt: Date;
    preferences: {
      sidebarCollapsed: boolean;
      theme: 'light' | 'dark';
      defaultFileFormat: 'xlsx' | 'csv';
    };
    statistics: {
      totalChats: number;
      totalSpreadsheets: number;
      lastLoginAt: Date;
    };
  }
  
  export interface FirebaseChat {
    id: string;
    userId: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
    messageCount: number;
    lastMessage?: {
      content: string;
      timestamp: Date;
      role: 'user' | 'Extion ai';
      type: string;
    };
    spreadsheetData?: {
      hasSpreadsheet: boolean;
      fileName?: string;
      totalSheets: number;
      activeSheetIndex: number;
      sheetNames: string[];
      lastModifiedAt: Date;
    };
    status: 'active' | 'archived' | 'deleted';
    analytics: {
      formulaCount: number;
      artifactCount: number;
      dataGenerationCount: number;
      dataFixCount: number;
    };
  }
  
  export interface FirebaseMessage {
    id: string;
    chatId: string;
    role: 'user' | 'Extion ai' | 'system';
    content: string;
    timestamp: Date;
    type: 'text' | 'file_upload' | 'formula' | 'artifact' | 'data_generation' | 'data_fix';
    mode?: 'normal' | 'formula' | 'artifact' | 'datageneration' | 'datafix';
    sheetContext?: {
      sheetIndex?: number;
      sheetName: string;
      affectedCells?: string[];
      totalRows?: number;
      totalColumns?: number;
      headers?: string[];
    };
    formulaData?: {
      formula: string;
      cellAddress: string;
      functionType?: string;
      explanation?: {
        korean?: string;
        english?: string;
      } | string;
      examples?: Array<{
        range: string;
        formula: string;
        description: string;
      }>;
      alternatives?: Array<{
        formula: string;
        reason: string;
        complexity?: number;
      }>;
      warning?: string;
      sheetIndex?: number;
      crossSheetReference?: boolean;
    };
    artifactData?: {
      type: 'chart' | 'table' | 'analysis';
      title: string;
      codeSnippet?: string;
      artifactId: string;
    };
    dataChangeInfo?: {
      changeType: 'generation' | 'modification' | 'sorting' | 'filtering';
      affectedSheets: number[];
      rowsChanged: number;
      columnsChanged: number;
      summary: string;
    };
    fileUploadInfo?: {
      fileName: string;
      fileSize: number;
      fileType: 'xlsx' | 'csv';
      sheetsAdded: string[];
      processingTime: number;
    };
  }