import { NextResponse } from 'next/server';
import sql, { initDB } from '@/lib/db';
import type { WaybillRow } from '@/lib/waybill-types';
import crypto from 'crypto';

const TEMP_LAYER_OPTIONS = ['常温', '冷藏', '冷冻'] as const;
const REQUIRED_FIELDS = ['sender_name', 'sender_phone', 'sender_address', 'receiver_name', 'receiver_phone', 'receiver_address', 'weight', 'quantity', 'temp_layer'];

function validatePhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone.trim()) || /^0\d{2,3}-?\d{7,8}$/.test(phone.trim());
}

// 通用行校验（支持 trim 预处理）
function validateRowFields(row: Record<string, string>, rowIndex: number, currentBatchCodes: Map<string, number>): { errors: Record<string, string>; isValid: boolean } {
  const errors: Record<string, string> = {};
  for (const k of REQUIRED_FIELDS) {
    const v = row[k] || '';
    if (!v.trim()) errors[k] = '不能为空';
  }
  if (row.sender_phone && !validatePhone(row.sender_phone)) {
    if (!errors.sender_phone) errors.sender_phone = '格式错误';
  }
  if (row.receiver_phone && !validatePhone(row.receiver_phone)) {
    if (!errors.receiver_phone) errors.receiver_phone = '格式错误';
  }
  const w = parseFloat(row.weight || '');
  if (row.weight && (isNaN(w) || w <= 0)) errors.weight = '必须为正数';
  const q = parseInt(row.quantity || '');
  if (row.quantity && (isNaN(q) || q <= 0 || !Number.isInteger(q))) errors.quantity = '必须为正整数';
  if (row.temp_layer && !(TEMP_LAYER_OPTIONS as readonly string[]).includes(row.temp_layer as '常温' | '冷藏' | '冷冻')) {
    errors.temp_layer = `可选值：${[...TEMP_LAYER_OPTIONS].join('、')}`;
  }
  const extCode = (row.external_code || '').trim();
  if (extCode) {
    if (currentBatchCodes.has(extCode)) {
      errors['external_code'] = `与第${currentBatchCodes.get(extCode)}行重复`;
    } else {
      currentBatchCodes.set(extCode, rowIndex);
    }
  }
  return { errors, isValid: Object.keys(errors).length === 0 };
}

// 用新映射从原始行数据中提取字段值
function remapRow(rawRow: unknown[], headers: string[], newMapping: Record<string, string>, isGrouped: boolean): Record<string, string> {
  const mapped: Record<string, string> = {};
  if (isGrouped) {
    for (let colIdx = 0; colIdx < rawRow.length; colIdx++) {
      const fk = newMapping[`group_col_${colIdx}`];
      if (fk) mapped[fk] = String(rawRow[colIdx] ?? '').trim();
    }
  } else {
    for (let colIdx = 0; colIdx < headers.length; colIdx++) {
      const headerName = headers[colIdx];
      const fk = newMapping[headerName];
      if (fk) mapped[fk] = String(rawRow[colIdx] ?? '').trim();
    }
  }
  return mapped;
}

// POST /api/waybills/remap
// 支持两种模式：
// 1. 有 rawRows：用新映射重新解析原始行数据（真正重新映射）
// 2. 无 rawRows：仅重新校验（向后兼容）
export async function POST(request: Request) {
  try {
    await initDB();

    const body = await request.json();
    const { rows, rawRows, rawHeaders, newMapping, isGrouped = false } = body as {
      rows: WaybillRow[];                     // 旧预览数据（用于保留 _selected 等状态）
      rawRows: unknown[][];                    // 原始 Excel 行数据（不含表头）
      rawHeaders: string[];                    // 原始 Excel 列名
      newMapping: Record<string, string>;      // 新映射 { excel列名: 字段key }
      isGrouped: boolean;                     // 是否分组表头
    };

    if (!Array.isArray(rows) || !Array.isArray(rawHeaders) || !newMapping) {
      return NextResponse.json({ error: '参数错误' }, { status: 400 });
    }

    const remappedRows: WaybillRow[] = [];
    let totalErrors = 0;
    const currentBatchCodes = new Map<string, number>();

    if (Array.isArray(rawRows) && rawRows.length > 0) {
      // ========== 模式1：真正的重新映射（用新映射解析原始数据）==========
      for (let i = 0; i < rawRows.length; i++) {
        const rawRow = rawRows[i] as unknown[];
        const existingRow = rows[i] as WaybillRow | undefined;
        const rowIndex = (existingRow?._rowIndex) ?? (i + 2); // 保留原始行号

        // 用新映射提取字段
        const fieldMap = remapRow(rawRow, rawHeaders, newMapping, isGrouped);

        // 重新校验（用新映射提取的字段值）
        const { errors, isValid } = validateRowFields(fieldMap, rowIndex, currentBatchCodes);
        if (!isValid) totalErrors++;

        // 保留原选中状态，其余字段用新映射重新解析的值
        remappedRows.push({
          _rowIndex: rowIndex,
          _selected: existingRow?._selected ?? true,
          external_code: fieldMap.external_code || '',
          sender_name: fieldMap.sender_name || '',
          sender_phone: fieldMap.sender_phone || '',
          sender_address: fieldMap.sender_address || '',
          receiver_name: fieldMap.receiver_name || '',
          receiver_phone: fieldMap.receiver_phone || '',
          receiver_address: fieldMap.receiver_address || '',
          weight: fieldMap.weight || '',
          quantity: fieldMap.quantity || '',
          temp_layer: fieldMap.temp_layer || '',
          remark: fieldMap.remark || '',
          _errors: errors,
          _warnings: {},
          _isValid: isValid,
        });
      }
    } else {
      // ========== 模式2：仅重新校验（无 rawRows，向后兼容）==========
      for (const raw of rows as WaybillRow[]) {
        const fieldMap: Record<string, string> = {};
        for (const k of REQUIRED_FIELDS) {
          fieldMap[k] = String(raw[k as keyof WaybillRow] ?? '').trim();
        }
        fieldMap.external_code = String(raw.external_code ?? '').trim();
        const { errors, isValid } = validateRowFields(fieldMap, raw._rowIndex, currentBatchCodes);
        if (!isValid) totalErrors++;
        remappedRows.push({ ...raw, _errors: errors, _isValid: isValid });
      }
    }

    // 生成新的 headerHash（基于新映射的字段 key 顺序）
    const headerKeys = rawHeaders.map(h => newMapping[h] || '').filter(Boolean);
    const newHash = crypto.createHash('md5').update(headerKeys.join(',')).digest('hex');

    // 查询是否已有保存的模板
    let hasSavedMapping = false;
    try {
      const savedRows = await sql`SELECT header_columns FROM template_mappings WHERE header_hash = ${newHash} LIMIT 1`;
      if (savedRows.length > 0) hasSavedMapping = true;
    } catch { /* 表可能不存在 */ }

    return NextResponse.json({
      rows: remappedRows,
      totalCount: remappedRows.length,
      totalErrors,
      mapping: newMapping,
      headerHash: newHash,
      isGrouped,
      templateName: '',
      hasSavedMapping,
      templateMatchNote: hasSavedMapping ? '已保存模板' : '',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
