import { PartialType } from '@nestjs/mapped-types';
import { CreateAiutilDto } from './create-aiutil.dto';

export class UpdateAiutilDto extends PartialType(CreateAiutilDto) {} 