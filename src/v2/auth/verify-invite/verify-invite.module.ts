import { Module } from '@nestjs/common';
import { VerifyInviteService } from './verify-invite.service';
import { VerifyInviteController } from './verify-invite.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [VerifyInviteController],
  providers: [VerifyInviteService],
})
export class VerifyInviteModule {}
