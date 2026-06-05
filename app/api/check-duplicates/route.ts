import { NextRequest, NextResponse } from 'next/server';
import { getNeonClient, initDB } from '@/lib/db';

/**
 * 重复检测 API
 * POST /api/check-duplicates
 * 
 * 功能：
 * 1. 批次内重复检测（同一次导入里相同 orderNo 的行）
 * 2. 与已入库数据重复检测（查 import_orders 表）
 */
export async function POST(request: NextRequest) {
  try {
    await initDB();
    const body = await request.json();
    const { orderNos } = body as { orderNos: string[] };

    if (!orderNos || !Array.isArray(orderNos) || orderNos.length === 0) {
      return NextResponse.json({ success: true, duplicates: [] });
    }

    // 过滤掉空值
    const validOrderNos = orderNos.filter(n => n && n.trim() !== '');
    if (validOrderNos.length === 0) {
      return NextResponse.json({ success: true, duplicates: [] });
    }

    // 1. 批次内重复：找出 orderNos 数组中出现超过1次的
    const countMap: Record<string, number> = {};
    for (const no of validOrderNos) {
      countMap[no] = (countMap[no] || 0) + 1;
    }
    const batchDuplicates = Object.entries(countMap)
      .filter(([, cnt]) => cnt > 1)
      .map(([no]) => no);

    // 2. 数据库重复：查 import_orders 表已有的 order_no
    const sql = getNeonClient();
    
    // 每次最多查 500 个，分批处理
    const batchSize = 500;
    const dbDuplicates: string[] = [];

    for (let i = 0; i < validOrderNos.length; i += batchSize) {
      const chunk = validOrderNos.slice(i, i + batchSize);
      // 用 sql.unsafe 拼接 IN 查询（neondatabase/serverless 不支持数组参数化）
      const inList = chunk.map(n => `'${n.replace(/'/g, "''")}'`).join(', ');
      const rows = await sql.unsafe(`
        SELECT DISTINCT order_no FROM import_orders
        WHERE order_no IN (${inList}) AND order_no IS NOT NULL
      `) as unknown as Array<{ order_no: string }>;
      rows.forEach((r) => {
        if (r.order_no && !dbDuplicates.includes(r.order_no)) {
          dbDuplicates.push(r.order_no);
        }
      });
    }

    // 合并结果，去重
    const allDuplicates = Array.from(new Set([...batchDuplicates, ...dbDuplicates]));

    return NextResponse.json({
      success: true,
      duplicates: allDuplicates,
      batchDuplicates,
      dbDuplicates,
      stats: {
        total: validOrderNos.length,
        batchDupCount: batchDuplicates.length,
        dbDupCount: dbDuplicates.length,
        totalDupCount: allDuplicates.length,
      },
    });
  } catch (error) {
    console.error('重复检测失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '检测失败' },
      { status: 500 }
    );
  }
}
