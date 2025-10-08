import { Controller, Post, Body } from '@nestjs/common';
import { InviteCodeService } from './invite-code.service';
import { createInviteCodeReqDto, createInviteCodeResDto } from './dto/invite-code.dto';

@Controller('invite-code')
export class InviteCodeController {
  constructor(private readonly inviteCodeService: InviteCodeService) {}

  @Post()
  async createInviteCode(
    @Body() dto: createInviteCodeReqDto,
  ): Promise<createInviteCodeResDto> {
    return this.inviteCodeService.createInviteCode(dto);
  }
}
