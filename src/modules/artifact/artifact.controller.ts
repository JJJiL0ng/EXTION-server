//src/modules/artifact/artifact.controller.ts
import { Controller, Post, Body, HttpStatus, HttpCode } from '@nestjs/common';
import { ArtifactService } from './artifact.service';
import { GenerateArtifactDto, ArtifactResponseDto } from './dto/generate-artifact.dto';


@Controller('artifact')
export class ArtifactController {
  constructor(private readonly artifactService: ArtifactService) {}

  @Post('generate')
  @HttpCode(HttpStatus.OK)

  async generateArtifact(
    @Body() generateArtifactDto: GenerateArtifactDto
  ): Promise<ArtifactResponseDto> {
    return this.artifactService.generateArtifact(generateArtifactDto);
  }
}