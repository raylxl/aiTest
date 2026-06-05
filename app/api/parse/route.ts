import { NextRequest, NextResponse } from 'next/server';
import { parseEngine } from '@/lib/parser/engine';
import type { ParseRule } from '@/types/rule';

/**
 * 文件解析API - 必须传入解析规则（由AI生成或用户手动配置）
 * 不再使用硬编码匹配，完全依赖规则引擎
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const ruleStr = formData.get('rule') as string;

    if (!file) {
      return NextResponse.json({ error: '请上传文件' }, { status: 400 });
    }

    if (!ruleStr) {
      return NextResponse.json(
        { error: '请提供解析规则。请先通过"AI分析"生成规则，或手动配置规则。' },
        { status: 400 }
      );
    }

    let rule: ParseRule;
    try {
      rule = JSON.parse(ruleStr);
    } catch {
      return NextResponse.json({ error: '规则格式错误' }, { status: 400 });
    }

    // 验证规则基本结构
    if (!rule.name || !rule.parser?.type) {
      return NextResponse.json({ error: '规则缺少必要字段（name, parser.type）' }, { status: 400 });
    }

    const result = await parseEngine.parseFile(file, file.name, rule);

    return NextResponse.json(result);
  } catch (error) {
    console.error('解析失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '解析失败' },
      { status: 500 }
    );
  }
}
