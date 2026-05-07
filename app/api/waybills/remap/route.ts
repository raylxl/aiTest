import { NextResponse } from 'next/server';
import sql, { initDB } from '@/lib/db';
import type { WaybillRow } from '@/lib/waybill-types';
import { COLUMN_ALIAS_MAP } from '@/lib/waybill-types';
import crypto from 'crypto';

const REQUIRED_FIELDS = [
  { key: 'sender_name', label: '发件人姓名' },
  { key: 'sender_phone', label: '发件人电话' },
  { key: 'sender_address', label: '发件人地址' },
  { key: 'receiver_name', label: '收件人姓名' },
  { key: 'receiver_phone', label: '收件人电话' },
  { key: 'receiver_address', label: '收件人地址' },
  { key: 'weight', label: '重量(kg)' },
  { key: 'quantity', label: '件数' },
  { key: 'temp_layer', label: '温层' },
];

const TEMP_LAYER_OPTIONS = ['常温', '冷藏', '冷冻'];

function validatePhone(phone: string): boolean {
  const p = phone.trim();
  return /^1[3-9]\d{9}$/.test(p) || /^0\d{2,3}-?\d{7,8}$/.test(p);
}

function validateRow(row: WaybillRow): Record<string, string> {
  const errors: Record<string, string> = {};
  const reqFields = ['sender_name', 'sender_phone', 'sender_address', 'receiver_name', 'receiver_phone', 'receiver_address', 'weight', 'quantity', 'temp_layer'];
  const labels: Record<string, string> = {
    sender_name: '发件人姓名', sender_phone: '发件人电话', sender_address: '发件人地址',
    receiver_name: '收件人姓名', receiver_phone: '收件人电话', receiver_address: '收件人地址',
    weight: '重量(kg)', quantity: '件数', temp_layer: '温层',
  };
  for (const k of reqFields) {
    const v = String(row[k as keyof WaybillRow] || '').trim();
    if (!v) errors[k] = '不能为空';
  }
  if (row.sender_phone && !validatePhone(row.sender_phone)) {
    if (!errors.sender_phone) errors.sender_phone = '格式错误';
  }
  if (row.receiver_phone && !validatePhone(row.receiver_phone)) {
    if (!errors.receiver_phone) errors.receiver_phone = '格式错误';
  }
  const w = parseFloat(String(row.weight));
  if (row.weight !== '' && row.weight !== undefined && (isNaN(w) || w <= 0)) {
    errors.weight = '必须为正数';
  }
  const q = parseInt(String(row.quantity));
  if (row.quantity !== '' && row.quantity !== undefined && (isNaN(q) || q <= 0 || !Number.isInteger(q))) {
    errors.quantity = '必须为正整数';
  }
  if (row.temp_layer && !(TEMP_LAYER_OPTIONS as readonly string[]).includes(row.temp_layer)) {
    errors.temp_layer = `可选值：${TEMP_LAYER_OPTIONS.join('、')}`;
  }
  // 批次内外部编码重复检测
  const extCode = String(row.external_code || '').trim();
  if (extCode) {
    if (currentBatchCodes.has(extCode)) {
      const firstRow = currentBatchCodes.get(extCode)!;
      errors['external_code'] = `与第${firstRow}行重复`;
    } else {
      currentBatchCodes.set(extCode, row._rowIndex);
    }
  }
  return errors;
}

// POST /api/waybills/remap - 重新应用映射关系解析数据
export async function POST(request: Request) {
  try {
    await initDB();

    const body = await request.json();
    const { rows, rawHeaders, newMapping } = body as {
      rows: Record<string, unknown>[];      // 原始行数据（按旧映射）
      rawHeaders: string[];                  // 原始 Excel 列名顺序
      newMapping: Record<string, string>;   // 新映射 { excel列名: 字段key }
    };

    if (!Array.isArray(rows) || !Array.isArray(rawHeaders) || !newMapping) {
      return NextResponse.json({ error: '参数错误' }, { status: 400 });
    }

    // 倒转旧映射：字段key -> excel列名
    const reverseOldMapping: Record<string, string> = {};
    // 已有 WaybillRow 里的字段（系统标准字段），需要从 rows 的原始数据中按 rawHeaders 重新取

    // 用 newMapping 重新构建 WaybillRow
    // newMapping: { excel列名: 字段key }
    // rows: 已经是 WaybillRow 结构（因为前端传的是当前预览数据）

    // 直接使用 rows 的结构（前端传 WaybillRow 格式）和 newMapping 重算错误
    const remappedRows: WaybillRow[] = [];
    let totalErrors = 0;

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i] as WaybillRow;
      // 重新校验（数据本身未变，只重新计算错误）
      const errors = validateRow(raw);
      if (Object.keys(errors).length > 0) totalErrors++;
      remappedRows.push({
        ...raw,
        _errors: errors,
        _isValid: Object.keys(errors).length === 0,
      });
    }

    // 生成新的 headerHash（基于新映射的字段 key 顺序）
    const headerKeys = rawHeaders.map(h => newMapping[h] || h).filter(Boolean);
    const newHash = crypto.createHash('md5').update(headerKeys.join(',')).digest('hex');

    // 查询是否已有保存的模板
    let hasSavedMapping = false;
    const savedRows = await sql`SELECT header_columns FROM template_mappings WHERE header_hash = ${newHash} LIMIT 1`;
    if (savedRows.length > 0) hasSavedMapping = true;

    return NextResponse.json({
      rows: remappedRows,
      totalCount: remappedRows.length,
      totalErrors,
      mapping: newMapping,
      headerHash: newHash,
      isGrouped: false,
      templateName: '',
      hasSavedMapping,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
