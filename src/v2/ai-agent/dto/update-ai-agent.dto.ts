import { PartialType } from '@nestjs/swagger';
import { CreateAiAgentDto } from './create-ai-agent.dto';

export class UpdateAiAgentDto extends PartialType(CreateAiAgentDto) {}
