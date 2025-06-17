export class ExplanationDto {
    korean?: string;
    english?: string;
    japanese?: string;
    chinese?: string;
    german?: string;
    french?: string;
    spanish?: string;
    italian?: string;
    portuguese?: string;
    hindi?: string;
    russian?: string;
  }
  
  // 다국어 지원을 위한 헬퍼 타입
  export type SupportedLanguage = 'ko' | 'en' | 'ja' | 'zh' | 'de' | 'fr' | 'es' | 'it' | 'pt' | 'hi' | 'ru';
  
  export interface LocalizedContent {
    [key: string]: string; // 언어별 컨텐츠
  }