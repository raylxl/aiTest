/**
 * 费用类型导入 - 字段别名映射表
 *
 * 规则：
 *  - 同一字段的所有别名映射到同一个 key
 *  - 中文别名优先（列名中更常见）
 *  - 大小写不敏感（normalize 后匹配）
 *
 * 使用方式（参考）：
 *   const key = normalize(colName); // colName.trim().toLowerCase()
 *   const fieldKey = FEE_COLUMN_ALIAS_MAP[key] ?? null;
 */

// 小写标准化
function n(s: string): string {
  return String(s || '').trim().toLowerCase();
}

// 费用字段别名映射
export const FEE_COLUMN_ALIAS_MAP: Record<string, string> = {
  // ===================== 费用编号 =====================
  [n('费用编号')]: 'fee_code',
  [n('费用编码')]: 'fee_code',
  [n('编号')]: 'fee_code',
  [n('编码')]: 'fee_code',
  [n('fee_code')]: 'fee_code',
  [n('feecode')]: 'fee_code',
  [n('Fee Code')]: 'fee_code',
  [n('Code')]: 'fee_code',
  [n('code')]: 'fee_code',
  [n('fee_id')]: 'fee_code',
  [n('feeid')]: 'fee_code',
  [n('id')]: 'fee_code',
  [n('ID')]: 'fee_code',
  [n('费用ID')]: 'fee_code',
  [n('费用id')]: 'fee_code',

  // ===================== 费用名称 =====================
  [n('费用名称')]: 'fee_name',
  [n('名称')]: 'fee_name',
  [n('费用名')]: 'fee_name',
  [n('fee_name')]: 'fee_name',
  [n('feename')]: 'fee_name',
  [n('Fee Name')]: 'fee_name',
  [n('Name')]: 'fee_name',
  [n('name')]: 'fee_name',
  [n('费用')]: 'fee_name',
  [n('项目名称')]: 'fee_name',
  [n('项目')]: 'fee_name',

  // ===================== 所属业务域 =====================
  [n('所属业务域')]: 'business_domain',
  [n('业务域')]: 'business_domain',
  [n('业务类型')]: 'business_domain',
  [n('业务线')]: 'business_domain',
  [n('业务')]: 'business_domain',
  [n('business_domain')]: 'business_domain',
  [n('businessdomain')]: 'business_domain',
  [n('Business Domain')]: 'business_domain',
  [n('Domain')]: 'business_domain',
  [n('domain')]: 'business_domain',
  [n('业务域/线路')]: 'business_domain',
  [n('业务域/线路类型')]: 'business_domain',

  // ===================== 所属报价（价格类型） =====================
  [n('所属报价')]: 'price_types',
  [n('报价类型')]: 'price_types',
  [n('价格类型')]: 'price_types',
  [n('价格类型/报价类型')]: 'price_types',
  [n('报价')]: 'price_types',
  [n('price_types')]: 'price_types',
  [n('pricetypes')]: 'price_types',
  [n('Price Types')]: 'price_types',
  [n('Price Type')]: 'price_types',
  [n('price')]: 'price_types',
  [n('类型')]: 'price_types',

  // ===================== 备注 =====================
  [n('备注')]: 'remark',
  [n('说明')]: 'remark',
  [n('描述')]: 'remark',
  [n('remark')]: 'remark',
  [n('Remark')]: 'remark',
  [n('note')]: 'remark',
  [n('Note')]: 'remark',
  [n('description')]: 'remark',
  [n('Description')]: 'remark',
  [n('补充')]: 'remark',
  [n('附加说明')]: 'remark',

  // ===================== 创建人 =====================
  [n('创建人')]: 'creator',
  [n('操作人')]: 'creator',
  [n('录入人')]: 'creator',
  [n('上传人')]: 'creator',
  [n('creator')]: 'creator',
  [n('Creator')]: 'creator',
  [n('created_by')]: 'creator',
  [n('Created By')]: 'creator',
  [n('createdby')]: 'creator',
  [n('operator')]: 'creator',
  [n('Operator')]: 'creator',

  // ===================== 创建时间 =====================
  [n('创建时间')]: 'create_time',
  [n('创建日期')]: 'create_time',
  [n('录入时间')]: 'create_time',
  [n('create_time')]: 'create_time',
  [n('createtime')]: 'create_time',
  [n('Create Time')]: 'create_time',
  [n('created_at')]: 'create_time',
  [n('Created At')]: 'create_time',
  [n('创建日')]: 'create_time',
  [n('日期')]: 'create_time',
  [n('时间')]: 'create_time',

  // ===================== 状态 =====================
  [n('状态')]: 'status',
  [n('审核状态')]: 'status',
  [n('启用状态')]: 'status',
  [n('status')]: 'status',
  [n('Status')]: 'status',

  // ===================== 更新人 =====================
  [n('修改人')]: 'updater',
  [n('更新人')]: 'updater',
  [n('updater')]: 'updater',
  [n('Updater')]: 'updater',
  [n('updated_by')]: 'updater',
  [n('last_updated_by')]: 'updater',

  // ===================== 更新时间 =====================
  [n('修改时间')]: 'update_time',
  [n('更新时间')]: 'update_time',
  [n('update_time')]: 'update_time',
  [n('updatetime')]: 'update_time',
  [n('updated_at')]: 'update_time',
  [n('Updated At')]: 'update_time',
  [n('修改日期')]: 'update_time',
};

// 费用类型表字段定义（用于生成下拉选项）
export const FEE_FIELDS: Record<string, { label: string; required: boolean; options?: string[] }> = {
  fee_code: { label: '费用编号', required: true },
  fee_name: { label: '费用名称', required: true },
  business_domain: { label: '所属业务域', required: true },
  price_types: { label: '所属报价', required: false },
  remark: { label: '备注', required: false },
  creator: { label: '创建人', required: false },
  create_time: { label: '创建时间', required: false },
  status: { label: '状态', required: false },
};

// 根据表头列名，自动检测字段映射
export function buildAutoMapping(headers: string[]): Record<string, number> {
  const colMap: Record<string, number> = {};
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    const key = n(h);
    const field = FEE_COLUMN_ALIAS_MAP[key];
    if (field && colMap[field] === undefined) {
      colMap[field] = i;
    }
  }
  return colMap;
}

// 根据列索引，检测当前模板包含的字段集合
export function extractFields(headers: string[]): string[] {
  const fields: string[] = [];
  for (const h of headers) {
    const key = n(h);
    const field = FEE_COLUMN_ALIAS_MAP[key];
    if (field) fields.push(field);
  }
  return fields;
}

// 标准化列名
export function normalize(s: string): string {
  return n(s);
}
