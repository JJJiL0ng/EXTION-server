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

// ===============================
// SpreadJS Format Interface
// ===============================
// export interface SpreadJSFormat {
//   version?: string;
//   name?: string;
//   docProps?: any;
//   sheetCount?: number;
//   frc?: number;
//   tabStripRatio?: number;
//   sheets?: {
//     [sheetName: string]: {
//       name: string;
//       isSelected?: boolean;
//       rowCount?: number;
//       columnCount?: number;
//       visible?: number;
//       frozenRowCount?: number;
//       frozenColCount?: number;
//       theme?: any;
//       data?: {
//         dataTable?: {
//           [cellAddress: string]: any;
//         };
//         [key: string]: any;
//       };
//       [key: string]: any;
//     };
//   };
//   [key: string]: any;
// }


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

  @IsNotEmpty()
  @IsObject()
  jsonData: Record<string, any>;
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
  isActive: boolean;
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