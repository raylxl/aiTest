import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

function getDB() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not configured');
  return neon(url);
}

// 初始化规则表（仅执行一次）
let tableInitialized = false;
async function ensureTableExists() {
  if (tableInitialized) return;
  const sql = getDB();
  await sql`
    CREATE TABLE IF NOT EXISTS parse_rules (
      id              SERIAL PRIMARY KEY,
      name            VARCHAR(200) NOT NULL,
      description     TEXT DEFAULT '',
      file_types      TEXT[] DEFAULT '{}',
      rule_json       JSONB NOT NULL,
      is_active       BOOLEAN DEFAULT TRUE,
      is_ai_generated BOOLEAN DEFAULT FALSE,
      usage_count     INTEGER DEFAULT 0,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  tableInitialized = true;
}

// 获取所有规则
export async function GET() {
  try {
    const sql = getDB();
    await ensureTableExists();

    const rules = await sql`
      SELECT * FROM parse_rules
      WHERE is_active = TRUE
      ORDER BY updated_at DESC
    `;

    return NextResponse.json({
      success: true,
      rules: rules.map((r: any) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        fileTypes: r.file_types,
        ruleJson: r.rule_json,
        isActive: r.is_active,
        isAiGenerated: r.is_ai_generated,
        usageCount: r.usage_count,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (error: any) {
    console.error('获取规则失败:', error?.message || error);
    return NextResponse.json(
      { error: '获取规则失败: ' + (error?.message || '未知错误') },
      { status: 500 }
    );
  }
}

// 创建新规则
export async function POST(request: NextRequest) {
  try {
    const sql = getDB();
    await ensureTableExists();

    const body = await request.json();
    const { name, description, fileTypes, ruleJson, isAiGenerated } = body;

    if (!name || !ruleJson) {
      return NextResponse.json(
        { error: '缺少必要字段: name 和 ruleJson 均为必填' },
        { status: 400 }
      );
    }

    // 确保 ruleJson 是对象，如果是字符串则解析
    let ruleData = ruleJson;
    if (typeof ruleJson === 'string') {
      try { ruleData = JSON.parse(ruleJson); }
      catch { return NextResponse.json({ error: 'ruleJson 格式错误：不是合法的 JSON' }, { status: 400 }); }
    }

    const result = await sql`
      INSERT INTO parse_rules (name, description, file_types, rule_json, is_ai_generated)
      VALUES (${name}, ${description || ''}, ${fileTypes || ['excel']}, ${JSON.stringify(ruleData)}::jsonb, ${isAiGenerated || false})
      RETURNING *
    `;

    const rule = result[0];
    return NextResponse.json({
      success: true,
      rule: {
        id: rule.id,
        name: rule.name,
        description: rule.description,
        fileTypes: rule.file_types,
        ruleJson: rule.rule_json,
        isActive: rule.is_active,
        isAiGenerated: rule.is_ai_generated,
        createdAt: rule.created_at,
      },
    });
  } catch (error: any) {
    console.error('创建规则失败:', error?.message || error);
    return NextResponse.json(
      { error: '创建规则失败: ' + (error?.message || '未知错误') },
      { status: 500 }
    );
  }
}

// 更新规则
export async function PUT(request: NextRequest) {
  try {
    const sql = getDB();
    await ensureTableExists();

    const body = await request.json();
    const { id, name, description, fileTypes, ruleJson } = body;

    if (!id) {
      return NextResponse.json({ error: '缺少规则 id' }, { status: 400 });
    }

    let ruleData = ruleJson;
    if (typeof ruleJson === 'string') {
      try { ruleData = JSON.parse(ruleJson); }
      catch { return NextResponse.json({ error: 'ruleJson 格式错误' }, { status: 400 }); }
    }

    const result = await sql`
      UPDATE parse_rules SET
        name = ${name},
        description = ${description || ''},
        file_types = ${fileTypes || ['excel']},
        rule_json = ${JSON.stringify(ruleData)}::jsonb,
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    if (result.length === 0) {
      return NextResponse.json({ error: '规则不存在' }, { status: 404 });
    }

    const rule = result[0];
    return NextResponse.json({
      success: true,
      rule: {
        id: rule.id,
        name: rule.name,
        description: rule.description,
        fileTypes: rule.file_types,
        ruleJson: rule.rule_json,
        updatedAt: rule.updated_at,
      },
    });
  } catch (error: any) {
    console.error('更新规则失败:', error?.message || error);
    return NextResponse.json({ error: '更新规则失败: ' + (error?.message || '未知错误') }, { status: 500 });
  }
}

// 删除规则（软删除）
export async function DELETE(request: NextRequest) {
  try {
    const sql = getDB();
    await ensureTableExists();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: '缺少规则 id' }, { status: 400 });
    }

    await sql`UPDATE parse_rules SET is_active = FALSE WHERE id = ${parseInt(id)}`;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('删除规则失败:', error?.message || error);
    return NextResponse.json({ error: '删除规则失败: ' + (error?.message || '未知错误') }, { status: 500 });
  }
}
