/**
 * 逐个测试 9 份 demo 文件的解析兼容性
 * 使用规则引擎直接调用，不依赖前端
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

// 动态导入规则引擎 (ESM)
const { ParseEngine } = await import('../lib/parser/engine.js').catch(() => ({}));
// 如果 ESM 不行，用 tsx 执行
import { createRequire } from 'module';

// 预定义的规则集 — 每份文件对应的规则
const rules = [
  {
    name: '海口龙湖天街-标准表格+尾部',
    file: '12.25海口龙湖天街-配送发货单PS2512220005001(1).xlsx',
    parserType: 'excel',
    rule: {
      name: '海口龙湖天街规则',
      description: '42列表格，干扰头部，尾部收货人信息',
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
    name: '湖南仓-跨行聚合',
    file: '湖南仓.xlsx',
    parserType: 'excel',
    rule: {
      name: '湖南仓规则',
      description: '32列，按配送单号分组跨行聚合',
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
    name: '欢乐牧场-矩阵转置',
    file: '欢乐牧场模板0430.xlsx',
    parserType: 'excel',
    rule: {
      name: '欢乐牧场规则',
      description: 'SKU×门店矩阵，门店列横向排列',
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
    name: '黔寨寨PDF-标准表格',
    file: '黔寨寨贵州烙锅（鞍山店）常温.pdf',
    parserType: 'pdf',
    rule: {
      name: '黔寨寨PDF规则',
      description: 'PDF表格+底部收货人签字区',
      fileTypes: ['pdf'],
      identifier: {},
      parser: {
        type: 'table',
        table: {
          headerRow: 0,
          dataStartRow: 1,
          columns: [
            { sourceIndex: 1, targetField: 'itemCode', dataType: 'string' },
            { sourceIndex: 2, targetField: 'itemName', dataType: 'string' },
            { sourceIndex: 4, targetField: 'quantity', dataType: 'number' },
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
    name: '多门店分Sheet-合并',
    file: '多门店分Sheet出库单.xlsx',
    parserType: 'excel',
    rule: {
      name: '多门店分Sheet规则',
      description: '3个Sheet，每个Sheet独立门店出库单',
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
    name: '门店调拨单-卡片式',
    file: '门店调拨单-卡片式.xlsx',
    parserType: 'excel',
    rule: {
      name: '门店调拨单卡片规则',
      description: '卡片式堆叠，每条记录是一个独立区域',
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
    name: '门店配送确认单-Word纯文本',
    file: '门店配送确认单.docx',
    parserType: 'word',
    rule: {
      name: '门店配送确认单规则',
      description: '纯文本段落，━━━分隔线划分记录',
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
            { field: 'itemCode', regex: '编码:\\s*(\\S+)', group: 1 },
            { field: 'itemName', regex: '名称:\\s*(.+?)\\s*\\|', group: 1 },
            { field: 'specification', regex: '规格:\\s*(.+?)\\s*\\|', group: 1 },
            { field: 'quantity', regex: '数量:\\s*(\\d+)', group: 1 },
          ],
          orderSeparator: '━{10,}',
        },
      },
    },
  },
  {
    name: '周配送计划-双重矩阵',
    file: '周配送计划.xlsx',
    parserType: 'excel',
    rule: {
      name: '周配送计划规则',
      description: '门店×日期矩阵，单元格内物品x数量',
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
    name: '配送签收单-多单PDF',
    file: '配送签收单-多单.pdf',
    parserType: 'pdf',
    rule: {
      name: '配送签收单单规则',
      description: '一个PDF内含3个独立签收单',
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
                  { field: 'itemCode', regex: '(SKU-[A-Z0-9]+)', group: 1 },
                  { field: 'itemName', regex: 'SKU-[A-Z0-9]+\\s+(\\S+)', group: 1 },
                  { field: 'specification', regex: '\\d+[gGmMlL/]+\\S+', group: 0 },
                  { field: 'quantity', regex: '(\\d+)$', group: 1 },
                ],
              },
            },
          },
        },
      },
    },
  },
];

// 检查文件是否存在
console.log('=== 9 份 Demo 文件解析验证 ===\n');

for (const r of rules) {
  const filePath = path.join(publicDir, r.file);
  const exists = fs.existsSync(filePath);
  console.log(`${exists ? '✅' : '❌'} ${r.name}: ${r.file} ${exists ? '' : '(文件不存在!)'}`);
}
console.log('');

// 输出规则 JSON 供前端使用
const rulesOutput = rules.map(r => ({
  name: r.rule.name,
  description: r.rule.description,
  file: r.file,
  parserType: r.rule.parser.type,
  ruleJson: r.rule,
}));

const outputPath = path.join(__dirname, '..', 'tests', 'demo-rules.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(rulesOutput, null, 2), 'utf-8');
console.log(`✅ 规则配置已保存到: tests/demo-rules.json (${rulesOutput.length} 条规则)`);
console.log('\n下一步：通过前端 /api/parse 接口逐个测试解析结果');
