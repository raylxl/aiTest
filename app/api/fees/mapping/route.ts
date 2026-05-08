import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { FEE_FIELDS, normalize } from '@/lib/fee-types';

const TABLE_NAME = 'fee_types';

// 生成列索引 hash（用于精确匹配）
function colHash(columns: string[], colMap: Record<string, number>): string {
  const keys = Object.entries(colMap)
    .sort(([, a], [, b]) => a - b)
    .map(([k]) => k);
  const str = keys.join(',');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// GET /api/fees/mapping
// 查询所有已保存的费用类型模板
export async function GET() {
  try {
    const rows = await sql`
      SELECT id, column_hash, header_columns, name, created_at, updated_at
      FROM template_mappings
      WHERE table_name = ${TABLE_NAME}
      ORDER BY updated_at DESC
      LIMIT 50
    ` as Array<{
      id: number;
      column_hash: string;
      header_columns: Record<string, number>;
      name: string | null;
      created_at: string;
      updated_at: string;
    }>;

    return NextResponse.json({
      templates: rows.map(r => ({
        id: r.id,
        name: r.name || `模板 #${r.id}`,
        colMap: r.header_columns,
        // 反向映射：列索引 → 字段名
        fieldList: Object.entries(r.header_columns)
          .sort(([, a], [, b]) => Number(a) - Number(b))
          .map(([k]) => ({ colIdx: Number(r.header_columns[k]), field: k })),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: '查询模板失败：' + msg }, { status: 500 });
  }
}

// POST /api/fees/mapping
// 保存或更新模板映射
// Body: { name, headers, colMap }
//   name: 模板名称
//   headers: 原始列名数组
//   colMap: { 字段名: 列索引 }
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, headers, colMap } = body as {
      name?: string;
      headers: string[];
      colMap: Record<string, number>;
    };

    if (!headers || !colMap || Object.keys(colMap).length === 0) {
      return NextResponse.json({ error: '缺少列映射信息' }, { status: 400 });
    }

    const hash = colHash(headers, colMap);

    // Upsert：相同 hash 更新，不存在则插入
    const result = await sql`
      INSERT INTO template_mappings (table_name, column_hash, header_columns, name, updated_at)
      VALUES (
        ${TABLE_NAME},
        ${hash},
        ${JSON.stringify(colMap)}::jsonb,
        ${name || '费用类型模板'},
        NOW()
      )
      ON CONFLICT (table_name, column_hash) DO UPDATE SET
        header_columns = EXCLUDED.header_columns,
        name = COALESCE(EXCLUDED.name, template_mappings.name),
        updated_at = NOW()
      RETURNING id
    ` as Array<{ id: number }>;

    return NextResponse.json({
      ok: true,
      id: result[0]?.id,
      hash,
      message: name ? `"${name}" 已保存` : '模板已保存，下次上传相同结构文件将自动应用',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: '保存模板失败：' + msg }, { status: 500 });
  }
}

// DELETE /api/fees/mapping?id=123
// 删除指定模板
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '缺少模板 ID' }, { status: 400 });
    }

    await sql`DELETE FROM template_mappings WHERE id = ${Number(id)} AND table_name = ${TABLE_NAME}`;

    return NextResponse.json({ ok: true, message: '模板已删除' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: '删除模板失败：' + msg }, { status: 500 });
  }
}
