import { TableDataJsonParsingService } from './src/v2/sheet/table-data-json-parsing/table-data-json-parsing.service';
import * as fs from 'fs';
import * as path from 'path';

// 명령행 인수 처리
const filePath = process.argv[2] || 'src/v2/sheet/table-data-json-parsing/test.json/multi-formula.json';

console.log(`🔍 파일 파싱: ${filePath}`);
console.log('='.repeat(80));

try {
  // 파일 읽기
  const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  // 서비스 인스턴스 생성
  const service = new TableDataJsonParsingService({ logLevel: 'warn' });
  
  // 데이터 파싱
  const result = service.onlyDataParser(jsonData);
  
  console.log(`📊 파싱 결과: ${result.length}개 시트`);
  console.log();
  
  result.forEach((sheet, index) => {
    console.log(`📋 시트 ${index + 1}: "${sheet.sheetName}"`);
    console.log(`   셀: ${sheet.cells.length}개, 테이블: ${sheet.tables?.length || 0}개`);
    
    // 셀 데이터 요약
    if (sheet.cells.length > 0) {
      console.log(`   셀 데이터:`);
      sheet.cells.forEach((cell, i) => {
        const formula = cell.formula ? ` (수식: ${cell.formula})` : '';
        console.log(`     [${cell.row},${cell.col}]: ${JSON.stringify(cell.value)}${formula}`);
      });
    }
    
    // 테이블 정보
    if (sheet.tables && sheet.tables.length > 0) {
      console.log(`   테이블:`);
      sheet.tables.forEach((table, i) => {
        console.log(`     ${table.name}: ${table.endRow - table.startRow + 1}행 × ${table.endCol - table.startCol + 1}열`);
        table.columns.forEach(col => {
          console.log(`       - ${col.name} (ID: ${col.id})`);
        });
      });
    }
    console.log();
  });
  
  // 결과를 JSON 파일로 저장
  const outputDir = 'src/v2/sheet/table-data-json-parsing/test.json';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const inputFileName = path.basename(filePath, path.extname(filePath));
  const outputFileName = `${inputFileName}-parsed-${timestamp}.json`;
  const outputPath = path.join(outputDir, outputFileName);
  
  // 출력 디렉토리가 없으면 생성
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // 결과 데이터 준비
  const outputData = {
    metadata: {
      sourceFile: filePath,
      parsedAt: new Date().toISOString(),
      totalSheets: result.length,
      totalCells: result.reduce((sum, sheet) => sum + sheet.cells.length, 0),
      totalTables: result.reduce((sum, sheet) => sum + (sheet.tables?.length || 0), 0)
    },
    sheets: result
  };
  
  // JSON 파일로 저장
  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf8');
  
  console.log('💾 결과 저장:');
  console.log(`   📁 경로: ${outputPath}`);
  console.log(`   📊 총 셀: ${outputData.metadata.totalCells}개`);
  console.log(`   📋 총 테이블: ${outputData.metadata.totalTables}개`);
  console.log(`   📄 총 시트: ${outputData.metadata.totalSheets}개`);
  
  console.log('\n✅ 파싱 완료!');
  
} catch (error) {
  console.error('❌ 오류:', error.message);
  process.exit(1);
} 