import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { DatabaseController } from './database.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth-modules/auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [DatabaseController],
  providers: [DatabaseService],
})
export class DatabaseModule {}
