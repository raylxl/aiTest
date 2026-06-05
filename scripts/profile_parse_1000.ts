import fs from 'node:fs/promises';
import path from 'node:path';
import { parseEngine } from '../lib/parser/engine';
import type { ParseRule } from '../types/rule';

const filePath = 'd:/WorkBuddy-projects/aiTest/perf-1000-hunan.xlsx';

const rule: ParseRule = {
  name: '性能测试-湖南仓1000单',
  description: '基于湖南仓结构的1000单性能验证规则',
  fileTypes: ['excel'],
  identifier: {},
  parser: {
    type: 'table',
    table: {
      headerRow: 1,
      dataStartRow: 2,
      columns: [
        { sourceIndex: 0, targetField: '收货门店', dataType: 'string' },
        { sourceIndex: 2, targetField: '运单号', dataType: 'string' },
        { sourceIndex: 5, targetField: '物品编码', dataType: 'string' },
        { sourceIndex: 6, targetField: '物品名称', dataType: 'string' },
        { sourceIndex: 8, targetField: '规格型号', dataType: 'string' },
        { sourceIndex: 12, targetField: '发货数量', dataType: 'number' },
      ],
    },
  },
};

async function main() {
  const file = await fs.readFile(filePath);
  const arrayBuffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);

  const start = performance.now();
  const result = await parseEngine.parseFile(arrayBuffer, path.basename(filePath), rule);
  const elapsed = performance.now() - start;

  console.log(JSON.stringify({
    success: result.success,
    totalRows: result.totalRows,
    errorRows: result.errorRows,
    parseTimeMs: result.metadata?.parseTime,
    wallTimeMs: Math.round(elapsed),
    sample: result.orders.slice(0, 2),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
