import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { SpreadsheetService } from '../sheet-modules/spreadsheet/spreadsheet.service';
import { PrismaService } from '../prisma/prisma.service';
import { PromptService, ChatType, PromptData } from '../prompts/prompt/prompt.service';
import { 
  ProcessChatRequest, 
  ProcessChatResponse, 
  TableGenerationResult,
  GeneratedSheetData 
} from './dto/table-generate.dto';
import * as XLSX from 'xlsx';

@Injectable()
export class TableGenerateService {
  private readonly logger = new Logger(TableGenerateService.name);
  private readonly anthropic: Anthropic;

  constructor(
    private readonly configService: ConfigService,
    private readonly spreadsheetService: SpreadsheetService,
    private readonly prisma: PrismaService,
    private readonly promptService: PromptService,
  ) {
    this.anthropic = new Anthropic({
      apiKey: this.configService.get('CLAUDE_API_KEY'),
    });
  }

  /**
   * 파일 업로드 및 채팅 처리를 통한 테이블 생성
   */
  async processChat(
    files: any[],
    chatId: string,
    userId: string,
    message: string,
    webSearchEnabled: boolean,
    fileNames?: string[],
    fileSizes?: string[]
  ): Promise<ProcessChatResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.log(
        `테이블 생성 처리 시작 - chatId: ${chatId}, userId: ${userId}`,
      );

      // 1. 파일 데이터 추출 (파일이 있을 경우)
      let extractedData: {
        data: any[][];
        fileName: string;
        fileSize: number;
        fileType: string;
        rawContent?: string;
      } | null = null;
      if (files && files.length > 0) {
        extractedData = await this.extractFileData(
          files,
          fileNames,
          fileSizes,
        );
      }

      // 2. Claude API를 통한 시트 데이터 생성 (나중에 프롬프트 연결 예정)
      const generatedResult = await this.generateTableData(
        extractedData,
        message,
        webSearchEnabled,
      );

      // 3. 데이터베이스에 저장
      const savedResult = await this.saveGeneratedData(
        userId,
        chatId,
        generatedResult,
        extractedData?.fileName || 'Untitled',
      );

      const processingTime = Date.now() - startTime;

      this.logger.log(
        `테이블 생성 완료 - sheetId: ${savedResult.id}, 처리시간: ${processingTime}ms`,
      );

      // chat-sheet와 동일한 구조로 응답 생성
      return await this.buildChatSheetResponse(
        savedResult.chatId,
        userId,
        savedResult,
        processingTime,
        true,
      );

    } catch (error) {
      this.logger.error(`테이블 생성 실패 - chatId: ${chatId}`, error);
      
      // 에러 시에도 chat-sheet 구조로 응답
      return {
        chatId,
        success: false,
        error: error.message || '테이블 생성 중 오류가 발생했습니다.',
        message: '파일 처리 및 테이블 생성에 실패했습니다.',
        processingTime: Date.now() - startTime,
      };
    }
  }

  /**
   * 업로드된 파일에서 데이터 추출
   */
  private async extractFileData(
    files: any[],
    fileNames?: string[],
    fileSizes?: string[]
  ): Promise<{
    data: any[][];
    fileName: string;
    fileSize: number;
    fileType: string;
    rawContent?: string;
  }> {
    if (!files || files.length === 0) {
      throw new BadRequestException('처리할 파일이 없습니다.');
    }

    const file = files[0]; // 첫 번째 파일만 처리
    const fileName = fileNames?.[0] || file.originalname || 'unknown_file';
    const fileSize = fileSizes?.[0] ? parseInt(fileSizes[0]) : file.size || 0;

    this.logger.log(`파일 처리 시작 - 파일명: ${fileName}, 크기: ${fileSize} bytes`);

    try {
      // 파일 타입별 처리
      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        return await this.processExcelFile(file, fileName, fileSize);
      } else if (fileName.endsWith('.csv')) {
        return await this.processCsvFile(file, fileName, fileSize);
      } else if (fileName.endsWith('.json')) {
        return await this.processJsonFile(file, fileName, fileSize);
      } else if (fileName.endsWith('.txt')) {
        return await this.processTextFile(file, fileName, fileSize);
      } else {
        // 기본적으로 텍스트로 처리
        return await this.processTextFile(file, fileName, fileSize);
      }
    } catch (error) {
      this.logger.error(`파일 처리 실패 - ${fileName}`, error);
      throw new BadRequestException(`파일 처리 실패: ${error.message}`);
    }
  }

  /**
   * Excel 파일 처리
   */
  private async processExcelFile(file: any, fileName: string, fileSize: number) {
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

    return {
      data: data as any[][],
      fileName,
      fileSize,
      fileType: 'excel',
    };
  }

  /**
   * CSV 파일 처리
   */
  private async processCsvFile(file: any, fileName: string, fileSize: number) {
    const text = file.buffer.toString('utf-8');
    const lines = text.split('\n').filter(line => line.trim());
    const data = lines.map(line => line.split(',').map(cell => cell.trim()));

    return {
      data,
      fileName,
      fileSize,
      fileType: 'csv',
    };
  }

  /**
   * JSON 파일 처리
   */
  private async processJsonFile(file: any, fileName: string, fileSize: number) {
    const text = file.buffer.toString('utf-8');
    const jsonData = JSON.parse(text);
    
    // JSON을 2차원 배열로 변환
    let data: any[][];
    if (Array.isArray(jsonData)) {
      if (jsonData.length > 0 && typeof jsonData[0] === 'object') {
        // 객체 배열인 경우
        const keys = Object.keys(jsonData[0]);
        data = [keys, ...jsonData.map(item => keys.map(key => item[key]))];
      } else {
        // 단순 배열인 경우
        data = jsonData.map((item, index) => [index.toString(), item]);
      }
    } else {
      // 단일 객체인 경우
      const keys = Object.keys(jsonData);
      data = [['key', 'value'], ...keys.map(key => [key, jsonData[key]])];
    }

    return {
      data,
      fileName,
      fileSize,
      fileType: 'json',
      rawContent: text,
    };
  }

  /**
   * 텍스트 파일 처리
   */
  private async processTextFile(file: any, fileName: string, fileSize: number) {
    const text = file.buffer.toString('utf-8');
    const lines = text.split('\n').filter(line => line.trim());
    const data = lines.map((line, index) => [index + 1, line]);

    return {
      data: [['Line', 'Content'], ...data],
      fileName,
      fileSize,
      fileType: 'text',
      rawContent: text,
    };
  }

  /**
   * Claude API를 통한 테이블 데이터 생성
   */
  private async generateTableData(
    extractedData: any,
    message: string,
    webSearchEnabled: boolean
  ): Promise<TableGenerationResult> {
    this.logger.log(`Claude API를 통한 데이터 생성 시작 - 메시지: ${message}`);

    try {
      // 1. 프롬프트 데이터 생성
      const promptData = this.createPromptData(extractedData, message, webSearchEnabled);

      // 2. AI 프롬프트 생성
      const prompts = this.promptService.generatePrompts(ChatType.TABLE_GENERATE, promptData);

      // 3. Claude API 호출
      const aiResponse = await this.generateAIResponse(
        prompts.systemPrompt,
        prompts.userPrompt,
        prompts.temperature,
        prompts.maxTokens
      );

      // 4. 응답에서 데이터 추출 (try-catch 블록 밖으로 이동)
      const extractedResult = this.extractDataFromResponse(aiResponse);

      // 5. 결과 반환
      return {
        sheets: extractedResult.sheets,
        fileName: extractedResult.fileName,
        originalFileName: extractedResult.originalFileName,
        fileSize: extractedResult.fileSize,
        fileType: 'generated',
        activeSheetIndex: extractedResult.activeSheetIndex,
      };

    } catch (error) {
      this.logger.error('Claude API 데이터 생성 또는 파싱 실패:', error);
      // 실패 시에는 에러를 던져서 processChat의 catch 블록에서 처리하도록 함
      throw new InternalServerErrorException(
        `AI 데이터 처리 실패: ${error.message}`
      );
    }
  }

  /**
   * 메시지 기반 데이터 처리 (임시 구현)
   */
  private processDataWithMessage(data: any[][], message: string): any[][] {
    // 현재는 기본적인 데이터 처리만 수행
    // 나중에 Claude API와 프롬프트 시스템으로 대체됨
    
    if (!data || data.length === 0) {
      return [['Generated Column 1', 'Generated Column 2'], ['Sample Data 1', 'Sample Data 2']];
    }

    // 헤더가 없으면 추가
    if (data.length > 0) {
      const firstRow = data[0];
      const hasHeaders = firstRow.every(cell => typeof cell === 'string' && cell.trim() !== '');
      
      if (!hasHeaders) {
        const headers = firstRow.map((_, index) => `Column ${index + 1}`);
        return [headers, ...data];
      }
    }

    return data;
  }

  /**
   * 생성된 데이터를 데이터베이스에 저장
   */
  private async saveGeneratedData(
    userId: string,
    chatId: string,
    result: TableGenerationResult,
    originalFileName: string,
  ) {
    this.logger.log(`데이터베이스 저장 시작 - chatId: ${chatId}`);

    const saveDto = {
      userId,
      chatId,
      fileName: result.fileName,
      originalFileName: result.originalFileName || originalFileName,
      fileSize: result.fileSize,
      fileType: result.fileType,
      activeSheetIndex: result.activeSheetIndex,
      sheets: result.sheets,
    };

    return await this.spreadsheetService.saveSpreadsheet(saveDto);
  }

  /**
   * 프롬프트 데이터 생성
   */
  private createPromptData(
    extractedData: any,
    message: string,
    webSearchEnabled: boolean
  ): PromptData {
    const hasFileData = !!extractedData && !!extractedData.data;
    
    // 파일 데이터를 텍스트 형태로 변환
    let fileContent = '';
    let dataRowCount = 0;
    let dataColumnCount = 0;

    if (hasFileData && extractedData.data) {
      const data = extractedData.data;
      dataRowCount = data.length;
      dataColumnCount = data.length > 0 ? data[0].length : 0;
      
      // 파일 내용을 AI가 분석할 수 있는 형식으로 변환
      fileContent = this.formatFileDataForAI(data);
    }

    return {
      user_input: message,
      has_file_data: hasFileData,
      original_file_name: extractedData?.fileName || 'unknown_file',
      file_type: extractedData?.fileType || 'unknown',
      file_size: extractedData?.fileSize || 0,
      data_row_count: dataRowCount,
      data_column_count: dataColumnCount,
      file_content: fileContent,
      raw_content: extractedData?.rawContent,
      web_search_enabled: webSearchEnabled,
    };
  }

  /**
   * 파일 데이터를 AI가 분석할 수 있는 형식으로 변환
   */
  private formatFileDataForAI(data: any[][]): string {
    const maxContentLength = 50000; // 최대 50,000 문자
    
    let formattedContent = data.map((row, index) => {
      const rowData = row.map(cell => cell || '').join('\t');
      return `${index + 1}: ${rowData}`;
    }).join('\n');

    // 콘텐츠 크기 제한
    if (formattedContent.length > maxContentLength) {
      const lines = formattedContent.split('\n');
      const header = lines[0];
      const dataLines = lines.slice(1);
      
      let limitedContent = header + '\n';
      let currentLength = limitedContent.length;
      
      for (const line of dataLines) {
        if (currentLength + line.length + 1 > maxContentLength) {
          limitedContent += '\n... (데이터가 더 있습니다. 총 ' + lines.length + '행)';
          break;
        }
        limitedContent += line + '\n';
        currentLength += line.length + 1;
      }
      
      this.logger.log(`파일 콘텐츠 크기 제한: ${formattedContent.length} → ${limitedContent.length} 문자`);
      return limitedContent;
    }
    
    return formattedContent;
  }

  /**
   * Claude AI 응답 생성
   */
  private async generateAIResponse(
    systemPrompt: string,
    userPrompt: string,
    temperature?: number,
    maxTokens?: number
  ): Promise<string> {
    this.logger.log('==================== Claude AI 응답 생성 시작 ====================');
    
    // 프롬프트 크기 체크
    const totalPromptSize = systemPrompt.length + userPrompt.length;
    this.logger.log(`총 프롬프트 크기: ${totalPromptSize} 문자`);

    if (totalPromptSize > 100000) {
      this.logger.warn(`프롬프트 크기가 큽니다: ${totalPromptSize} 문자. 응답이 제한될 수 있습니다.`);
    }

    try {
      const completion = await this.anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt }
        ],
        temperature: temperature || 0.3,
        max_tokens: maxTokens || 8192,
      }); 

      const firstBlock = completion.content[0];
      const aiResponse = firstBlock?.type === 'text' ? firstBlock.text : null;

      if (!aiResponse) {
        throw new InternalServerErrorException('Claude AI 응답을 받을 수 없습니다.');
      }

      this.logger.log(`Claude AI 응답 생성 완료: ${aiResponse.length}자`);
      return aiResponse;

    } catch (error) {
      this.logger.error('Claude AI 응답 생성 중 오류:', error);
      throw new InternalServerErrorException(`Claude AI 응답 생성 실패: ${error.message}`);
    }
  }

  /**
   * AI 응답에서 테이블 데이터 추출
   */
  private extractDataFromResponse(aiResponse: string): any {
    this.logger.debug(`AI 응답 분석 시작: ${aiResponse.substring(0, 100)}...`);
    
    try {
      // JSON 추출
      const jsonRegex = /```json([\s\S]*?)```|(\{[\s\S]*\})/;
      const match = aiResponse.match(jsonRegex);
      
      let jsonString = '';
      if (match && match[1]) {
        jsonString = match[1].trim();
      } else if (match && match[2]) {
        jsonString = match[2].trim();
      } else if (aiResponse.trimStart().startsWith('{') && aiResponse.trimEnd().endsWith('}')) {
        jsonString = aiResponse.trim();
      } else {
        throw new Error('응답에서 유효한 JSON 형식을 찾을 수 없습니다.');
      }
      
      // JSON 파싱
      const parsedData = JSON.parse(jsonString);
      
      // 기본 유효성 검사
      if (!parsedData.sheets || !Array.isArray(parsedData.sheets)) {
        throw new Error('시트 배열이 누락되었습니다.');
      }
      
      // 시트 데이터 검증 및 정제
      const cleanedSheets = parsedData.sheets.map((sheet: any, index: number) => {
        if (!sheet.name) {
          sheet.name = `Sheet ${index + 1}`;
        }
        
        if (!Array.isArray(sheet.data) || sheet.data.length === 0) {
          throw new Error(`시트 "${sheet.name}"의 데이터가 누락되었습니다.`);
        }
        
        // 데이터 배열 검증 및 정제
        const cleanedData = sheet.data.map((row: any) => {
          if (!Array.isArray(row)) {
            return [];
          }
          
          // 모든 값이 문자열인지 확인
          return row.map((cell: any) => cell === null || cell === undefined ? '' : String(cell));
        });
        
        return {
          name: sheet.name,
          index: sheet.index || index,
          data: cleanedData,
        };
      });
      
      return {
        sheets: cleanedSheets,
        fileName: parsedData.fileName || 'generated_table.xlsx',
        activeSheetIndex: parsedData.activeSheetIndex || 0,
        summary: parsedData.summary || '테이블이 성공적으로 생성되었습니다.',
        processingDetails: parsedData.processingDetails || {},
      };
      
    } catch (error) {
      this.logger.error('응답 데이터 추출 오류:', error);
      throw new InternalServerErrorException(`데이터 추출 실패: ${error.message}`);
    }
  }

  /**
   * 엑셀 렌더링용 시트 데이터 응답 생성 (메시지 없이)
   */
  private async buildChatSheetResponse(
    chatId: string,
    userId: string,
    savedResult: any,
    processingTime: number,
    success: boolean
  ): Promise<ProcessChatResponse> {
    try {
      // 시트 메타데이터 조회
      const sheetMetaData = await this.prisma.sheetMetaData.findUnique({
        where: { id: savedResult.id },
        include: {
          sheetTableData: {
            orderBy: { index: 'asc' },
          },
        },
      });

      // 엑셀 렌더링용 응답 생성 (메시지 제외)
      const response: ProcessChatResponse = {
        chatId,
        success,
        processingTime,
      };

      // 시트 메타데이터만 포함 (엑셀 렌더링용)
      if (sheetMetaData) {
        response.sheetMetaData = {
          id: sheetMetaData.id,
          fileName: sheetMetaData.fileName,
          originalFileName: sheetMetaData.originalFileName || undefined,
          fileSize: sheetMetaData.fileSize || undefined,
          fileType: sheetMetaData.fileType || undefined,
          activeSheetIndex: sheetMetaData.activeSheetIndex,
          createdAt: sheetMetaData.createdAt,
          updatedAt: sheetMetaData.updatedAt,
          userId: sheetMetaData.userId,
          sheetTableData: sheetMetaData.sheetTableData.map(table => ({
            id: table.id,
            name: table.name,
            index: table.index,
            data: table.data,
            createdAt: table.createdAt,
            updatedAt: table.updatedAt,
          })),
        };
      }

      return response;

    } catch (error) {
      this.logger.error('시트 데이터 응답 생성 실패:', error);
      
      // 에러 시 기본 응답
      return {
        chatId,
        success: false,
        error: '응답 생성 중 오류가 발생했습니다.',
        processingTime,
      };
    }
  }

  /**
   * 데이터에서 컬럼 정보 추출
   */
  private extractColumns(data: any[][]): string[] {
    if (!data || data.length === 0) return [];
    
    const firstRow = data[0];
    if (Array.isArray(firstRow)) {
      return firstRow.map((cell, index) => 
        cell?.toString() || `Column ${index + 1}`
      );
    }
    
    return [];
  }
}
