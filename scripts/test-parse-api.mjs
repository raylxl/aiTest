/**
 * 通过 /api/parse 接口逐个测试 9 份 demo 文件
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
const API = 'http://localhost:3000/api/parse';

const testCases = [
  {
    name: '1. 海口龙湖天街 (table+尾部)',
    file: '12.25海口龙湖天街-配送发货单PS2512220005001(1).xlsx',
    rule: {
      name: '海口龙湖天街规则',
      fileTypes: ['excel'],
      identifier: {},
      parser: {
        type: 'table',
        table: {
          headerRow: 3,
          dataStartRow: 4,
          dataEndRow: 'auto',
          columns: [
            { sourceIndex: 1, targetField: 'itemCode', dataType: 'string' },
            { sourceIndex: 2, targetField: 'itemName', dataType: 'string' },
            { sourceIndex: 4, targetField: 'specification', dataType: 'string' },
            { sourceIndex: 5, targetField: 'quantity', dataType: 'number' },
          ],
        },
      },
      recipient: {
        source: 'footer',
        fields: {
          storeName: { pattern: '门店[：:]\\s*(.+)', group: 1 },
          receiverName: { pattern: '收货人[：:]\\s*(.+)', group: 1 },
          receiverPhone: { pattern: '(?:电话|手机)[：:]\\s*(\\d+)', group: 1 },
          receiverAddress: { pattern: '地址[：:]\\s*(.+)', group: 1 },
        },
      },
    },
  },
  {
    name: '2. 湖南仓 (table+跨行聚合)',
    file: '湖南仓.xlsx',
    rule: {
      name: '湖南仓规则',
      fileTypes: ['excel'],
      identifier: {},
      parser: {
        type: 'table',
        table: {
          headerRow: 1,
          dataStartRow: 2,
          dataEndRow: 'auto',
          columns: [
            { sourceIndex: 0, targetField: 'orderNo', dataType: 'string' },
            { sourceIndex: 2, targetField: 'itemCode', dataType: 'string' },
            { sourceIndex: 3, targetField: 'itemName', dataType: 'string' },
            { sourceIndex: 5, targetField: 'quantity', dataType: 'number' },
            { sourceIndex: 7, targetField: 'receiverName', dataType: 'string' },
            { sourceIndex: 8, targetField: 'receiverPhone', dataType: 'string' },
            { sourceIndex: 9, targetField: 'receiverAddress', dataType: 'string' },
          ],
          rowAggregate: {
            enabled: true,
            groupBy: [0],
            continueWhenColumnsEmpty: [2, 3, 5],
          },
        },
      },
    },
  },
  {
    name: '3. 欢乐牧场 (matrix)',
    file: '欢乐牧场模板0430.xlsx',
    rule: {
      name: '欢乐牧场规则',
      fileTypes: ['excel'],
      identifier: {},
      parser: {
        type: 'matrix',
        matrix: {
          headerRow: 1,
          skuColumn: 1,
          skuCodeColumn: 0,
          storeColumns: [],
        },
      },
    },
  },
  {
    name: '4. 黔寨寨PDF (text+跨行)',
    file: '黔寨寨贵州烙锅（鞍山店）常温.pdf',
    rule: {
      name: '黔寨寨PDF规则',
      fileTypes: ['pdf'],
      identifier: {},
      parser: {
        type: 'text',
        text: {
          patterns: [
            { field: 'storeName', regex: '收货机构[：:]\\s*(.+)', group: 1 },
            { field: 'orderNo', regex: '单据编号[：:]\\s*(\\S+)', group: 1 },
          ],
          itemPatterns: [
            { field: 'itemCode', regex: '^([A-Z]{2,4}\\d{3,})$', group: 1 },
            { field: 'itemName', regex: '([\\u4e00-\\u9fa5].{2,})', group: 1 },
            { field: 'quantity', regex: '^(\\d+)$', group: 1 },
          ],
        },
      },
    },
  },
  {
    name: '5. 多门店分Sheet (multi-sheet)',
    file: '多门店分Sheet出库单.xlsx',
    rule: {
      name: '多门店分Sheet规则',
      fileTypes: ['excel'],
      identifier: {},
      parser: {
        type: 'multi-sheet',
        multiSource: {
          sourceType: 'sheet',
          mergeStrategy: 'append',
          subRule: {
            parser: {
              type: 'table',
              table: {
                headerRow: 0,
                dataStartRow: 1,
                columns: [
                  { sourceIndex: 0, targetField: 'itemCode', dataType: 'string' },
                  { sourceIndex: 1, targetField: 'itemName', dataType: 'string' },
                  { sourceIndex: 2, targetField: 'quantity', dataType: 'number' },
                ],
              },
            },
            recipient: {
              source: 'footer',
              fields: {
                storeName: { pattern: '门店[：:]\\s*(.+)', group: 1 },
                receiverName: { pattern: '收货人[：:]\\s*(.+)', group: 1 },
                receiverPhone: { pattern: '(?:电话|手机)[：:]\\s*(\\d+)', group: 1 },
                receiverAddress: { pattern: '地址[：:]\\s*(.+)', group: 1 },
              },
            },
          },
        },
      },
    },
  },
  {
    name: '6. 门店调拨单 (card)',
    file: '门店调拨单-卡片式.xlsx',
    rule: {
      name: '门店调拨单卡片规则',
      fileTypes: ['excel'],
      identifier: {},
      parser: {
        type: 'card',
        card: {
          cardStartPattern: '▶\\s*调拨记录',
          cardFields: [
            { field: 'storeName', pattern: '门店[：:]\\s*(.+)', group: 1 },
            { field: 'receiverName', pattern: '联系人[：:]\\s*(.+)', group: 1 },
            { field: 'receiverPhone', pattern: '电话[：:]\\s*(\\d+)', group: 1 },
          ],
          itemTable: {
            headerRowOffset: 1,
            columns: [
              { sourceIndex: 0, targetField: 'itemCode', dataType: 'string' },
              { sourceIndex: 1, targetField: 'itemName', dataType: 'string' },
              { sourceIndex: 2, targetField: 'quantity', dataType: 'number' },
            ],
          },
        },
      },
    },
  },
  {
    name: '7. 门店配送确认单 (Word text)',
    file: '门店配送确认单.docx',
    rule: {
      name: '门店配送确认单规则',
      fileTypes: ['word'],
      identifier: {},
      parser: {
        type: 'text',
        text: {
          patterns: [
            { field: 'orderNo', regex: '编号[：:]\\s*(\\S+)', group: 1 },
            { field: 'storeName', regex: '门店[：:]\\s*(.+)', group: 1 },
            { field: 'receiverAddress', regex: '地址[：:]\\s*(.+)', group: 1 },
            { field: 'receiverName', regex: '联系人[：:]\\s*(\\S+)', group: 1 },
            { field: 'receiverPhone', regex: '电话[：:]\\s*(\\d+)', group: 1 },
          ],
          itemPatterns: [
            { field: 'itemCode', regex: '编码[：:]\\s*(\\S+)', group: 1 },
            { field: 'itemName', regex: '名称[：:]\\s*(.+?)\\s*\\|', group: 1 },
            { field: 'specification', regex: '规格[：:]\\s*(.+?)\\s*\\|', group: 1 },
            { field: 'quantity', regex: '数量[：:]\\s*(\\d+)', group: 1 },
          ],
          orderSeparator: '━{10,}',
        },
      },
    },
  },
  {
    name: '8. 周配送计划 (double-matrix)',
    file: '周配送计划.xlsx',
    rule: {
      name: '周配送计划规则',
      fileTypes: ['excel'],
      identifier: {},
      parser: {
        type: 'double-matrix',
        matrix: {
          headerRow: 0,
          firstColumnIsStore: true,
          storeColumnIndex: 0,
          dataStartColumn: 1,
          itemPattern: '(.+?)\\s*[xX×]\\s*(\\d+)',
        },
      },
    },
  },
  {
    name: '9. 配送签收单-多单PDF (multi-page)',
    file: '配送签收单-多单.pdf',
    rule: {
      name: '配送签收单多单规则',
      fileTypes: ['pdf'],
      identifier: {},
      parser: {
        type: 'multi-page',
        multiSource: {
          sourceType: 'page',
          mergeStrategy: 'append',
          subRule: {
            parser: {
              type: 'text',
              text: {
                patterns: [
                  { field: 'orderNo', regex: '配送单号[：:]\\s*(\\S+)', group: 1 },
                  { field: 'storeName', regex: '收货门店[：:]\\s*(.+)', group: 1 },
                  { field: 'receiverAddress', regex: '收货地址[：:]\\s*(.+)', group: 1 },
                  { field: 'receiverName', regex: '联系人[：:]\\s*(\\S+)', group: 1 },
                  { field: 'receiverPhone', regex: '电话[：:]\\s*(\\d+)', group: 1 },
                ],
            itemPatterns: [
              { field: 'itemCode', regex: '(SKU-[A-Z0-9]+)\\s*/', group: 1 },
              { field: 'itemName', regex: 'SKU-[A-Z0-9]+\\s*/\\s*(.+?)\\s*/', group: 1 },
              { field: 'specification', regex: 'SKU-[A-Z0-9]+\\s*/\\s*.+?\\s*/\\s*(.+?)\\s*/', group: 1 },
              { field: 'quantity', regex: '/\\s*(\\d+)\\s*$', group: 1 },
            ],
              },
            },
          },
        },
      },
    },
  },
];

async function testParse(tc) {
  const filePath = path.join(publicDir, tc.file);
  const buffer = fs.readFileSync(filePath);
  const blob = new Blob([buffer]);
  const formData = new FormData();
  formData.append('file', blob, tc.file);
  formData.append('rule', JSON.stringify(tc.rule));

  try {
    const resp = await fetch(API, { method: 'POST', body: formData });
    const data = await resp.json();

    if (!resp.ok) {
      return { success: false, error: data.error || `HTTP ${resp.status}`, orders: 0 };
    }

    const orders = data.orders || [];
    const valid = orders.filter(o => o.isValid).length;
    const invalid = orders.filter(o => !o.isValid).length;

    return {
      success: data.success,
      total: orders.length,
      valid,
      invalid,
      sample: orders.slice(0, 2).map(o => ({
        orderNo: o.orderNo,
        storeName: o.storeName,
        itemCode: o.itemCode,
        itemName: o.itemName,
        quantity: o.quantity,
      })),
      parseTime: data.metadata?.parseTime,
      errors: data.errors,
    };
  } catch (err) {
    return { success: false, error: err.message, orders: 0 };
  }
}

console.log('=== 逐个测试 9 份 Demo 文件解析 ===\n');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
for (const tc of testCases) {
  process.stdout.write(`测试 ${tc.name} ... `);
  await sleep(3000); // 3s delay between requests to avoid 429
  const result = await testParse(tc);
  results.push({ name: tc.name, ...result });

  if (result.success) {
    console.log(`✅ ${result.total}条 (有效${result.valid} / 有误${result.invalid}) ${result.parseTime ? `[${result.parseTime}ms]` : ''}`);
    if (result.sample?.[0]) {
      const s = result.sample[0];
      console.log(`   示例: ${s.orderNo || '-'} | ${s.storeName || '-'} | ${s.itemCode || '-'} | ${s.itemName || '-'} | 数量:${s.quantity ?? '-'}`);
    }
  } else {
    console.log(`❌ ${result.error}`);
  }
}

console.log('\n=== 汇总 ===');
const passed = results.filter(r => r.success && r.total > 0).length;
const failed = results.filter(r => !r.success || r.total === 0).length;
console.log(`通过: ${passed}/9  失败: ${failed}/9`);

if (failed > 0) {
  console.log('\n失败项:');
  results.filter(r => !r.success || r.total === 0).forEach(r => {
    console.log(`  ❌ ${r.name}: ${r.error || '解析结果为空'}`);
  });
}
