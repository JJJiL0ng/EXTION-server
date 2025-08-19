import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';
import helmet from 'helmet';

async function bootstrap() {
  // ✨ IMPROVEMENT: 로거 인스턴스를 초기에 생성하여 일관되게 사용합니다.
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    // ✨ IMPROVEMENT: 환경에 따라 로그 레벨을 동적으로 설정합니다.
    logger: process.env.NODE_ENV === 'production' 
      ? ['warn', 'error']
      : ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  // ✨ ADDED: 기본적인 웹 보안을 위한 Helmet 미들웨어를 추가합니다.
  app.use(helmet());

  // ✨ IMPROVEMENT: ConfigService를 가져와 환경 변수를 중앙에서 관리합니다.
  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const port = configService.get<number>('PORT', 8080);
  
  // JSON payload 크기 제한 증가
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // ✨ IMPROVEMENT: CORS 허용 목록을 환경 변수에서 동적으로 가져옵니다.
  // .env 파일 예시: CORS_ORIGINS=http://localhost:3000,https://extion-beta.vercel.app,https://extion.co
  const corsOriginsFromEnv = configService.get<string>('CORS_ORIGINS');
  const corsOrigins = corsOriginsFromEnv ? corsOriginsFromEnv.split(',') : [
    'http://localhost:3000', // 환경 변수가 없을 경우의 기본값
  ];
  
  // Railway 내부 통신 및 기타 고정 origin 추가
  const fixedOrigins = [
    'https://docs.google.com',
    'https://*.googleusercontent.com',
    'https://extion-server.railway.internal',
  ];
  const allowedOrigins = [...corsOrigins, ...fixedOrigins];

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      
      const isAllowed = allowedOrigins.some(allowedOrigin => {
        if (allowedOrigin.includes('*')) {
          const regex = new RegExp(`^${allowedOrigin.replace(/\*/g, '.*')}$`);
          return regex.test(origin);
        }
        return origin === allowedOrigin;
      });
      
      if (isAllowed) {
        callback(null, true);
      } else {
        logger.warn(`CORS: Blocked origin - ${origin}`);
        callback(new Error('Not allowed by CORS policy'), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [ 'Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Access-Control-Request-Method', 'Access-Control-Request-Headers', 'cache-control' ],
    exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
  });

  // 전역 파이프 설정 (DTO 유효성 검증)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      disableErrorMessages: nodeEnv === 'production',
    }),
  );

  // ✨ IMPROVEMENT: 프로덕션 환경이 아닐 때만 Swagger 문서를 활성화합니다.
  if (nodeEnv !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Extion Server API')
      .setDescription('AI-powered spreadsheet processing system API documentation')
      .setVersion('2.0')
      .addTag('Main Chat', 'AI 채팅 관련 API')
      .addBearerAuth()
      .build();
    
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        tryItOutEnabled: true,
      },
      customSiteTitle: 'Extion API Docs (Dev)',
    });
    logger.log('📄 Swagger UI is enabled on /docs');
  }

  // ✨ ADDED: 시스템 종료 신호를 감지하여 앱을 우아하게 종료합니다.
  app.enableShutdownHooks();
  
  await app.listen(port, '0.0.0.0');
  
  logger.log(`🚀 Extion AI Server is running on port ${port} (${nodeEnv} mode)`);
  if (nodeEnv !== 'production') {
    logger.debug(`Allowed CORS origins: ${JSON.stringify(allowedOrigins)}`);
  }
}

bootstrap().catch((error) => {
  // 부트스트랩 과정에서 에러 발생 시 로그를 남기고 프로세스를 종료합니다.
  const logger = new Logger('Bootstrap-Error');
  logger.error('❌ Failed to start server:', error);
  process.exit(1);
});