import { NextResponse } from 'next/server';
import { FEE_FIELDS, normalize } from '@/lib/fee-types';
import { hashColumns } from '@/app/api/fees/import/route';

const VALID_DOMAINS = ['运配', '仓储', '干线', '配送'];
const VALID_PRICE_TYPES = ['平台价格', '成本价格', '基础价格', '网点价格', '增值服务价格'];

// POST /api/fees/remap
// 用户手动调整列→字段映射后，重新解析 Excel 数据
// Body: { rawData: string[][], headers: string[], colMap: Record<string, number>, headerRowIdx: number }
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { rawData, headers, colMap, headerRowIdx = 1 } = body as {
      rawData: unknown[][];
      headers: string[];
      colMap: Record<string, number>;
      headerRowIdx?: number;
    };

    if (!rawData || !headers || !colMap) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    // 验证必需字段
    const requiredFields = ['fee_code', 'fee_name', 'business_domain'];
    const missing = requiredFields.filter(f => colMap[f] === undefined);
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: `缺少必需字段映射：${missing.map(f => FEE_FIELDS[f]?.label || f).join('、')}`,
        },
        { status: 400 },
      );
    }

    const dataRows = rawData.slice(headerRowIdx + 1).filter(row =>
      row.some(cell => cell !== '' && cell !== null && cell !== undefined),
    );

    const MAX_ROWS = 5000;
    if (dataRows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `单次导入最多支持 ${MAX_ROWS} 条数据，当前文件有 ${dataRows.length} 条` },
        { status: 400 },
      );
    }

    const feeCodeSet = new Set<string>();
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

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i] as string[];
      const rowNum = i + headerRowIdx + 2;
      const errs: string[] = [];

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

      const fee_name = String(row[colMap['fee_name']] || '').trim();
      if (!fee_name) {
        errs.push('费用名称不能为空');
      } else if (fee_name.length > 32) {
        errs.push('费用名称最多32个字符');
      }

      const business_domain = String(row[colMap['business_domain']] || '').trim();
      if (!business_domain) {
        errs.push('所属业务域不能为空');
      } else if (!VALID_DOMAINS.includes(business_domain)) {
        errs.push(`所属业务域无效，有效值：${VALID_DOMAINS.join('、')}`);
      }

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

      const remark = String(row[colMap['remark']] !== undefined ? row[colMap['remark']] || '' : '').trim();
      if (remark.length > 256) {
        errs.push('备注最多256个字符');
      }

      const creator = String(
        colMap['creator'] !== undefined ? row[colMap['creator']] || '' : '',
      ).trim() || '导入';

      parsed.push({ row: rowNum, fee_code, fee_name, business_domain, price_types, remark, creator, errors: errs });
    }

    // 生成指纹和反向映射
    const colHash = hashColumns(headers, colMap);
    const fieldLabelMap: Record<string, string> = {};
    for (const [field, colIdx] of Object.entries(colMap)) {
      if (colIdx !== undefined) {
        fieldLabelMap[field] = headers[colIdx] || field;
      }
    }

    return NextResponse.json({
      total: parsed.length,
      validCount: parsed.filter(r => r.errors.length === 0).length,
      errorCount: parsed.filter(r => r.errors.length > 0).length,
      preview: parsed.slice(0, 20),
      allRows: parsed,
      colMap,
      colHash,
      fieldLabelMap,
      headers,
      matchMethod: 'manual',
      templateName: '手动映射',
      autoMappingAvailable: true,
      availableFields: Object.keys(FEE_FIELDS).map(k => ({ key: k, label: FEE_FIELDS[k].label })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: '重新解析失败：' + msg }, { status: 500 });
  }
}
