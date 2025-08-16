import { IsString, IsOptional, IsDateString, ValidateNested, IsArray, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

// 인텐트 타입 열거형
export enum ChatIntentType {
  EXCEL_FORMULA = 'excel_formula',
  PYTHON_CODE_GENERATOR = 'python_code_generator',
  WHOLE_DATA = 'whole_data',
  GENERAL_HELP = 'general_help'
}

// 기본 응답 DTO
export class BaseChatResponseDto {
  @ApiProperty({ description: '채팅 ID' })
  @IsString()
  chatId: string;

  @ApiProperty({ description: '타임스탬프' })
  @IsDateString()
  timestamp: string;

  @ApiProperty({ description: '인텐트 타입' })
  @IsString()
  intent: string;

  @ApiProperty({ description: '메시지 내용' })
  @IsString()
  message: string;

  @ApiProperty({ description: '사용자 ID', required: false })
  @IsOptional()
  @IsString()
  userId?: string;
}

// 채팅 기록 조회 응답 DTO
export class ChatHistoryResponseDto {
  @ApiProperty({ description: '채팅 메시지 배열', type: [BaseChatResponseDto] })
  messages: BaseChatResponseDto[];

  @ApiProperty({ description: '총 메시지 수' })
  total: number;

  @ApiProperty({ description: '현재 페이지의 메시지 수' })
  count: number;
}

// 사용자 채팅 목록 조회 응답 DTO
export class ChatSummaryDto {
  @ApiProperty({ description: '채팅 ID' })
  id: string;

  @ApiProperty({ description: '채팅 제목', required: false })
  title?: string;

  @ApiProperty({ description: '마지막 메시지 내용', required: false })
  lastMessage?: string;

  @ApiProperty({ description: '마지막 업데이트 시간' })
  updatedAt: string;

  @ApiProperty({ description: '생성 시간' })
  createdAt: string;

  @ApiProperty({ description: '연결된 스프레드시트 ID', required: false })
  spreadsheetId?: string;
}

export class UserChatListResponseDto {
  @ApiProperty({ description: '채팅 목록 배열', type: [ChatSummaryDto] })
  chats: ChatSummaryDto[];

  @ApiProperty({ description: '총 채팅 수' })
  total: number;

  @ApiProperty({ description: '현재 페이지의 채팅 수' })
  count: number;
}

// 헬스 체크 응답 DTO
export class HealthResponseDto {
  @ApiProperty({ description: '서비스 상태' })
  status: string;

  @ApiProperty({ description: '타임스탬프' })
  timestamp: string;

  @ApiProperty({ description: '서비스 이름' })
  service: string;
}

// 에러 응답 DTO
export class ErrorResponseDto {
  @ApiProperty({ description: '에러 메시지' })
  message: string;

  @ApiProperty({ description: '에러 코드', required: false })
  error?: string;

  @ApiProperty({ description: '상태 코드' })
  statusCode: number;
}

// 엑셀 공식 파라미터 DTO
export class FormulaParameterDto {
  @IsString()
  name: string;
  
  @IsString()
  description: string;
  
  @IsString()
  required: boolean;
}

// 엑셀 공식 예제 DTO
export class FormulaExampleDto {
  @IsString()
  code: string;
  
  @IsString()
  description: string;
}

// 엑셀 공식 상세 정보 DTO
export class FormulaDetailsDto {
  @IsString()
  name: string;
  
  @IsString()
  description: string;
  
  @IsString()
  syntax: string;
  
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormulaParameterDto)
  parameters: FormulaParameterDto[];
  
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormulaExampleDto)
  examples: FormulaExampleDto[];
}

// 코드 구현 DTO
export class ImplementationDto {
  @IsString()
  code: string;
  
  @IsString()
  explanation: string;
}

// 엑셀 공식 관련 응답 DTO
export class ExcelFormulaResponseDto extends BaseChatResponseDto {
  @IsObject()
  @ValidateNested()
  @Type(() => FormulaDetailsDto)
  formulaDetails: FormulaDetailsDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ImplementationDto)
  implementation?: ImplementationDto;
}

// 시각화 DTO
export class VisualizationDto {
  @IsString()
  type: string;
  
  @IsString()
  code: string;
  
  @IsString()
  description: string;
}

// 파이썬 코드 생성 DTO
export class CodeGeneratorDto {
  @IsString()
  pythonCode: string;
  
  @IsString()
  explanation: string;
  
  @IsArray()
  importedLibraries: string[];
  
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VisualizationDto)
  visualizations?: VisualizationDto[];
}

// 파이썬 코드 생성기 응답 DTO
export class PythonCodeGeneratorResponseDto extends BaseChatResponseDto {
  @IsObject()
  @ValidateNested()
  @Type(() => CodeGeneratorDto)
  codeGenerator: CodeGeneratorDto;
}

// 전체 데이터 분석 응답 DTO
export class AnswerAfterReadWholeDataDto {
  @IsString()
  response: string;
}

// 전체 데이터 관련 응답 DTO
export class WholeDataResponseDto extends BaseChatResponseDto {
  @IsObject()
  @ValidateNested()
  @Type(() => AnswerAfterReadWholeDataDto)
  answerAfterReadWholeData: AnswerAfterReadWholeDataDto;
}

// 일반 도움말 예제 DTO
export class HelpExampleDto {
  @IsString()
  scenario: string;
  
  @IsString()
  solution: string;
}

// 일반 도움말 추가 자료 DTO
export class AdditionalResourceDto {
  @IsString()
  title: string;
  
  @IsString()
  description: string;
  
  @IsOptional()
  @IsString()
  link?: string;
}

// 일반 도움말 상세 DTO
export class GeneralHelpDetailsDto {
  @IsString()
  directAnswer: string;
  
  @IsOptional()
  @IsArray()
  relatedFeatures?: string[];
  
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HelpExampleDto)
  examples?: HelpExampleDto[];
  
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdditionalResourceDto)
  additionalResources?: AdditionalResourceDto[];
}

// 일반 도움말 응답 DTO
export class GeneralHelpResponseDto extends BaseChatResponseDto {
  @IsObject()
  @ValidateNested()
  @Type(() => GeneralHelpDetailsDto)
  generalHelp: GeneralHelpDetailsDto;
}

// 응답 타입에 따른 유니온 타입
export type ChatResponseDto = 
  | ExcelFormulaResponseDto 
  | PythonCodeGeneratorResponseDto 
  | WholeDataResponseDto 
  | GeneralHelpResponseDto;

// 응답 팩토리 클래스
export class ChatResponseFactory {
  static createResponse(intent: string): BaseChatResponseDto {
    switch (intent) {
      case ChatIntentType.EXCEL_FORMULA:
        return new ExcelFormulaResponseDto();
      case ChatIntentType.PYTHON_CODE_GENERATOR:
        return new PythonCodeGeneratorResponseDto();
      case ChatIntentType.WHOLE_DATA:
        return new WholeDataResponseDto();
      case ChatIntentType.GENERAL_HELP:
        return new GeneralHelpResponseDto();
      default:
        return new BaseChatResponseDto();
    }
  }
}
