import { 
  IsString, 
  IsNotEmpty, 
  IsOptional, 
  IsObject, 
  IsEnum, 
  IsNumber, 
  IsArray, 
  IsBoolean,
  IsUUID,
  ValidateNested,
  Min,
  Max,
  Length,
  Matches
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { DeltaAction } from '@prisma/client';

// ===============================
// SpreadJS Format Interface
// ===============================
export interface SpreadJSFormat {
  version?: string;
  name?: string;
  docProps?: any;
  sheetCount?: number;
  frc?: number;
  tabStripRatio?: number;
  sheets?: {
    [sheetName: string]: {
      name: string;
      isSelected?: boolean;
      rowCount?: number;
      columnCount?: number;
      visible?: number;
      frozenRowCount?: number;
      frozenColCount?: number;
      theme?: any;
      data?: {
        dataTable?: {
          [cellAddress: string]: any;
        };
        [key: string]: any;
      };
      [key: string]: any;
    };
  };
  [key: string]: any;
}

// ===============================
// 스프레드시트 생성 DTO
// ===============================
export class CreateSpreadSheetDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  @Matches(/^[^<>:"/\\|?*\x00-\x1f]+$/, {
    message: '파일명에 사용할 수 없는 문자가 포함되어 있습니다.'
  })
  fileName: string;

  @IsString()
  @IsNotEmpty()
  @IsUUID('4', { message: '올바른 스프레드시트 ID 형식이 아닙니다.' })
  spreadsheetId: string;

  @IsString()
  @IsNotEmpty()
  @IsUUID('4', { message: '올바른 채팅 ID 형식이 아닙니다.' })
  chatId: string;

  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsOptional()
  @IsObject()
  initialData?: Record<string, any> | SpreadJSFormat;
}

// ===============================
// 스프레드시트 로드 DTO
// ===============================
export class LoadSpreadSheetDto {
  @IsString()
  @IsNotEmpty()
  @IsUUID('4', { message: '올바른 스프레드시트 ID 형식이 아닙니다.' })
  spreadSheetId: string;

  @IsString()
  @IsNotEmpty()
  userId: string;
}

// ===============================
// 셀 스타일 DTO
// ===============================
export class CellStyleDto {
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: '올바른 HEX 색상 코드를 입력해주세요. (예: #FF0000)'
  })
  backgroundColor?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: '올바른 HEX 색상 코드를 입력해주세요. (예: #000000)'
  })
  color?: string;

  @IsOptional()
  @IsString()
  fontWeight?: string;

  @IsOptional()
  @IsNumber()
  @Min(6)
  @Max(72)
  fontSize?: number;

  @IsOptional()
  @IsString()
  fontFamily?: string;

  @IsOptional()
  @IsString()
  textAlign?: 'left' | 'center' | 'right' | 'justify';

  @IsOptional()
  @IsString()
  verticalAlign?: 'top' | 'middle' | 'bottom';

  @IsOptional()
  @IsObject()
  border?: {
    top?: { style: string; color: string; width: number };
    right?: { style: string; color: string; width: number };
    bottom?: { style: string; color: string; width: number };
    left?: { style: string; color: string; width: number };
  };
}

// ===============================
// 델타 적용 DTO
// ===============================
export class ApplyDeltaDto {
  @IsEnum(DeltaAction, {
    message: '올바른 델타 액션을 선택해주세요.'
  })
  action: DeltaAction;

  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  parsedSheetName: string;

  @IsString()
  @IsNotEmpty()
  spreadSheetId: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]+[0-9]+$/, {
    message: '올바른 셀 주소 형식이 아닙니다. (예: A1, B2, AA10)'
  })
  cellAddress?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]+[0-9]+:[A-Z]+[0-9]+$/, {
    message: '올바른 범위 형식이 아닙니다. (예: A1:B5, C1:D10)'
  })
  range?: string;

  @IsOptional()
  value?: any;

  @IsOptional()
  @IsString()
  @Matches(/^=.+/, {
    message: '수식은 = 기호로 시작해야 합니다.'
  })
  formula?: string;

  @IsOptional()
  @IsObject()
  style?: CellStyleDto;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1048575)
  rowIndex?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(16383)
  columnIndex?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  count?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  userId: string;
}

// ===============================
// 일괄 델타 적용 DTO
// ===============================
export class ApplyBatchDeltasDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApplyDeltaDto)
  @Max(100, { message: '한 번에 최대 100개의 델타만 적용할 수 있습니다.' })
  deltas: ApplyDeltaDto[];
}

// ===============================
// 스프레드시트 쿼리 DTO
// ===============================
export class SpreadSheetListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  sortBy?: 'fileName' | 'createdAt' | 'updatedAt' | 'lastOpened' | 'fileSize' = 'lastOpened';

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @IsString()
  @Length(0, 100)
  search?: string;
}

// ===============================
// GPT 분석 요청 DTO
// ===============================
export class GPTAnalysisRequestDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 1000)
  question: string;

  @IsOptional()
  @IsString()
  targetSheet?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]+[0-9]+:[A-Z]+[0-9]+$/, {
    message: '올바른 범위 형식이 아닙니다. (예: A1:C10)'
  })
  targetRange?: string;

  @IsOptional()
  @IsBoolean()
  useCache?: boolean = true;
}

// ===============================
// 응답 DTO들
// ===============================
export class SpreadSheetInfoDto {
  id: string;
  fileName: string;
  fileSize: number;
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

export class DeltaApplyResponseDto {
  success: boolean;
  version: number;
  appliedDeltas: number;
  pendingDeltas: number;
}

export class GPTDataResponseDto {
  totalCells: number;
  sheetCount: number;
  dataHash: string;
  parsedAt: Date;
  sheets: Array<{
    name: string;
    cellCount: number;
    csvData: string;
    metadata: any;
  }>;
}

export class SaveResponseDto {
  success: boolean;
  savedDeltas: number;
  saveTime: number;
}

// ===============================
// 에러 응답 DTO
// ===============================
export class ErrorResponseDto {
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
}

// ===============================
// 검증 그룹 (선택적 사용)
// ===============================
export const CREATE_SPREADSHEET_GROUP = 'create-spreadsheet';
export const APPLY_DELTA_GROUP = 'apply-delta';
export const LOAD_SPREADSHEET_GROUP = 'load-spreadsheet';