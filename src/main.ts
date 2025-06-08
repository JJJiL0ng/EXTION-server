import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import * as express from 'express';

async function bootstrap() {
 const app = await NestFactory.create(AppModule, {
   logger: process.env.NODE_ENV === 'production' 
     ? ['error', 'warn'] // 프로덕션: error, warn만
     : ['log', 'error', 'warn', 'debug', 'verbose'] // 개발: 모든 로그
 });

 // JSON payload 크기 제한 증가
 app.use(express.json({ limit: '10mb' }));
 app.use(express.urlencoded({ limit: '10mb', extended: true }));

 // CORS 설정
 app.enableCors({
   origin: [
     'http://localhost:3000',
     'https://docs.google.com',
     'https://*.googleusercontent.com',
     'https://extion-server.railway.internal',
     'https://extion-beta.vercel.app'
   ],
   credentials: true,
   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
   allowedHeaders: ['Content-Type', 'Authorization'],
 });

 // 전역 파이프 설정 (DTO 유효성 검증)
 app.useGlobalPipes(
   new ValidationPipe({
     whitelist: true,
     forbidNonWhitelisted: true,
     transform: true,
     disableErrorMessages: process.env.NODE_ENV === 'production', // 프로덕션에서 에러 메시지 숨김
   }),
 );

 // 포트 설정 (기본값: 8080)
 const port = process.env.PORT || 8080;
 
 await app.listen(port, '0.0.0.0');
 
 // 환경별 로그 출력
 const logger = new Logger('Bootstrap');
 if (process.env.NODE_ENV === 'production') {
   logger.log(`🚀 Extion Server is running on port ${port}`);
 } else {
   logger.log(`🚀 Extion Server is running on port ${port} (${process.env.NODE_ENV || 'development'} mode)`);
   logger.debug(`CORS origins: ${JSON.stringify(app.get('cors').origin)}`);
 }
}

bootstrap().catch((error) => {
 const logger = new Logger('Bootstrap');
 logger.error('❌ Failed to start server:', error);
 process.exit(1);
});