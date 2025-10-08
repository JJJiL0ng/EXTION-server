import { Controller, Post, Body } from '@nestjs/common';
import { VerifyInviteService } from './verify-invite.service';
import { verifyResDto , verifyReqDto} from './dto/verifyInvite.dto';

@Controller('auth')
export class VerifyInviteController {
  constructor(private readonly verifyInviteService: VerifyInviteService) {}

  @Post('verify-invite')
  async verifyInvite(@Body() dto: verifyReqDto): Promise<verifyResDto> {
    return this.verifyInviteService.verifyInviteCode(dto);
  }
}
