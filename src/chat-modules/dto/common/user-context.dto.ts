import { IsString, IsOptional, IsIn, IsEnum } from 'class-validator';

// 지원하는 국가 코드 (ISO 3166-1 alpha-2)
export enum SupportedCountry {
  KR = 'KR', // 한국
  US = 'US', // 미국
  JP = 'JP', // 일본
  CN = 'CN', // 중국
  DE = 'DE', // 독일
  FR = 'FR', // 프랑스
  GB = 'GB', // 영국
  ES = 'ES', // 스페인
  IT = 'IT', // 이탈리아
  BR = 'BR', // 브라질
  IN = 'IN', // 인도
  RU = 'RU', // 러시아
}

// 지원하는 언어 코드 (ISO 639-1)
export enum SupportedLanguage {
  KO = 'ko', // 한국어
  EN = 'en', // 영어
  JA = 'ja', // 일본어
  ZH = 'zh', // 중국어
  DE = 'de', // 독일어
  FR = 'fr', // 프랑스어
  ES = 'es', // 스페인어
  IT = 'it', // 이탈리아어
  PT = 'pt', // 포르투갈어
  HI = 'hi', // 힌디어
  RU = 'ru', // 러시아어
}

// 지원하는 통화 코드 (ISO 4217)
export enum SupportedCurrency {
  KRW = 'KRW', // 한국 원
  USD = 'USD', // 미국 달러
  JPY = 'JPY', // 일본 엔
  CNY = 'CNY', // 중국 위안
  EUR = 'EUR', // 유로
  GBP = 'GBP', // 영국 파운드
  BRL = 'BRL', // 브라질 헤알
  INR = 'INR', // 인도 루피
  RUB = 'RUB', // 러시아 루블
}

// 날짜 형식
export enum DateFormat {
  YYYY_MM_DD = 'YYYY-MM-DD',         // 2025-06-17 (ISO, 한국, 중국 등)
  MM_DD_YYYY = 'MM/DD/YYYY',         // 06/17/2025 (미국)
  DD_MM_YYYY = 'DD/MM/YYYY',         // 17/06/2025 (유럽)
  DD_MON_YYYY = 'DD-MMM-YYYY',       // 17-Jun-2025
  YYYY_MM_DD_DOT = 'YYYY.MM.DD',     // 2025.06.17 (독일 등)
}

// 숫자 형식 (천 단위 구분자)
export enum NumberFormat {
  COMMA = 'comma',    // 1,000,000 (미국, 한국 등)
  PERIOD = 'period',  // 1.000.000 (독일, 이탈리아 등)
  SPACE = 'space',    // 1 000 000 (프랑스 등)
}

// 시간 형식
export enum TimeFormat {
  HOUR_24 = '24h',    // 23:59
  HOUR_12 = '12h',    // 11:59 PM
}

export class UserContextDto {
  @IsEnum(SupportedCountry)
  countryCode: SupportedCountry; // 필수: 국가 코드

  @IsOptional()
  @IsEnum(SupportedLanguage)
  language?: SupportedLanguage; // 선택: 언어 코드

  @IsOptional()
  @IsString()
  timezone?: string; // 선택: IANA 시간대 (예: 'Asia/Seoul', 'America/New_York')

  @IsOptional()
  @IsEnum(SupportedCurrency)
  currency?: SupportedCurrency; // 선택: 통화 코드

  @IsOptional()
  @IsEnum(DateFormat)
  dateFormat?: DateFormat; // 선택: 날짜 형식

  @IsOptional()
  @IsEnum(NumberFormat)
  numberFormat?: NumberFormat; // 선택: 숫자 형식

  @IsOptional()
  @IsEnum(TimeFormat)
  timeFormat?: TimeFormat; // 선택: 시간 형식

  @IsOptional()
  @IsString()
  locale?: string; // 선택: 전체 로케일 (예: 'ko-KR', 'en-US')
}

// 국가별 기본 설정 매핑
export const COUNTRY_DEFAULTS: Record<SupportedCountry, Partial<UserContextDto>> = {
  [SupportedCountry.KR]: {
    language: SupportedLanguage.KO,
    currency: SupportedCurrency.KRW,
    dateFormat: DateFormat.YYYY_MM_DD,
    numberFormat: NumberFormat.COMMA,
    timeFormat: TimeFormat.HOUR_24,
    timezone: 'Asia/Seoul',
    locale: 'ko-KR',
  },
  [SupportedCountry.US]: {
    language: SupportedLanguage.EN,
    currency: SupportedCurrency.USD,
    dateFormat: DateFormat.MM_DD_YYYY,
    numberFormat: NumberFormat.COMMA,
    timeFormat: TimeFormat.HOUR_12,
    timezone: 'America/New_York',
    locale: 'en-US',
  },
  [SupportedCountry.JP]: {
    language: SupportedLanguage.JA,
    currency: SupportedCurrency.JPY,
    dateFormat: DateFormat.YYYY_MM_DD,
    numberFormat: NumberFormat.COMMA,
    timeFormat: TimeFormat.HOUR_24,
    timezone: 'Asia/Tokyo',
    locale: 'ja-JP',
  },
  [SupportedCountry.CN]: {
    language: SupportedLanguage.ZH,
    currency: SupportedCurrency.CNY,
    dateFormat: DateFormat.YYYY_MM_DD,
    numberFormat: NumberFormat.COMMA,
    timeFormat: TimeFormat.HOUR_24,
    timezone: 'Asia/Shanghai',
    locale: 'zh-CN',
  },
  [SupportedCountry.DE]: {
    language: SupportedLanguage.DE,
    currency: SupportedCurrency.EUR,
    dateFormat: DateFormat.YYYY_MM_DD_DOT,
    numberFormat: NumberFormat.PERIOD,
    timeFormat: TimeFormat.HOUR_24,
    timezone: 'Europe/Berlin',
    locale: 'de-DE',
  },
  [SupportedCountry.FR]: {
    language: SupportedLanguage.FR,
    currency: SupportedCurrency.EUR,
    dateFormat: DateFormat.DD_MM_YYYY,
    numberFormat: NumberFormat.SPACE,
    timeFormat: TimeFormat.HOUR_24,
    timezone: 'Europe/Paris',
    locale: 'fr-FR',
  },
  [SupportedCountry.GB]: {
    language: SupportedLanguage.EN,
    currency: SupportedCurrency.GBP,
    dateFormat: DateFormat.DD_MM_YYYY,
    numberFormat: NumberFormat.COMMA,
    timeFormat: TimeFormat.HOUR_24,
    timezone: 'Europe/London',
    locale: 'en-GB',
  },
  [SupportedCountry.ES]: {
    language: SupportedLanguage.ES,
    currency: SupportedCurrency.EUR,
    dateFormat: DateFormat.DD_MM_YYYY,
    numberFormat: NumberFormat.PERIOD,
    timeFormat: TimeFormat.HOUR_24,
    timezone: 'Europe/Madrid',
    locale: 'es-ES',
  },
  [SupportedCountry.IT]: {
    language: SupportedLanguage.IT,
    currency: SupportedCurrency.EUR,
    dateFormat: DateFormat.DD_MM_YYYY,
    numberFormat: NumberFormat.PERIOD,
    timeFormat: TimeFormat.HOUR_24,
    timezone: 'Europe/Rome',
    locale: 'it-IT',
  },
  [SupportedCountry.BR]: {
    language: SupportedLanguage.PT,
    currency: SupportedCurrency.BRL,
    dateFormat: DateFormat.DD_MM_YYYY,
    numberFormat: NumberFormat.PERIOD,
    timeFormat: TimeFormat.HOUR_24,
    timezone: 'America/Sao_Paulo',
    locale: 'pt-BR',
  },
  [SupportedCountry.IN]: {
    language: SupportedLanguage.HI,
    currency: SupportedCurrency.INR,
    dateFormat: DateFormat.DD_MM_YYYY,
    numberFormat: NumberFormat.COMMA,
    timeFormat: TimeFormat.HOUR_12,
    timezone: 'Asia/Kolkata',
    locale: 'hi-IN',
  },
  [SupportedCountry.RU]: {
    language: SupportedLanguage.RU,
    currency: SupportedCurrency.RUB,
    dateFormat: DateFormat.DD_MM_YYYY,
    numberFormat: NumberFormat.SPACE,
    timeFormat: TimeFormat.HOUR_24,
    timezone: 'Europe/Moscow',
    locale: 'ru-RU',
  },
};

// 헬퍼 함수: 국가 코드로 기본 설정 가져오기
export function getDefaultContextByCountry(countryCode: SupportedCountry): UserContextDto {
  const defaults = COUNTRY_DEFAULTS[countryCode];
  return {
    countryCode,
    ...defaults,
  } as UserContextDto;
}

// 헬퍼 함수: 사용자 컨텍스트 병합 (사용자 설정 + 기본값)
export function mergeUserContext(
  countryCode: SupportedCountry,
  userPreferences?: Partial<UserContextDto>
): UserContextDto {
  const defaults = getDefaultContextByCountry(countryCode);
  return {
    ...defaults,
    ...userPreferences,
    countryCode, // 국가 코드는 항상 유지
  };
}