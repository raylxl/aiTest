import { NextResponse } from 'next/server';
import sql, { initDB } from '@/lib/db';
import type { WaybillRow, ValidationError } from '@/lib/waybill-types';

const TEMP_LAYER_OPTIONS = ['常温', '冷藏', '冷冻'];
const BATCH_SIZE = 100; // 每批插入条数

// 校验单行
function validateRow(row: WaybillRow, rowIndex: number): ValidationError[] {
  const errors: ValidationError[] = [];
  const reqFields = [
    { k: 'sender_name', l: '发件人姓名' },
    { k: 'sender_phone', l: '发件人电话' },
    { k: 'sender_address', l: '发件人地址' },
    { k: 'receiver_name', l: '收件人姓名' },
    { k: 'receiver_phone', l: '收件人电话' },
    { k: 'receiver_address', l: '收件人地址' },
    { k: 'weight', l: '重量(kg)' },
    { k: 'quantity', l: '件数' },
    { k: 'temp_layer', l: '温层' },
  ];

  for (const f of reqFields) {
    const val = String(row[f.k as keyof WaybillRow] || '').trim();
    if (!val) errors.push({ row: rowIndex, field: f.l, value: val, message: '不能为空' });
  }

  const phoneFields = [
    { k: 'sender_phone', l: '发件人电话' },
    { k: 'receiver_phone', l: '收件人电话' },
  ];
  for (const f of phoneFields) {
    const val = String(row[f.k as keyof WaybillRow] || '').trim();
    if (val && !/^1[3-9]\d{9}$/.test(val) && !/^0\d{2,3}-?\d{7,8}$/.test(val)) {
      errors.push({ row: rowIndex, field: f.l, value: val, message: '格式错误（手机号11位或固话）' });
    }
  }

  // 数值容错：trim + 清理 Excel 数字格式 .0 后缀
  const cleanWeight = String(row.weight || '').trim().replace(/\.0+$/, '');
  const cleanQty = String(row.quantity || '').trim().replace(/\.0+$/, '');
  const weight = parseFloat(cleanWeight);
  if (row.weight !== '' && row.weight !== undefined && (isNaN(weight) || weight <= 0)) {
    errors.push({ row: rowIndex, field: '重量(kg)', value: String(row.weight), message: '必须为正数' });
  }

  const qty = parseInt(cleanQty);
  if (row.quantity !== '' && row.quantity !== undefined && (isNaN(qty) || qty <= 0 || !Number.isInteger(qty))) {
    errors.push({ row: rowIndex, field: '件数', value: String(row.quantity), message: '必须为正整数' });
  }

  const temp = String(row.temp_layer || '').trim();
  if (temp && !TEMP_LAYER_OPTIONS.includes(temp)) {
    errors.push({ row: rowIndex, field: '温层', value: temp, message: `可选值：${TEMP_LAYER_OPTIONS.join('、')}` });
  }

  return errors;
}

// 单条插入（使用 sql 模板，参数化防注入）
async function insertRow(
  r: WaybillRow,
  isOverwrite: boolean
): Promise<{ success: boolean; error?: string }> {
  const external_code = String(r.external_code || '').trim();
  const onConflict = isOverwrite
    ? sql`ON CONFLICT (external_code) DO UPDATE SET
        sender_name = EXCLUDED.sender_name,
        sender_phone = EXCLUDED.sender_phone,
        sender_address = EXCLUDED.sender_address,
        receiver_name = EXCLUDED.receiver_name,
        receiver_phone = EXCLUDED.receiver_phone,
        receiver_address = EXCLUDED.receiver_address,
        weight = EXCLUDED.weight,
        quantity = EXCLUDED.quantity,
        temp_layer = EXCLUDED.temp_layer,
        remark = EXCLUDED.remark`
    : sql`ON CONFLICT (external_code) DO NOTHING`;

  try {
    await sql`
      INSERT INTO waybills (
        external_code, sender_name, sender_phone, sender_address,
        receiver_name, receiver_phone, receiver_address,
        weight, quantity, temp_layer, remark
      ) VALUES (
        ${external_code || null},
        ${String(r.sender_name || '').trim()},
        ${String(r.sender_phone || '').trim()},
        ${String(r.sender_address || '').trim()},
        ${String(r.receiver_name || '').trim()},
        ${String(r.receiver_phone || '').trim()},
        ${String(r.receiver_address || '').trim()},
        ${parseFloat(String(r.weight)) || 0},
        ${parseInt(String(r.quantity)) || 0},
        ${String(r.temp_layer || '').trim()},
        ${String(r.remark || '').trim()}
      )
      ${onConflict}
    `;
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// POST /api/waybills/submit
export async function POST(request: Request) {
  try {
    await initDB();

    const body = await request.json();
    const { rows, skipDuplicates = false } = body as {
      rows: WaybillRow[];
      skipDuplicates?: boolean;
    };
    const isOverwrite = !skipDuplicates;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: '没有可提交的数据' }, { status: 400 });
    }

    // 过滤未选中行
    const selectedRows = rows.filter(r => r._selected !== false);

    // 重新校验
    const allErrors: ValidationError[] = [];
    for (let i = 0; i < selectedRows.length; i++) {
      const errs = validateRow(selectedRows[i], i + 1);
      allErrors.push(...errs);
    }

    if (allErrors.length > 0) {
      return NextResponse.json({
        error: '存在校验错误，请修正后再提交',
        errors: allErrors.slice(0, 100),
      }, { status: 400 });
    }

    // 查询数据库中已有的 external_code
    const extCodes = selectedRows
      .map(r => String(r.external_code || '').trim())
      .filter(Boolean);

    const existCodes = new Set<string>();
    if (extCodes.length > 0) {
      try {
        const existRows = await sql`
          SELECT external_code FROM waybills
          WHERE external_code = ANY(${extCodes})
        `;
        for (const r of existRows) {
          existCodes.add(String(r.external_code));
        }
      } catch {
        // 查询失败不影响继续
      }
    }

    // 确定要插入的行
    const toInsert = selectedRows.filter(r => {
      const code = String(r.external_code || '').trim();
      if (!code) return true;
      if (existCodes.has(code)) return isOverwrite;
      return true;
    });

    // 记录 skip 模式下的重复
    const skipErrors: ValidationError[] = [];
    if (!isOverwrite) {
      selectedRows.forEach((r, i) => {
        const code = String(r.external_code || '').trim();
        if (code && existCodes.has(code)) {
          skipErrors.push({ row: i + 1, field: '外部编码', value: code, message: '数据库中已存在，已跳过' });
        }
      });
    }

    // 分批插入
    let success = 0;
    let failed = 0;
    const batchErrors: ValidationError[] = [];

    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      const promises = batch.map((r, bi) => insertRow(r, isOverwrite));
      const results = await Promise.all(promises);
      results.forEach((res, bi) => {
        if (res.success) {
          success++;
        } else {
          failed++;
          if (batchErrors.length < 50) {
            batchErrors.push({ row: i + bi + 1, field: '数据', value: '', message: res.error || '插入失败' });
          }
        }
      });
    }

    // skip 模式下，重复的不算失败
    const finalFailed = isOverwrite ? failed : skipErrors.length;
    const finalSuccess = isOverwrite ? success : toInsert.length - skipErrors.length;

    return NextResponse.json({
      success: finalSuccess,
      failed: finalFailed,
      errors: [...batchErrors, ...skipErrors].slice(0, 50),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
