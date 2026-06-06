import { NextRequest, NextResponse } from 'next/server';
import sql, { initDB, getNeonClient } from '@/lib/db';

/**
 * 保存导入运单到数据库（批量插入优化版）
 */
export async function POST(request: NextRequest) {
  try {
    await initDB();
    const body = await request.json();
    const { orders, fileName, fileType, ruleName, ruleJson } = body;

    if (!orders || !Array.isArray(orders) || orders.length === 0) {
      return NextResponse.json({ error: '没有运单数据' }, { status: 400 });
    }

    // 创建导入批次
    const [batch] = await sql`
      INSERT INTO import_batches (file_name, file_type, rule_name, rule_json, total_rows, success_rows, error_rows)
      VALUES (${fileName || 'unknown'}, ${fileType || 'unknown'}, ${ruleName || ''}, ${JSON.stringify(ruleJson || {})}, ${orders.length}, ${orders.filter((o: any) => o.isValid).length}, ${orders.filter((o: any) => !o.isValid).length})
      RETURNING id
    `;

    const batchId = (batch as any).id;
    const client = getNeonClient();

    // 批量插入运单（每 200 条一批，使用多行 VALUES 语法）
    const BATCH_SIZE = 200;
    let insertedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < orders.length; i += BATCH_SIZE) {
      const chunk = orders.slice(i, i + BATCH_SIZE);

      // 构建多行 VALUES 占位符
      const valuePlaceholders: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      for (const order of chunk) {
        const rowPlaceholders: string[] = [];
        // 按字段顺序添加参数
        const fields = [
          batchId,
          order.orderNo || null,
          order.storeName || null,
          order.senderName || null,
          order.senderPhone || null,
          order.senderAddress || null,
          order.receiverName || null,
          order.receiverPhone || null,
          order.receiverAddress || null,
          order.itemName || null,
          order.itemCode || null,
          order.itemCategory || null,
          order.specification || null,
          order.quantity ?? null,
          order.unit || null,
          order.remark || null,
          order.sourceFile || fileName || null,
          order.sourceSheet || null,
          order.sourceRow ?? null,
          order.isValid ?? true,
          order.validationErrors || [],
          JSON.stringify(order.extraFields || {}),
        ];

        for (const val of fields) {
          rowPlaceholders.push(`$${paramIndex}`);
          params.push(val);
          paramIndex++;
        }

        valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
      }

      const insertSQL = `
        INSERT INTO import_orders (
          batch_id, order_no, store_name, sender_name, sender_phone, sender_address,
          receiver_name, receiver_phone, receiver_address,
          item_name, item_code, item_category, specification,
          quantity, unit, remark, source_file, source_sheet, source_row,
          is_valid, validation_errors, extra_fields
        ) VALUES ${valuePlaceholders.join(', ')}
      `;

      try {
        await (client as any).unsafe(insertSQL, params);
        insertedCount += chunk.length;
      } catch (err: any) {
        console.error(`批量插入失败 (offset ${i}):`, err.message);
        errors.push(`批次 ${Math.floor(i / BATCH_SIZE) + 1} 失败: ${err.message}`);
      }
    }

    // 更新批次统计
    if (errors.length > 0) {
      await sql`
        UPDATE import_batches
        SET success_rows = ${insertedCount}, error_rows = ${orders.length - insertedCount}
        WHERE id = ${batchId}
      `;
    }

    return NextResponse.json({
      success: errors.length === 0,
      batchId,
      insertedCount,
      totalCount: orders.length,
      message: errors.length === 0
        ? `成功保存 ${orders.length} 条运单`
        : `部分保存失败：成功 ${insertedCount}/${orders.length} 条`,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('保存运单失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '保存失败' },
      { status: 500 }
    );
  }
}

/**
 * 查询已导入的运单列表
 */
export async function GET(request: NextRequest) {
  try {
    await initDB();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const batchId = searchParams.get('batchId');
    const offset = (page - 1) * pageSize;

    // 查询批次列表
    if (searchParams.get('action') === 'batches') {
      const batches = await sql`
        SELECT id, file_name, file_type, rule_name, total_rows, success_rows, error_rows, status, created_at
        FROM import_batches
        ORDER BY created_at DESC
        LIMIT 50
      `;
      return NextResponse.json({ success: true, batches });
    }

    // 查询运单
    let query;
    if (batchId) {
      query = sql`
        SELECT * FROM import_orders
        WHERE batch_id = ${parseInt(batchId)}
        ORDER BY id DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `;
    } else {
      query = sql`
        SELECT * FROM import_orders
        ORDER BY id DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `;
    }

    const orders = await query;

    // 查询总数
    let countQuery;
    if (batchId) {
      countQuery = sql`SELECT COUNT(*) as total FROM import_orders WHERE batch_id = ${parseInt(batchId)}`;
    } else {
      countQuery = sql`SELECT COUNT(*) as total FROM import_orders`;
    }
    const [countResult] = await countQuery;
    const total = parseInt((countResult as any).total);

    return NextResponse.json({
      success: true,
      orders,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error('查询运单失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '查询失败' },
      { status: 500 }
    );
  }
}
