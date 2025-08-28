import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { TableDataJsonParserService } from './_table-data-json-parser.service';


@Controller('-table-data-json-parser')
export class TableDataJsonParserController {
	constructor(private readonly tableDataJsonParserService: TableDataJsonParserService) {}

	// GET /v2/sheet/-table-data-json-parser/load/:spreadSheetId/:parsedSheetName
	@Get('load/:spreadSheetId/:parsedSheetName')
	async loadParsedSpreadSheetData(
		@Param('spreadSheetId') spreadSheetId: string,
		@Param('parsedSheetName') parsedSheetName: string
	) {
		const result = await this.tableDataJsonParserService.loadParsedSpreadSheetData(
			spreadSheetId,
			parsedSheetName
		);

		return {
			success: true,
			data: result
		};
	}
}
