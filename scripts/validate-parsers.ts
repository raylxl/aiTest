/**
 * 解析器验证脚本 - 验证各 parser 能否正常工作
 *
 * 使用方法:
 *   npx tsx scripts/validate-parsers.ts
 *
 * 功能:
 *   1. 测试各 parser 的导入
 *   2. 测试公共字段映射模块
 *   3. 测试规则校验器
 *   4. 输出验证结果
 */

import { mapFieldName, fuzzyMatchFieldName, KNOWN_TARGET_FIELDS, FIELD_NAME_MAPPING } from '../lib/parser/field-mapper';
import { validateParseRule, formatValidationErrors } from '../lib/parser/validator';

interface TestResult {
  name: string;
  passed: boolean;
  message?: string;
}

function runTest(name: string, fn: () => void): TestResult {
  try {
    fn();
    return { name, passed: true };
  } catch (error) {
    return {
      name,
      passed: false,
      message: error instanceof Error ? error.message : '未知错误',
    };
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

// 测试用例
const tests: Array<{ name: string; fn: () => void }> = [
  // 字段映射测试
  {
    name: 'mapFieldName: 已知英文字段透传',
    fn: () => {
      assert(mapFieldName('orderNo') === 'orderNo', 'orderNo 应透传');
      assert(mapFieldName('storeName') === 'storeName', 'storeName 应透传');
      assert(mapFieldName('quantity') === 'quantity', 'quantity 应透传');
    },
  },
  {
    name: 'mapFieldName: 中文字段映射',
    fn: () => {
      assert(mapFieldName('运单号') === 'orderNo', '运单号 -> orderNo');
      assert(mapFieldName('收货门店') === 'storeName', '收货门店 -> storeName');
      assert(mapFieldName('数量') === 'quantity', '数量 -> quantity');
      assert(mapFieldName('商品名称') === 'itemName', '商品名称 -> itemName');
    },
  },
  {
    name: 'mapFieldName: 未知字段返回 null',
    fn: () => {
      assert(mapFieldName('未知字段') === null, '未知字段应返回 null');
      assert(mapFieldName('') === null, '空字符串应返回 null');
    },
  },
  {
    name: 'fuzzyMatchFieldName: 关键词匹配',
    fn: () => {
      const result = fuzzyMatchFieldName('配送单号');
      assert(result === 'orderNo', '配送单号应模糊匹配到 orderNo');
    },
  },
  {
    name: 'KNOWN_TARGET_FIELDS: 包含所有标准字段',
    fn: () => {
      const requiredFields = ['orderNo', 'storeName', 'receiverName', 'quantity', 'itemName', 'itemCode'];
      for (const field of requiredFields) {
        assert(KNOWN_TARGET_FIELDS.has(field), `缺少字段: ${field}`);
      }
    },
  },
  {
    name: 'FIELD_NAME_MAPPING: 包含常用中文映射',
    fn: () => {
      assert(FIELD_NAME_MAPPING['运单号'] === 'orderNo', '运单号映射');
      assert(FIELD_NAME_MAPPING['数量'] === 'quantity', '数量映射');
    },
  },

  // 规则校验器测试
  {
    name: 'validateParseRule: 有效 table 规则',
    fn: () => {
      const rule = {
        name: '测试规则',
        parser: {
          type: 'table',
          table: {
            headerRow: 0,
            dataStartRow: 1,
            columns: [
              { sourceIndex: 0, targetField: 'orderNo', dataType: 'string' },
            ],
          },
        },
      };
      const result = validateParseRule(rule);
      assert(result.valid, '有效规则应通过校验');
    },
  },
  {
    name: 'validateParseRule: 缺少 name',
    fn: () => {
      const rule = {
        parser: { type: 'table', table: { columns: [] } },
      };
      const result = validateParseRule(rule);
      assert(!result.valid, '缺少 name 应校验失败');
      assert(result.errors.some(e => e.field === 'name'), '应有 name 错误');
    },
  },
  {
    name: 'validateParseRule: 无效 parser.type',
    fn: () => {
      const rule = {
        name: '测试',
        parser: { type: 'invalid-type' },
      };
      const result = validateParseRule(rule);
      assert(!result.valid, '无效 type 应校验失败');
    },
  },
  {
    name: 'validateParseRule: table 缺少 columns',
    fn: () => {
      const rule = {
        name: '测试',
        parser: { type: 'table', table: { headerRow: 0 } },
      };
      const result = validateParseRule(rule);
      assert(!result.valid, '缺少 columns 应校验失败');
    },
  },
  {
    name: 'validateParseRule: matrix 缺少 storeColumns',
    fn: () => {
      const rule = {
        name: '测试',
        parser: { type: 'matrix', matrix: { headerRow: 0 } },
      };
      const result = validateParseRule(rule);
      assert(!result.valid, '缺少 storeColumns 应校验失败');
    },
  },
  {
    name: 'validateParseRule: text 模式校验',
    fn: () => {
      const rule = {
        name: '测试',
        parser: {
          type: 'text',
          text: {
            patterns: [
              { field: 'orderNo', regex: '单号[：:]\\s*(\\S+)' },
            ],
          },
        },
      };
      const result = validateParseRule(rule);
      assert(result.valid, '有效 text 规则应通过');
    },
  },
  {
    name: 'validateParseRule: double-matrix 类型支持',
    fn: () => {
      const rule = {
        name: '测试',
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
      };
      const result = validateParseRule(rule);
      assert(result.valid, 'double-matrix 应被支持');
    },
  },
  {
    name: 'formatValidationErrors: 错误格式化',
    fn: () => {
      const rule = { parser: { type: 'table' } };
      const result = validateParseRule(rule);
      const formatted = formatValidationErrors(result);
      assert(formatted.includes('name'), '应包含 name 错误');
    },
  },
];

// 执行测试
console.log('🧪 开始验证解析器模块...\n');

const results = tests.map(test => runTest(test.name, test.fn));
const passed = results.filter(r => r.passed).length;
const failed = results.filter(r => !r.passed).length;

results.forEach(result => {
  if (result.passed) {
    console.log(`✅ ${result.name}`);
  } else {
    console.log(`❌ ${result.name}`);
    console.log(`   错误: ${result.message}`);
  }
});

console.log('\n' + '='.repeat(50));
console.log(`📊 测试结果: ${passed} 通过, ${failed} 失败`);
console.log('='.repeat(50));

if (failed > 0) {
  process.exit(1);
}
