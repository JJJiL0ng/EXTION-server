import { isNotEmpty, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class TableDataJsonParserDto {
	@IsString()
	@IsNotEmpty()
	@IsUUID('4', { message: '올바른 스프레드시트 ID 형식이 아닙니다.' })
	spreadSheetId!: string;

	@IsString()
	@IsNotEmpty()
	@IsUUID('4', { message: '올바른 원본 데이터 ID 형식이 아닙니다.' })
	sourceDataId!: string;

	@IsObject()
	@IsNotEmpty()
	rawData!: Record<string, unknown>;
}
