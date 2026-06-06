/**
 * 性能基准测试脚本 - 万能导入V2
 *
 * 使用方法:
 *   npx tsx scripts/benchmark.ts
 *
 * 功能:
 *   1. 测试不同规模文件的解析性能
 *   2. 记录 analyze、parse、save 三阶段耗时
 *   3. 输出性能报告
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { parseEngine } from '../lib/parser/engine';
import { validateParseRule } from '../lib/parser/validator';
import type { ParseRule } from '../types/rule';

// 测试配置
interface BenchmarkConfig {
  name: string;
  filePath: string;
  rule: ParseRule;
  expectedMinRows?: number;
}

// 测试结果
interface BenchmarkResult {
  name: string;
  success: boolean;
  totalRows: number;
  errorRows: number;
  parseTimeMs: number;
  wallTimeMs: number;
  rowsPerSecond: number;
  error?: string;
}

// 测试用例配置
const BENCHMARK_CONFIGS: BenchmarkConfig[] = [
  {
    name: '10条-湖南仓',
    filePath: 'd:/WorkBuddy-projects/aiTest/perf-10-hunan.xlsx',
    rule: {
      name: '性能测试-10单',
      fileTypes: ['excel'],
      identifier: {},
      parser: {
        type: 'table',
        table: {
          headerRow: 1,
          dataStartRow: 2,
          columns: [
            { sourceIndex: 0, targetField: 'storeName', dataType: 'string' },
            { sourceIndex: 2, targetField: 'orderNo', dataType: 'string' },
            { sourceIndex: 5, targetField: 'itemCode', dataType: 'string' },
            { sourceIndex: 6, targetField: 'itemName', dataType: 'string' },
            { sourceIndex: 8, targetField: 'specification', dataType: 'string' },
            { sourceIndex: 12, targetField: 'quantity', dataType: 'number' },
          ],
        },
      },
    },
    expectedMinRows: 5,
  },
  {
    name: '1000条-湖南仓',
    filePath: 'd:/WorkBuddy-projects/aiTest/perf-1000-hunan.xlsx',
    rule: {
      name: '性能测试-1000单',
      fileTypes: ['excel'],
      identifier: {},
      parser: {
        type: 'table',
        table: {
          headerRow: 1,
          dataStartRow: 2,
          columns: [
            { sourceIndex: 0, targetField: 'storeName', dataType: 'string' },
            { sourceIndex: 2, targetField: 'orderNo', dataType: 'string' },
            { sourceIndex: 5, targetField: 'itemCode', dataType: 'string' },
            { sourceIndex: 6, targetField: 'itemName', dataType: 'string' },
            { sourceIndex: 8, targetField: 'specification', dataType: 'string' },
            { sourceIndex: 12, targetField: 'quantity', dataType: 'number' },
          ],
        },
      },
    },
    expectedMinRows: 500,
  },
];

// 运行单个基准测试
async function runBenchmark(config: BenchmarkConfig): Promise<BenchmarkResult> {
  const startTime = performance.now();

  try {
    // 检查文件是否存在
    try {
      await fs.access(config.filePath);
    } catch {
      return {
        name: config.name,
        success: false,
        totalRows: 0,
        errorRows: 0,
        parseTimeMs: 0,
        wallTimeMs: 0,
        rowsPerSecond: 0,
        error: `文件不存在: ${config.filePath}`,
      };
    }

    // 校验规则
    const validation = validateParseRule(config.rule);
    if (!validation.valid) {
      return {
        name: config.name,
        success: false,
        totalRows: 0,
        errorRows: 0,
        parseTimeMs: 0,
        wallTimeMs: 0,
        rowsPerSecond: 0,
        error: `规则校验失败: ${validation.errors.map(e => e.message).join(', ')}`,
      };
    }

    // 读取文件
    const file = await fs.readFile(config.filePath);
    const arrayBuffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);

    // 执行解析
    const result = await parseEngine.parseFile(arrayBuffer, path.basename(config.filePath), config.rule);
    const wallTimeMs = performance.now() - startTime;

    // 计算每秒处理行数
    const rowsPerSecond = result.totalRows > 0 && wallTimeMs > 0
      ? Math.round((result.totalRows / wallTimeMs) * 1000)
      : 0;

    return {
      name: config.name,
      success: result.success,
      totalRows: result.totalRows,
      errorRows: result.errorRows,
      parseTimeMs: result.metadata?.parseTime || 0,
      wallTimeMs: Math.round(wallTimeMs),
      rowsPerSecond,
    };
  } catch (error) {
    return {
      name: config.name,
      success: false,
      totalRows: 0,
      errorRows: 0,
      parseTimeMs: 0,
      wallTimeMs: Math.round(performance.now() - startTime),
      rowsPerSecond: 0,
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}

// 主函数
async function main() {
  console.log('🚀 万能导入V2 性能基准测试\n');
  console.log('=' .repeat(60));

  const results: BenchmarkResult[] = [];

  for (const config of BENCHMARK_CONFIGS) {
    console.log(`\n📊 测试: ${config.name}`);
    console.log(`   文件: ${path.basename(config.filePath)}`);

    const result = await runBenchmark(config);
    results.push(result);

    if (result.success) {
      console.log(`   ✅ 成功`);
      console.log(`   📈 总行数: ${result.totalRows}`);
      console.log(`   ⚠️  错误行: ${result.errorRows}`);
      console.log(`   ⏱️  解析耗时: ${result.parseTimeMs}ms`);
      console.log(`   ⏱️  总耗时: ${result.wallTimeMs}ms`);
      console.log(`   🚄 处理速度: ${result.rowsPerSecond} 行/秒`);
    } else {
      console.log(`   ❌ 失败: ${result.error}`);
    }
  }

  // 输出汇总报告
  console.log('\n' + '=' .repeat(60));
  console.log('📊 性能基准汇总');
  console.log('=' .repeat(60));
  console.log('| 测试名称 | 状态 | 总行数 | 解析耗时 | 总耗时 | 处理速度 |');
  console.log('|----------|------|--------|----------|--------|----------|');

  for (const r of results) {
    const status = r.success ? '✅' : '❌';
    const rows = r.success ? r.totalRows.toString() : '-';
    const parseTime = r.success ? `${r.parseTimeMs}ms` : '-';
    const wallTime = r.success ? `${r.wallTimeMs}ms` : '-';
    const speed = r.success ? `${r.rowsPerSecond}行/秒` : '-';
    console.log(`| ${r.name} | ${status} | ${rows} | ${parseTime} | ${wallTime} | ${speed} |`);
  }

  console.log('=' .repeat(60));

  // 保存报告到文件
  const reportPath = path.join(__dirname, '../tests/benchmark-report.json');
  const report = {
    timestamp: new Date().toISOString(),
    results,
    summary: {
      totalTests: results.length,
      passed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      avgParseTime: results.filter(r => r.success).reduce((sum, r) => sum + r.parseTimeMs, 0) / results.filter(r => r.success).length || 0,
      avgWallTime: results.filter(r => r.success).reduce((sum, r) => sum + r.wallTimeMs, 0) / results.filter(r => r.success).length || 0,
    },
  };

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 报告已保存: ${reportPath}`);
}

main().catch((error) => {
  console.error('测试执行失败:', error);
  process.exit(1);
});
