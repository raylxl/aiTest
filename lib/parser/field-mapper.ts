/**
 * 公共字段映射模块
 * 统一维护中英文字段名映射，供 excel-parser / pdf-parser / word-parser 共用
 */

// 已知的英文目标字段名（直接透传）
export const KNOWN_TARGET_FIELDS = new Set([
  'orderNo',
  'storeName',
  'receiverName',
  'receiverPhone',
  'receiverAddress',
  'senderName',
  'senderPhone',
  'senderAddress',
  'itemCode',
  'itemName',
  'itemCategory',
  'specification',
  'quantity',
  'unit',
  'remark',
  'extraFields',
]);

// 中文 → 英文字段映射表
export const FIELD_NAME_MAPPING: Record<string, string> = {
  // 运单号
  '运单号': 'orderNo',
  '单据号': 'orderNo',
  '配送单号': 'orderNo',
  '订单号': 'orderNo',
  '出库单号': 'orderNo',
  '发货单号': 'orderNo',

  // 发货人
  '发货人': 'senderName',
  '发货人姓名': 'senderName',
  '寄件人': 'senderName',

  // 门店/收货方
  '收货门店': 'storeName',
  '收货机构': 'storeName',
  '门店名称': 'storeName',
  '门店': 'storeName',
  '收货方': 'storeName',
  '收货单位': 'storeName',

  // 收货人
  '收货人': 'receiverName',
  '收货人姓名': 'receiverName',
  '收件人': 'receiverName',

  // 电话
  '电话': 'receiverPhone',
  '手机': 'receiverPhone',
  '联系电话': 'receiverPhone',
  '收货人电话': 'receiverPhone',
  '收货电话': 'receiverPhone',
  '手机号': 'receiverPhone',

  // 地址
  '地址': 'receiverAddress',
  '收货地址': 'receiverAddress',
  '详细地址': 'receiverAddress',
  '收货人地址': 'receiverAddress',
  '送货地址': 'receiverAddress',

  // 物品名称
  '物品名称': 'itemName',
  '商品名称': 'itemName',
  'SKU名称': 'itemName',
  '货品名称': 'itemName',
  '产品名称': 'itemName',
  '品名': 'itemName',

  // 物品编码
  '物品编码': 'itemCode',
  '商品编码': 'itemCode',
  'SKU编码': 'itemCode',
  'SKU条码': 'itemCode',
  '产品编码': 'itemCode',
  '货号': 'itemCode',

  // 分类
  '物品分类': 'itemCategory',
  '商品分类': 'itemCategory',
  '分类': 'itemCategory',
  '品类': 'itemCategory',

  // 规格
  '规格型号': 'specification',
  '规格': 'specification',
  '型号': 'specification',

  // 单位
  '单位': 'unit',
  '计量单位': 'unit',

  // 数量
  '数量': 'quantity',
  '发货数量': 'quantity',
  '出库数量': 'quantity',
  '订货数量': 'quantity',
  '订单数量': 'quantity',
  '要货数量': 'quantity',

  // 备注
  '备注': 'remark',
  '说明': 'remark',
  '备注信息': 'remark',
};

/**
 * 映射源字段名到标准目标字段名
 * @param sourceName 源字段名（中文或英文）
 * @returns 标准目标字段名，无法映射时返回 null
 */
export function mapFieldName(sourceName: string): string | null {
  if (!sourceName || typeof sourceName !== 'string') return null;

  const trimmed = sourceName.trim();
  if (!trimmed) return null;

  // 先检查是否是已知的目标字段名（英文），直接透传
  if (KNOWN_TARGET_FIELDS.has(trimmed)) return trimmed;

  // 查找中文映射
  return FIELD_NAME_MAPPING[trimmed] || null;
}

/**
 * 模糊匹配字段名（用于列头相似度匹配）
 * @param sourceName 源字段名
 * @returns 最佳匹配的标准字段名
 */
export function fuzzyMatchFieldName(sourceName: string): string | null {
  if (!sourceName) return null;

  const normalized = sourceName.toLowerCase().trim();

  // 直接精确匹配
  const exact = mapFieldName(sourceName);
  if (exact) return exact;

  // 关键词匹配
  const keywords: Record<string, string[]> = {
    'orderNo': ['单号', '编号', 'no', 'order'],
    'storeName': ['门店', 'store', '收货方', '机构'],
    'receiverName': ['收货人', '收件人', 'receiver', '姓名'],
    'receiverPhone': ['电话', '手机', 'phone', 'tel'],
    'receiverAddress': ['地址', 'address', 'location'],
    'itemName': ['名称', '品名', 'name', 'item'],
    'itemCode': ['编码', 'code', 'sku', '条码'],
    'quantity': ['数量', 'qty', 'quantity', 'count'],
  };

  for (const [field, kws] of Object.entries(keywords)) {
    if (kws.some(kw => normalized.includes(kw))) {
      return field;
    }
  }

  return null;
}
