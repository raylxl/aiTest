import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

function getDB() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not configured');
  return neon(url);
}

// 初始化规则表（仅执行一次，兼容旧版 lib/db.ts 建表逻辑）
let tableInitialized = false;
async function ensureTableExists() {
  if (tableInitialized) return;
  const sql = getDB();

  // 先确保表存在（CREATE TABLE IF NOT EXISTS — 可能被旧版 lib/db.ts 先创建）
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

  // ===== 迁移：逐列检查并补全（幂等，可重复执行）=====
  // 旧版 lib/db.ts 创建的字段: file_type(VARCHAR), is_preset(BOOLEAN), use_count(INTEGER)
  // 新版 route.ts 需要的字段: file_types(TEXT[]), is_active(BOOLEAN), is_ai_generated(BOOLEAN), usage_count(INTEGER)
  const existingCols = await sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'parse_rules'
  `;
  const colMap = new Map((existingCols as any[]).map((c: any) => [c.column_name, c.data_type]));

  // 1. file_type(VARCHAR) → 删除 → 新增 file_types(TEXT[])
  if (colMap.has('file_type') && !colMap.has('file_types')) {
    await sql`ALTER TABLE parse_rules DROP COLUMN file_type`;
    await sql`ALTER TABLE parse_rules ADD COLUMN file_types TEXT[] DEFAULT '{}'`;
  }

  // 2. is_preset(BOOLEAN) → 重命名为 is_active
  if (colMap.has('is_preset') && !colMap.has('is_active')) {
    await sql`ALTER TABLE parse_rules RENAME COLUMN is_preset TO is_active`;
  }
  // 确保 is_active 存在
  if (!colMap.has('is_active') && !colMap.has('is_preset')) {
    await sql`ALTER TABLE parse_rules ADD COLUMN is_active BOOLEAN DEFAULT TRUE`;
  }

  // 3. use_count(INTEGER) → 确保为 usage_count
  if (colMap.has('use_count') && !colMap.has('usage_count')) {
    await sql`ALTER TABLE parse_rules RENAME COLUMN use_count TO usage_count`;
  }
  if (!colMap.has('usage_count')) {
    await sql`ALTER TABLE parse_rules ADD COLUMN usage_count INTEGER DEFAULT 0`;
  }

  // 4. is_ai_generated — 新版必需字段
  if (!colMap.has('is_ai_generated')) {
    await sql`ALTER TABLE parse_rules ADD COLUMN is_ai_generated BOOLEAN DEFAULT FALSE`;
  }

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
      INSERT INTO parse_rules (name, description, file_types, rule_json, is_ai_generated, is_active)
      VALUES (${name}, ${description || ''}, ${fileTypes || ['excel']}, ${JSON.stringify(ruleData)}::jsonb, ${isAiGenerated || false}, TRUE)
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
