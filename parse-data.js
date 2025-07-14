const { TableDataJsonParsingService } = require('./dist/v2/sheet/table-data-json-parsing/table-data-json-parsing.service');
const fs = require('fs');

// 서비스 인스턴스 생성
const service = new TableDataJsonParsingService({ logLevel: 'warn' });

// 파일 읽기
const filePath = 'src/v2/sheet/table-data-json-parsing/test.json/multi-formula.json';
const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

console.log('🔍 onlyDataParser 전체 파싱 결과');
console.log('='.repeat(80));

const result = service.onlyDataParser(jsonData);

result.forEach((sheet, sheetIndex) => {
  console.log(`\n📊 시트 ${sheetIndex + 1}: ${sheet.sheetName}`);
  console.log('-'.repeat(60));
  
  // 기본 정보
  console.log(`📋 기본 정보:`);
  console.log(`  - 셀 개수: ${sheet.cells.length}`);
  console.log(`  - 테이블 개수: ${sheet.tables?.length || 0}`);
  
  // 모든 셀 데이터 출력
  console.log(`\n📝 모든 셀 데이터:`);
  sheet.cells.forEach((cell, cellIndex) => {
    console.log(`  셀 ${cellIndex + 1}: [행=${cell.row}, 열=${cell.col}] = ${JSON.stringify(cell.value)}`);
    if (cell.formula) {
      console.log(`    📐 수식: ${cell.formula}`);
    }
  });
  
  // 테이블 정보 출력
  if (sheet.tables && sheet.tables.length > 0) {
    console.log(`\n📋 테이블 정보:`);
    sheet.tables.forEach((table, tableIndex) => {
      console.log(`  테이블 ${tableIndex + 1}: ${table.name}`);
      console.log(`    - 위치: [${table.startRow}, ${table.startCol}] ~ [${table.endRow}, ${table.endCol}]`);
      console.log(`    - 크기: ${table.endRow - table.startRow + 1}행 × ${table.endCol - table.startCol + 1}열`);
      console.log(`    - 컬럼:`);
      table.columns.forEach((col, colIndex) => {
        console.log(`      컬럼 ${colIndex + 1}: ID=${col.id}, 이름=${col.name}`);
      });
    });
  }
  
  console.log('\n' + '='.repeat(80));
});

console.log(`\n✅ 총 ${result.length}개 시트 파싱 완료!`); 