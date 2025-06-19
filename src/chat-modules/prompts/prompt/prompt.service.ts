// src/common/prompt/prompt.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

export enum ChatType {
  GENERAL_CHAT = 'general_chat',
  FUNCTION_CHAT = 'function_chat',
  EDIT_CHAT = 'edit_chat',
  VISUALIZATION_CHAT = 'visualization_chat',
  GENERATION_CHAT = 'generation_chat',
  // 필요에 따라 추가
}

export interface PromptData {
  // 필수 공통 데이터
  user_input: string;
  
  // 스프레드시트 관련 데이터
  has_data?: boolean;
  spreadsheet_name?: string;
  sheet_name?: string;
  headers?: string;
  row_count?: number;
  column_count?: number;
  actual_data?: string;
  csv_data?: string;
  
  // 컨텍스트 관련
  data_context?: string;
  
  // 코드 관련 데이터
  code_language?: string;
  code_content?: string;
  error_message?: string;
  
  // 이미지 관련 데이터
  image_url?: string;
  image_description?: string;
  
  // 요약 관련 데이터
  document_content?: string;
  summary_type?: string;
  target_length?: string;
  
  // 기타 확장 가능한 데이터
  [key: string]: any;
}

export interface PromptConfig {
  system: string;
  user_template: string;
  // 선택적 설정
  temperature?: number;
  max_tokens?: number;
  description?: string;
  variables?: string[];
}

export interface SinglePromptConfig {
  prompt: PromptConfig;
  global_settings?: {
    default_temperature?: number;
    default_max_tokens?: number;
    encoding?: string;
  };
}

// PromptsConfig는 이제 사용하지 않지만 호환성을 위해 유지
export interface PromptsConfig {
  prompts: Record<string, PromptConfig>;
  global_settings?: {
    default_temperature?: number;
    default_max_tokens?: number;
    encoding?: string;
  };
}

@Injectable()
export class PromptService {
  private readonly logger = new Logger(PromptService.name);
  private promptConfigCache: Map<string, PromptConfig> = new Map();
  private globalSettingsCache: Map<string, any> = new Map();
  private readonly promptsBasePath: string;
  private readonly language: string;
  private fileWatchers: Map<string, any> = new Map();

  constructor(private configService: ConfigService) {
    this.language = this.configService.get('PROMPT_LANGUAGE', 'kr');
    this.promptsBasePath = path.join(process.cwd(), 'src', 'chat-modules', 'prompts', this.language);
    this.logger.log(`프롬프트 기본 경로: ${this.promptsBasePath}`);
    this.logger.log(`프롬프트 언어: ${this.language}`);
  }

  /**
   * 특정 채팅 타입의 프롬프트 파일 경로를 반환합니다.
   */
  private getPromptFilePath(chatType: ChatType): string {
    return path.join(this.promptsBasePath, `${chatType}.yml`);
  }

  /**
   * 특정 채팅 타입의 프롬프트를 로드합니다.
   */
  private loadPrompt(chatType: ChatType): PromptConfig {
    const filePath = this.getPromptFilePath(chatType);
    
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`프롬프트 파일이 존재하지 않습니다: ${filePath}`);
      }

      const fileContents = fs.readFileSync(filePath, 'utf8');
      const promptData = yaml.load(fileContents) as SinglePromptConfig;
      
      this.validateSinglePromptConfig(promptData, chatType);
      
      // 글로벌 설정 캐시
      if (promptData.global_settings) {
        this.globalSettingsCache.set(chatType, promptData.global_settings);
      }
      
      // 프롬프트 설정 캐시
      this.promptConfigCache.set(chatType, promptData.prompt);
      
      this.logger.log(`프롬프트 파일 로드 완료: ${chatType} (${filePath})`);
      
      return promptData.prompt;
    } catch (error) {
      this.logger.error(`프롬프트 파일 로드 실패 (${chatType}):`, error);
      throw new Error(`프롬프트 파일을 로드할 수 없습니다 (${chatType}): ${error.message}`);
    }
  }

  /**
   * 개별 프롬프트 설정 파일의 유효성을 검사합니다.
   */
  private validateSinglePromptConfig(config: SinglePromptConfig, chatType: ChatType): void {
    if (!config || !config.prompt) {
      throw new Error(`프롬프트 설정 파일 형식이 올바르지 않습니다 (${chatType}). 'prompt' 섹션이 필요합니다.`);
    }

    if (!config.prompt.system || !config.prompt.user_template) {
      throw new Error(`${chatType}의 프롬프트 설정이 불완전합니다. system과 user_template가 필요합니다.`);
    }
  }

  /**
   * 캐시에서 프롬프트 설정을 가져오거나, 없으면 로드합니다.
   */
  private getOrLoadPromptConfig(chatType: ChatType): PromptConfig {
    // 캐시에 있으면 반환
    if (this.promptConfigCache.has(chatType)) {
      return this.promptConfigCache.get(chatType)!;
    }
    
    // 캐시에 없으면 로드
    return this.loadPrompt(chatType);
  }

  /**
   * 특정 채팅 타입의 글로벌 설정을 가져옵니다.
   */
  private getGlobalSettings(chatType: ChatType): any {
    // 캐시에서 확인
    if (this.globalSettingsCache.has(chatType)) {
      return this.globalSettingsCache.get(chatType);
    }
    
    // 프롬프트 로드 시 글로벌 설정도 함께 로드됨
    this.getOrLoadPromptConfig(chatType);
    
    return this.globalSettingsCache.get(chatType) || {};
  }

  /**
   * 지정된 채팅 타입과 데이터를 사용하여 시스템 프롬프트를 생성합니다.
   */
  generateSystemPrompt(chatType: ChatType, data: Partial<PromptData> = {}): string {
    const promptConfig = this.getOrLoadPromptConfig(chatType);
    return this.interpolateTemplate(promptConfig.system, data);
  }

  /**
   * 지정된 채팅 타입과 데이터를 사용하여 사용자 프롬프트를 생성합니다.
   */
  generateUserPrompt(chatType: ChatType, data: PromptData): string {
    const promptConfig = this.getOrLoadPromptConfig(chatType);
    return this.interpolateTemplate(promptConfig.user_template, data);
  }

  /**
   * 지정된 채팅 타입에 대한 시스템 및 사용자 프롬프트를 모두 생성합니다.
   */
  generatePrompts(chatType: ChatType, data: PromptData): { 
    systemPrompt: string; 
    userPrompt: string;
    temperature?: number;
    maxTokens?: number;
  } {
    const promptConfig = this.getOrLoadPromptConfig(chatType);
    const globalSettings = this.getGlobalSettings(chatType);
    
    return {
      systemPrompt: this.generateSystemPrompt(chatType, data),
      userPrompt: this.generateUserPrompt(chatType, data),
      temperature: promptConfig.temperature ?? globalSettings.default_temperature ?? 0.3,
      maxTokens: promptConfig.max_tokens ?? globalSettings.default_max_tokens ?? 4096,
    };
  }

  /**
   * 특정 채팅 타입의 설정 정보를 가져옵니다.
   */
  getChatTypeConfig(chatType: ChatType): PromptConfig & { exists: boolean } {
    try {
      const config = this.getOrLoadPromptConfig(chatType);
      return { ...config, exists: true };
    } catch {
      return { 
        system: '', 
        user_template: '', 
        exists: false 
      };
    }
  }

  /**
   * 사용 가능한 모든 채팅 타입을 반환합니다.
   * 실제 파일이 존재하는 채팅 타입만 반환합니다.
   */
  getAvailableChatTypes(): ChatType[] {
    const availableTypes: ChatType[] = [];
    
    for (const chatType of Object.values(ChatType)) {
      const filePath = this.getPromptFilePath(chatType);
      if (fs.existsSync(filePath)) {
        availableTypes.push(chatType);
      }
    }
    
    return availableTypes;
  }

  /**
   * 특정 채팅 타입이 지원되는지 확인합니다.
   */
  isChatTypeSupported(chatType: string): boolean {
    if (!Object.values(ChatType).includes(chatType as ChatType)) {
      return false;
    }
    
    const filePath = this.getPromptFilePath(chatType as ChatType);
    return fs.existsSync(filePath);
  }

  /**
   * 템플릿에서 사용되는 변수들을 추출합니다.
   */
  extractTemplateVariables(chatType: ChatType): { system: string[]; user: string[] } {
    const config = this.getOrLoadPromptConfig(chatType);
    
    return {
      system: this.extractVariablesFromString(config.system),
      user: this.extractVariablesFromString(config.user_template),
    };
  }

  private extractVariablesFromString(template: string): string[] {
    const variables = new Set<string>();
    
    // {{variable}} 패턴 추출
    const simpleVariables = template.match(/\{\{(\w+)\}\}/g);
    if (simpleVariables) {
      simpleVariables.forEach(match => {
        const variable = match.replace(/[{}]/g, '');
        variables.add(variable);
      });
    }
    
    // {{#if variable}} 패턴 추출
    const conditionalVariables = template.match(/\{\{#if\s+(\w+)\}\}/g);
    if (conditionalVariables) {
      conditionalVariables.forEach(match => {
        const variable = match.match(/\{\{#if\s+(\w+)\}\}/)?.[1];
        if (variable) variables.add(variable);
      });
    }
    
    return Array.from(variables);
  }

  /**
   * 템플릿 문자열에 데이터를 삽입합니다.
   * 지원하는 템플릿 문법:
   * - {{variable}} : 단순 변수 치환
   * - {{#if condition}}...{{/if}} : 조건부 블록
   * - {{#if condition}}...{{else}}...{{/if}} : 조건부 블록 (else 포함)
   * - {{#each array}}...{{/each}} : 배열 반복 (향후 지원 예정)
   */
  private interpolateTemplate(template: string, data: Partial<PromptData>): string {
    let result = template;

    try {
      // 1. 중첩된 조건부 블록 처리 ({{#if}}...{{else}}...{{/if}})
      result = result.replace(
        /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g,
        (match, condition, ifContent, elseContent) => {
          const value = data[condition as keyof PromptData];
          return this.isTruthy(value) ? ifContent : elseContent;
        }
      );

      // 2. 단순 조건부 블록 처리 ({{#if}}...{{/if}})
      result = result.replace(
        /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
        (match, condition, content) => {
          const value = data[condition as keyof PromptData];
          return this.isTruthy(value) ? content : '';
        }
      );

      // 3. 단순 변수 치환 ({{variable}})
      result = result.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        const value = data[key as keyof PromptData];
        return value !== undefined ? String(value) : '';
      });

      // 4. 특수 함수 처리 ({{#function_name args}})
      result = this.processSpecialFunctions(result, data);

    } catch (error) {
      this.logger.error('템플릿 보간 중 오류 발생:', error);
      throw new Error(`템플릿 처리 실패: ${error.message}`);
    }

    return result.trim();
  }

  /**
   * 특수 함수들을 처리합니다 (확장 가능)
   */
  private processSpecialFunctions(template: string, data: Partial<PromptData>): string {
    let result = template;

    // {{#length variable}} : 배열이나 문자열의 길이
    result = result.replace(/\{\{#length\s+(\w+)\}\}/g, (match, variable) => {
      const value = data[variable as keyof PromptData];
      if (Array.isArray(value)) return String(value.length);
      if (typeof value === 'string') return String(value.length);
      return '0';
    });

    // {{#uppercase variable}} : 대문자 변환
    result = result.replace(/\{\{#uppercase\s+(\w+)\}\}/g, (match, variable) => {
      const value = data[variable as keyof PromptData];
      return typeof value === 'string' ? value.toUpperCase() : String(value || '');
    });

    // {{#lowercase variable}} : 소문자 변환
    result = result.replace(/\{\{#lowercase\s+(\w+)\}\}/g, (match, variable) => {
      const value = data[variable as keyof PromptData];
      return typeof value === 'string' ? value.toLowerCase() : String(value || '');
    });

    return result;
  }

  private isTruthy(value: any): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return value.length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return Boolean(value);
  }

  /**
   * 특정 채팅 타입의 프롬프트 설정을 다시 로드합니다.
   */
  reloadPrompt(chatType: ChatType): void {
    // 캐시에서 제거
    this.promptConfigCache.delete(chatType);
    this.globalSettingsCache.delete(chatType);
    
    // 다시 로드
    this.loadPrompt(chatType);
    this.logger.log(`프롬프트 설정 재로드 완료: ${chatType}`);
  }

  /**
   * 모든 프롬프트 설정을 다시 로드합니다.
   */
  reloadAllPrompts(): void {
    this.promptConfigCache.clear();
    this.globalSettingsCache.clear();
    
    const availableTypes = this.getAvailableChatTypes();
    for (const chatType of availableTypes) {
      try {
        this.loadPrompt(chatType);
      } catch (error) {
        this.logger.error(`${chatType} 재로드 실패:`, error);
      }
    }
    
    this.logger.log('모든 프롬프트 설정 재로드 완료');
  }

  /**
   * 특정 채팅 타입의 프롬프트 설정 파일을 감시하고 변경 시 자동 리로드합니다.
   */
  startFileWatcher(chatType?: ChatType): void {
    if (this.configService.get('NODE_ENV') !== 'development') {
      this.logger.warn('파일 감시는 개발 환경에서만 활성화됩니다.');
      return;
    }

    const typesToWatch = chatType ? [chatType] : this.getAvailableChatTypes();
    
    for (const type of typesToWatch) {
      const filePath = this.getPromptFilePath(type);
      
      if (!fs.existsSync(filePath)) {
        this.logger.warn(`감시할 파일이 존재하지 않습니다: ${filePath}`);
        continue;
      }
      
      // 이미 감시 중인 파일이면 건너뛰기
      if (this.fileWatchers.has(type)) {
        continue;
      }
      
      try {
        const watcher = fs.watchFile(filePath, (curr, prev) => {
          if (curr.mtime !== prev.mtime) {
            this.logger.log(`프롬프트 파일 변경 감지 (${type}), 재로드 중...`);
            this.reloadPrompt(type);
          }
        });
        
        this.fileWatchers.set(type, watcher);
        this.logger.log(`프롬프트 파일 감시 시작: ${type} (${filePath})`);
      } catch (error) {
        this.logger.error(`파일 감시 시작 실패 (${type}):`, error);
      }
    }
  }

  /**
   * 모든 파일 감시를 중지합니다.
   */
  stopAllFileWatchers(): void {
    for (const [chatType, watcher] of this.fileWatchers) {
      try {
        const filePath = this.getPromptFilePath(chatType as ChatType);
        fs.unwatchFile(filePath);
        this.logger.log(`파일 감시 중지: ${chatType}`);
      } catch (error) {
        this.logger.error(`파일 감시 중지 실패 (${chatType}):`, error);
      }
    }
    
    this.fileWatchers.clear();
  }

  /**
   * 프롬프트 통계 정보를 반환합니다.
   */
  getPromptStats(): {
    totalChatTypes: number;
    chatTypes: string[];
    language: string;
    basePath: string;
    cachedTypes: string[];
    fileStatuses: Record<string, { exists: boolean; lastModified?: Date; filePath: string }>;
  } {
    const availableTypes = this.getAvailableChatTypes();
    const fileStatuses: Record<string, { exists: boolean; lastModified?: Date; filePath: string }> = {};
    
    for (const chatType of Object.values(ChatType)) {
      const filePath = this.getPromptFilePath(chatType);
      const exists = fs.existsSync(filePath);
      
      let lastModified: Date | undefined;
      if (exists) {
        try {
          const stats = fs.statSync(filePath);
          lastModified = stats.mtime;
        } catch (error) {
          this.logger.warn(`파일 통계 가져오기 실패 (${chatType}):`, error);
        }
      }
      
      fileStatuses[chatType] = {
        exists,
        lastModified,
        filePath,
      };
    }

    return {
      totalChatTypes: availableTypes.length,
      chatTypes: availableTypes,
      language: this.language,
      basePath: this.promptsBasePath,
      cachedTypes: Array.from(this.promptConfigCache.keys()),
      fileStatuses,
    };
  }

  /**
   * 프롬프트 디렉토리 구조를 생성합니다. (개발 도구)
   */
  async createPromptDirectoryStructure(): Promise<void> {
    try {
      // 기본 디렉토리 생성
      if (!fs.existsSync(this.promptsBasePath)) {
        fs.mkdirSync(this.promptsBasePath, { recursive: true });
        this.logger.log(`프롬프트 디렉토리 생성: ${this.promptsBasePath}`);
      }

      // 각 채팅 타입별 샘플 파일 생성 (파일이 없는 경우에만)
      for (const chatType of Object.values(ChatType)) {
        const filePath = this.getPromptFilePath(chatType);
        
        if (!fs.existsSync(filePath)) {
          const sampleConfig: SinglePromptConfig = {
            prompt: {
              system: `당신은 ${chatType} 전문 AI 어시스턴트입니다.`,
              user_template: `사용자 입력: {{user_input}}`,
              temperature: 0.3,
              max_tokens: 4096,
              description: `${chatType}용 프롬프트 설정`,
            },
            global_settings: {
              default_temperature: 0.3,
              default_max_tokens: 4096,
              encoding: 'utf-8',
            },
          };
          
          const yamlContent = yaml.dump(sampleConfig, { 
            defaultFlowStyle: false,
            lineWidth: -1,
          });
          
          fs.writeFileSync(filePath, yamlContent, 'utf8');
          this.logger.log(`샘플 프롬프트 파일 생성: ${filePath}`);
        }
      }
      
      this.logger.log('프롬프트 디렉토리 구조 생성 완료');
    } catch (error) {
      this.logger.error('프롬프트 디렉토리 구조 생성 실패:', error);
      throw error;
    }
  }
}

/**
 * Normal Chat에 특화된 헬퍼 함수들
 */
export class NormalChatPromptHelper {
  static createDataContext(hasSpreadsheetData: boolean, spreadsheetMetadata: any): string {
    const isMultiSheet = spreadsheetMetadata?.sheets?.length > 1;

    if (hasSpreadsheetData) {
      return `현재 분석 가능한 실제 데이터가 있습니다:
${isMultiSheet ? `
- 다중 시트 환경
- 총 시트 수: ${spreadsheetMetadata.sheets.length}
- 활성 시트: ${spreadsheetMetadata.sheets[spreadsheetMetadata.activeSheetIndex]?.sheetName || '알 수 없음'}
- 파일명: ${spreadsheetMetadata.fileName}
` : `
- 단일 시트 환경
- 시트명: ${spreadsheetMetadata.sheets[0]?.sheetName || '알 수 없음'}
- 파일명: ${spreadsheetMetadata.fileName}
`}
- 실제 데이터가 제공되어 정밀한 분석이 가능합니다
- 모든 행과 열을 대상으로 상세 분석을 수행하세요`;
    } else {
      return '현재 분석할 데이터가 없습니다. 사용자에게 데이터를 업로드하도록 안내하세요.';
    }
  }

  static createLimitedDataForPrompt(rows: string[][], headers: string[]): string {
    const maxRows = 100;
    const maxLength = 50000;

    let csvContent = '';

    if (headers && headers.length > 0) {
      csvContent = headers.join(',') + '\n';
    }

    const limitedRows = rows.slice(0, maxRows);
    for (const row of limitedRows) {
      const rowContent = row.join(',') + '\n';

      if (csvContent.length + rowContent.length > maxLength) {
        csvContent += '\n... (더 많은 데이터가 있습니다. 총 ' + rows.length + '행)';
        break;
      }

      csvContent += rowContent;
    }

    return csvContent;
  }
}

/**
 * Function Chat에 특화된 헬퍼 함수들
 */
export class FunctionChatPromptHelper {
  static createCSVData(sheetData: any[]): string {
    if (!sheetData || sheetData.length === 0) return '';
    return sheetData.map(row => row.join(',')).join('\n');
  }
}