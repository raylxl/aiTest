import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

function getDB() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not configured');
  return neon(url);
}

// 初始化规则表
async function initRulesTable() {
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
}

// 获取所有规则
export async function GET() {
  try {
    const sql = getDB();
    await initRulesTable();
    
    const rules = await sql`
      SELECT * FROM parse_rules 
      WHERE is_active = TRUE 
      ORDER BY updated_at DESC
    `;

    return NextResponse.json({
      success: true,
      rules: rules.map(r => ({
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
  } catch (error) {
    console.error('获取规则失败:', error);
    return NextResponse.json(
      { error: '获取规则失败' },
      { status: 500 }
    );
  }
}

// 创建新规则
export async function POST(request: NextRequest) {
  try {
    const sql = getDB();
    await initRulesTable();
    
    const body = await request.json();
    const { name, description, fileTypes, ruleJson, isAiGenerated } = body;

    if (!name || !ruleJson) {
      return NextResponse.json(
        { error: '缺少必要字段' },
        { status: 400 }
      );
    }

    const result = await sql`
      INSERT INTO parse_rules (name, description, file_types, rule_json, is_ai_generated)
      VALUES (${name}, ${description || ''}, ${fileTypes || ['excel']}, ${JSON.stringify(ruleJson)}, ${isAiGenerated || false})
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
  } catch (error) {
    console.error('创建规则失败:', error);
    return NextResponse.json(
      { error: '创建规则失败' },
      { status: 500 }
    );
  }
}
