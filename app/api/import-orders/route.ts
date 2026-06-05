import { NextRequest, NextResponse } from 'next/server';
import sql, { initDB } from '@/lib/db';

/**
 * 保存导入运单到数据库
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

    // 批量插入运单（每100条一批）
    const batchSize = 100;
    for (let i = 0; i < orders.length; i += batchSize) {
      const batchOrders = orders.slice(i, i + batchSize);
      for (const order of batchOrders) {
        await sql`
          INSERT INTO import_orders (
            batch_id, order_no, sender_name, sender_phone, sender_address,
            receiver_name, receiver_phone, receiver_address,
            item_name, item_code, item_category, specification,
            quantity, unit, source_file, source_sheet, source_row,
            is_valid, validation_errors, extra_fields
          ) VALUES (
            ${batchId}, ${order.orderNo || null}, ${order.senderName || null}, ${order.senderPhone || null}, ${order.senderAddress || null},
            ${order.receiverName || null}, ${order.receiverPhone || null}, ${order.receiverAddress || null},
            ${order.itemName || null}, ${order.itemCode || null}, ${order.itemCategory || null}, ${order.specification || null},
            ${order.quantity ?? null}, ${order.unit || null}, ${order.sourceFile || fileName || null}, ${order.sourceSheet || null}, ${order.sourceRow ?? null},
            ${order.isValid ?? true}, ${order.validationErrors || []}, ${JSON.stringify(order.extraFields || {})}
          )
        `;
      }
    }

    return NextResponse.json({
      success: true,
      batchId,
      message: `成功保存 ${orders.length} 条运单`,
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
