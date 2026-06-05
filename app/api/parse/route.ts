import { NextRequest, NextResponse } from 'next/server';
import { parseEngine } from '@/lib/parser/engine';
import { matchPresetRule } from '@/lib/parser/preset-rules';
import type { ParseRule } from '@/types/rule';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const ruleStr = formData.get('rule') as string;

    if (!file) {
      return NextResponse.json(
        { error: '请上传文件' },
        { status: 400 }
      );
    }

    let rule: ParseRule | undefined;
    if (ruleStr) {
      try {
        rule = JSON.parse(ruleStr);
      } catch {
        return NextResponse.json(
          { error: '规则格式错误' },
          { status: 400 }
        );
      }
    }

    // 如果没有提供规则，先尝试匹配预设规则，再使用默认规则
    if (!rule) {
      rule = matchPresetRule(file.name) || createDefaultRule(file.name);
    }

    console.log('File:', file.name);
    console.log('Rule:', rule.name);
    console.log('Parser type:', rule.parser.type);

    const result = await parseEngine.parseFile(file, file.name, rule);
    
    console.log('Parse result:', {
      success: result.success,
      totalRows: result.totalRows,
      errorRows: result.errorRows,
      ordersCount: result.orders.length,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('解析失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '解析失败' },
      { status: 500 }
    );
  }
}

/**
 * 根据文件名创建默认规则
 */
function createDefaultRule(fileName: string): ParseRule {
  const ext = fileName.toLowerCase().split('.').pop();

  if (ext === 'pdf') {
    return {
      name: 'PDF默认规则',
      fileTypes: ['pdf'],
      identifier: {},
      parser: {
        type: 'table',
        table: {
          headerRow: 'auto',
          dataStartRow: 'auto',
          columns: [
            { sourceIndex: 0, targetField: '物品类别', dataType: 'string' },
            { sourceIndex: 1, targetField: '物品编码', dataType: 'string' },
            { sourceIndex: 2, targetField: '物品名称', dataType: 'string' },
            { sourceIndex: 3, targetField: '规格型号', dataType: 'string' },
            { sourceIndex: 4, targetField: '单位', dataType: 'string' },
            { sourceIndex: 5, targetField: '数量', dataType: 'number' },
          ],
        },
      },
      recipient: {
        source: 'footer',
        fields: {
          name: { pattern: '收货人[：:]\\s*(.+?)(?:\\s|$)' },
          phone: { pattern: '(?:电话|手机)[：:]\\s*(\\d+)' },
          address: { pattern: '(?:地址|收货地址)[：:]\\s*(.+)' },
        },
      },
    };
  }

  // Excel默认规则
  return {
    name: 'Excel默认规则',
    fileTypes: ['excel'],
    identifier: {},
    parser: {
      type: 'table',
      table: {
        headerRow: 'auto',
        dataStartRow: 'auto',
        columns: [
          { sourceIndex: 0, targetField: '序号', dataType: 'number' },
          { sourceIndex: 1, targetField: '物品编码', dataType: 'string' },
          { sourceIndex: 2, targetField: '物品名称', dataType: 'string' },
          { sourceIndex: 3, targetField: '规格型号', dataType: 'string' },
          { sourceIndex: 4, targetField: '单位', dataType: 'string' },
          { sourceIndex: 5, targetField: '数量', dataType: 'number' },
        ],
      },
    },
    recipient: {
      source: 'footer',
      fields: {
        name: { pattern: '收货人[：:]\\s*(.+?)(?:\\s|$)' },
        phone: { pattern: '(?:电话|手机)[：:]\\s*(\\d+)' },
        address: { pattern: '(?:地址|收货地址)[：:]\\s*(.+)' },
      },
    },
  };
}
