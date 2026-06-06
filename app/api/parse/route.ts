import { NextRequest, NextResponse } from 'next/server';
import { parseEngine } from '@/lib/parser/engine';
import { validateParseRule, formatValidationErrors } from '@/lib/parser/validator';
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
      return NextResponse.json({ error: '规则格式错误：JSON 解析失败' }, { status: 400 });
    }

    // 使用统一校验器验证规则结构
    const validationResult = validateParseRule(rule);
    if (!validationResult.valid) {
      return NextResponse.json(
        {
          error: '规则校验失败',
          details: formatValidationErrors(validationResult),
          validationErrors: validationResult.errors,
        },
        { status: 400 }
      );
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
