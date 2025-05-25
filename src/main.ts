import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import * as express from 'express'; // 추가

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ✅ JSON payload 크기 제한 증가 (추가)
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
      disableErrorMessages: false,
    }),
  );

  // 포트 설정 (기본값: 8080)
  const port = process.env.PORT || 8080;
  
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Extion Server is running on port ${port}`);
}

bootstrap().catch((error) => {
  console.error('❌ Failed to start서버:', error);
  process.exit(1);
});