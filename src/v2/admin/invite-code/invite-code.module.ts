import { Module } from '@nestjs/common';
import { InviteCodeService } from './invite-code.service';
import { InviteCodeController } from './invite-code.controller';
import { PrismaModule } from '../../prisma/prisma.module';


@Module({
  imports: [PrismaModule],
  controllers: [InviteCodeController],
  providers: [InviteCodeService],
})
export class InviteCodeModule {}
