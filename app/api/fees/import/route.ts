import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import {
  FEE_COLUMN_ALIAS_MAP,
  FEE_FIELDS,
  buildAutoMapping,
  extractFields,
  normalize,
} from '@/lib/fee-types';

const VALID_DOMAINS = ['运配', '仓储', '干线', '配送'];
const VALID_PRICE_TYPES = ['平台价格', '成本价格', '基础价格', '网点价格', '增值服务价格'];
const SIMILARITY_THRESHOLD = 0.50; // 模糊匹配阈值（50%）

// ============================================================
// 工具函数
// ============================================================

// 生成列名字符串 hash（用于模板指纹）
export function hashColumns(headers: string[], colMap: Record<string, number>): string {
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

// Jaccard 相似度
function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// 数据行解析（通用）
function parseRows(
  rawData: unknown[][],
  colMap: Record<string, number>,
  startRow = 1,
) {
  const rows = rawData.slice(startRow).filter(row =>
    row.some(cell => cell !== '' && cell !== null && cell !== undefined),
  );

  const parsed: Array<{
    row: number;
    fee_code: string;
    fee_name: string;
    business_domain: string;
    price_types: string[];
    remark: string;
    creator: string;
    errors: string[];
  }> = [];

  const feeCodeSet = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as string[];
    const rowNum = i + startRow + 1; // Excel 行号（1-indexed）
    const errs: string[] = [];

    // fee_code
    const fee_code = String(row[colMap['fee_code']] || '').trim();
    if (!fee_code) {
      errs.push('费用编号不能为空');
    } else if (!/^\d+$/.test(fee_code)) {
      errs.push('费用编号只能输入数字');
    } else if (fee_code.length > 8) {
      errs.push('费用编号最多8位数字');
    } else if (feeCodeSet.has(fee_code)) {
      errs.push('费用编号在文件内重复');
    } else {
      feeCodeSet.add(fee_code);
    }

    // fee_name
    const fee_name = String(row[colMap['fee_name']] || '').trim();
    if (!fee_name) {
      errs.push('费用名称不能为空');
    } else if (fee_name.length > 32) {
      errs.push('费用名称最多32个字符');
    }

    // business_domain
    const business_domain = String(row[colMap['business_domain']] || '').trim();
    if (!business_domain) {
      errs.push('所属业务域不能为空');
    } else if (!VALID_DOMAINS.includes(business_domain)) {
      errs.push(`所属业务域无效，有效值：${VALID_DOMAINS.join('、')}`);
    }

    // price_types
    const priceRaw = String(row[colMap['price_types']] || '').trim();
    const price_types: string[] = [];
    if (priceRaw) {
      const parts = priceRaw.split(/[,，、;；]/).map(s => s.trim()).filter(Boolean);
      for (const p of parts) {
        if (!VALID_PRICE_TYPES.includes(p)) {
          errs.push(`所属报价"${p}"无效，有效值：${VALID_PRICE_TYPES.join('、')}`);
        } else if (!price_types.includes(p)) {
          price_types.push(p);
        }
      }
    }

    // remark
    const remark = String(
      colMap['remark'] !== undefined ? (row[colMap['remark']] || '') :
      colMap['备注'] !== undefined ? (row[colMap['备注']] || '') : ''
    ).trim();

    // creator
    const creator = String(
      colMap['creator'] !== undefined ? row[colMap['creator']] : colMap['创建人'] !== undefined ? row[colMap['创建人']] : '',
    ).trim() || '导入';

    parsed.push({ row: rowNum, fee_code, fee_name, business_domain, price_types, remark, creator, errors: errs });
  }

  return parsed;
}

// ============================================================
// POST: 解析 Excel（支持模板记忆三级降级）
// ============================================================
// Body: FormData with field "file" (Excel file)
// 返回：预览数据 + 映射信息 + 模板匹配结果
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: '请上传 Excel 文件' }, { status: 400 });
    }

    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (
      !allowedTypes.includes(file.type) &&
      !file.name.endsWith('.xlsx') &&
      !file.name.endsWith('.xls')
    ) {
      return NextResponse.json({ error: '仅支持 .xlsx 或 .xls 格式的 Excel 文件' }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const XLSX = await import('xlsx');
    const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });

    if (!wb.SheetNames || wb.SheetNames.length === 0) {
      return NextResponse.json({ error: 'Excel 文件中没有工作表' }, { status: 400 });
    }

    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];

    if (rawData.length < 2) {
      return NextResponse.json({ error: 'Excel 文件数据为空或格式不正确' }, { status: 400 });
    }

    // ========================================
    // 第一步：检测表头行（跳过空行/标题行）
    // ========================================
    let headerRowIdx = 0;
    let foundHeader = false;
    for (let i = 0; i < Math.min(15, rawData.length); i++) {
      const row = rawData[i] as string[];
      const nonEmpty = row.filter(c => String(c).trim()).length;
      if (nonEmpty >= 3) {
        const mapping = buildAutoMapping(row.map(h => String(h)));
        // 必需字段至少匹配 2 个
        const matched = ['fee_code', 'fee_name', 'business_domain'].filter(f => mapping[f] !== undefined).length;
        if (matched >= 2) {
          headerRowIdx = i;
          foundHeader = true;
          break;
        }
      }
    }

    if (!foundHeader) {
      return NextResponse.json(
        {
          error: '无法识别表头格式，请确保 Excel 包含以下列名之一：费用编号、费用名称、所属业务域',
          autoMappingAvailable: true,
          availableFields: Object.keys(FEE_FIELDS).map(k => ({ key: k, label: FEE_FIELDS[k].label })),
        },
        { status: 422 },
      );
    }

    const headers = (rawData[headerRowIdx] as string[]).map(h => normalize(h));
    const rawHeaders = (rawData[headerRowIdx] as string[]).map(h => String(h).trim());

    // ========================================
    // 第二步：模板记忆三级降级
    // ========================================
    // 2a. 自动别名检测（当前文件列名 → 字段）
    let colMap = buildAutoMapping(headers);
    let matchMethod: 'alias' | 'db_exact' | 'db_fuzzy' = 'alias';
    let templateName = '自动识别';
    let savedMappingId: number | null = null;

    // 2b. 数据库精确匹配（列索引顺序 hash）
    if (Object.keys(colMap).length >= 2) {
      try {
        const colHash = hashColumns(rawHeaders, colMap);
        const dbRows = await sql`
          SELECT id, header_columns, name
          FROM template_mappings
          WHERE table_name = 'fee_types' AND column_hash = ${colHash}
          LIMIT 1
        ` as Array<{ id: number; header_columns: Record<string, number>; name: string | null }>;

        if (dbRows.length > 0) {
          colMap = dbRows[0].header_columns as Record<string, number>;
          matchMethod = 'db_exact';
          templateName = dbRows[0].name || `模板#${dbRows[0].id}`;
          savedMappingId = dbRows[0].id;
        }
      } catch (_) {
        // 数据库查询失败，继续用别名匹配
      }
    }

    // 2c. 数据库模糊匹配（Jaccard 相似度）
    if (matchMethod === 'alias' && Object.keys(colMap).length >= 2) {
      try {
        const currentFields = extractFields(headers);
        const dbRows = await sql`
          SELECT id, header_columns, name,
                 (SELECT COUNT(*) FROM jsonb_object_keys(header_columns)) as field_count
          FROM template_mappings
          WHERE table_name = 'fee_types'
          ORDER BY id DESC
          LIMIT 50
        ` as Array<{ id: number; header_columns: Record<string, number>; name: string | null; field_count: string }>;

        let bestScore = 0;
        let bestRow: typeof dbRows[0] | null = null;
        for (const r of dbRows) {
          const savedFields = Object.values(r.header_columns).map(String);
          const score = jaccardSimilarity(currentFields, savedFields);
          if (score > bestScore) {
            bestScore = score;
            bestRow = r;
          }
        }

        if (bestScore >= SIMILARITY_THRESHOLD && bestRow) {
          colMap = bestRow.header_columns as Record<string, number>;
          matchMethod = 'db_fuzzy';
          templateName = `模糊匹配 ${Math.round(bestScore * 100)}%`;
          savedMappingId = bestRow.id;
        }
      } catch (_) {
        // 数据库查询失败，继续用别名匹配
      }
    }

    // ========================================
    // 第三步：验证必需字段
    // ========================================
    const requiredFields = ['fee_code', 'fee_name', 'business_domain'];
    const missing = requiredFields.filter(f => colMap[f] === undefined);
    if (missing.length > 0) {
      // 返回手动映射界面信息（用户可自行选择列对应关系）
      return NextResponse.json(
        {
          error: `缺少必需字段：${missing.map(f => FEE_FIELDS[f]?.label || f).join('、')}。请手动选择列对应关系。`,
          autoMappingAvailable: true,
          headers: rawHeaders,
          matchedFields: colMap,
          availableFields: Object.keys(FEE_FIELDS).map(k => ({ key: k, label: FEE_FIELDS[k].label })),
          requiredFields: requiredFields.map(f => ({ key: f, label: FEE_FIELDS[f]?.label || f })),
          matchMethod,
          templateName,
        },
        { status: 422 },
      );
    }

    // ========================================
    // 第四步：解析数据
    // ========================================
    const MAX_ROWS = 5000;
    const dataRows = rawData.slice(headerRowIdx + 1);
    if (dataRows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `单次导入最多支持 ${MAX_ROWS} 条数据，当前文件有 ${dataRows.length} 条` },
        { status: 400 },
      );
    }

    const parsed = parseRows(rawData, colMap, headerRowIdx);

    // 生成模板指纹
    const colHash = hashColumns(rawHeaders, colMap);

    // 反向映射：字段 → 列名（用于前端显示）
    const fieldLabelMap: Record<string, string> = {};
    for (const [field, colIdx] of Object.entries(colMap)) {
      if (colIdx !== undefined) {
        fieldLabelMap[field] = rawHeaders[colIdx] || field;
      }
    }

    return NextResponse.json({
      total: parsed.length,
      validCount: parsed.filter(r => r.errors.length === 0).length,
      errorCount: parsed.filter(r => r.errors.length > 0).length,
      preview: parsed.slice(0, 20),
      allRows: parsed,
      colMap,            // 列索引映射 { fee_code: 0, fee_name: 1, ... }
      colHash,           // 模板指纹（用于保存/查询）
      fieldLabelMap,     // 反向：字段 → 原始列名
      headers: rawHeaders, // 原始表头
      matchMethod,        // 'alias' | 'db_exact' | 'db_fuzzy'
      templateName,
      savedMappingId,
      autoMappingAvailable: true,
      availableFields: Object.keys(FEE_FIELDS).map(k => ({ key: k, label: FEE_FIELDS[k].label })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: '解析 Excel 文件失败：' + msg }, { status: 500 });
  }
}

// ============================================================
// PUT: 确认导入（分批写入数据库）
// ============================================================
// Body: JSON { rows: [...], action: 'insert'|'skip', creator: string }
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { rows, action = 'insert', creator = '导入' } = body as {
      rows: Array<{
        fee_code: string;
        fee_name: string;
        business_domain: string;
        price_types: string[];
        remark: string;
        creator: string;
      }>;
      action?: 'insert' | 'skip';
      creator?: string;
    };

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: '没有可导入的数据' }, { status: 400 });
    }

    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];
    const BATCH_SIZE = 100;

    // 去重查询
    const feeCodes = rows.map(r => r.fee_code);
    const existingRows = await sql`
      SELECT fee_code FROM fee_types WHERE fee_code = ANY(${feeCodes})
    ` as Array<{ fee_code: string }>;
    const existingSet = new Set(existingRows.map(r => r.fee_code));

    // 分批写入
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      for (const row of batch) {
        if (existingSet.has(row.fee_code)) {
          if (action === 'skip') {
            skipped++;
            continue;
          } else {
            errors.push(`费用编号 ${row.fee_code} 已存在，跳过`);
            continue;
          }
        }

        try {
          await sql`
            INSERT INTO fee_types (fee_code, fee_name, business_domain, price_types, remark, creator, updater)
            VALUES (${row.fee_code}, ${row.fee_name}, ${row.business_domain}, ${row.price_types}, ${row.remark}, ${row.creator || creator}, ${row.creator || creator})
          `;
          inserted++;
          existingSet.add(row.fee_code);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`费用编号 ${row.fee_code} 写入失败：${msg}`);
        }
      }
    }

    return NextResponse.json({ inserted, skipped, errors: errors.slice(0, 50), total: rows.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
