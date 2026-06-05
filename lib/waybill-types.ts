// 运单数据类型
export interface Waybill {
  id: number;
  external_code: string;
  sender_name: string;
  sender_phone: string;
  sender_address: string;
  receiver_name: string;
  receiver_phone: string;
  receiver_address: string;
  weight: number;
  quantity: number;
  temp_layer: string;
  remark: string;
  status: string;
  created_at: string;
}

// 运单表单数据（编辑状态）
export interface WaybillRow {
  _rowIndex: number;      // 原始行号（1-based）
  _selected?: boolean;     // 是否选中
  external_code: string;
  sender_name: string;
  sender_phone: string;
  sender_address: string;
  receiver_name: string;
  receiver_phone: string;
  receiver_address: string;
  weight: number | string;
  quantity: number | string;
  temp_layer: string;
  remark: string;
  // 校验相关
  _errors: Record<string, string>;  // field -> error message
  _warnings: Record<string, string>; // field -> warning message（如外部编码重复提示）
  _isValid: boolean;
}

// 导入预览响应
export interface ImportPreview {
  headers: string[];           // 原始表头
  rows: WaybillRow[];           // 解析后的数据
  totalCount: number;           // 总行数
  totalErrors: number;           // 有错误的行数
  mapping: Record<string, string>; // 列名映射 {"发件人姓名": "sender_name"}
  templateName: string;          // 模板名称
}

// 列映射配置（用户手动选择时用）
export interface ColumnMapping {
  excelColumn: string;   // Excel列名
  fieldKey: string;       // 系统字段key
}

// 校验错误
export interface ValidationError {
  row: number;         // 行号
  field: string;       // 字段
  value: string;       // 错误值
  message: string;     // 错误信息
}

// 提交结果
export interface SubmitResult {
  success: number;
  failed: number;
  errors: ValidationError[];
}

// 运单列表查询参数
export interface WaybillQuery {
  external_code?: string;
  sender_name?: string;
  sender_phone?: string;
  receiver_name?: string;
  receiver_phone?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  pageSize?: number;
}

// 系统字段定义（用于手动映射UI）
export interface SystemField {
  key: string;
  label: string;
  required: boolean;
  options?: string[];   // 枚举值（如温层）
}

export const SYSTEM_FIELDS: SystemField[] = [
  { key: 'order_no', label: '外部编码', required: false },
  // A组：门店模式
  { key: 'store_name', label: '收货门店', required: false },
  // B组：收件人模式（三选一或三选全）
  { key: 'receiver_name', label: '收件人姓名', required: false },
  { key: 'receiver_phone', label: '收件人电话', required: false },
  { key: 'receiver_address', label: '收件人地址', required: false },
  // 发货方
  { key: 'sender_name', label: '发件人姓名', required: false },
  { key: 'sender_phone', label: '发件人电话', required: false },
  { key: 'sender_address', label: '发件人地址', required: false },
  // SKU 物品信息
  { key: 'item_code', label: 'SKU物品编码', required: true },
  { key: 'item_name', label: 'SKU物品名称', required: true },
  { key: 'quantity', label: 'SKU发货数量', required: true },
  { key: 'specification', label: 'SKU规格型号', required: false },
  { key: 'remark', label: '备注', required: false },
];

// 列名别名映射表（用于自动识别，适配考试要求的下单字段定义）
export const COLUMN_ALIAS_MAP: Record<string, string> = {
  // 外部编码
  '外部编码': 'order_no',
  '外部订单号': 'order_no',
  '客户单号': 'order_no',
  '单号': 'order_no',
  'ref code': 'order_no', 'ref_code': 'order_no', 'refCode': 'order_no',
  'Ref Code': 'order_no', 'reference_code': 'order_no', 'reference code': 'order_no',
  'orderNo': 'order_no', 'Order No': 'order_no',
  'tracking_no': 'order_no', 'trackingNo': 'order_no', 'Tracking No': 'order_no',
  'waybill_no': 'order_no', 'waybillNo': 'order_no', 'Waybill No': 'order_no',
  'shipment_no': 'order_no', 'shipmentNo': 'order_no', 'Shipment No': 'order_no',

  // A组：收货门店（门店模式必填）
  '收货门店': 'store_name',
  '门店': 'store_name',
  '店铺名称': 'store_name',
  '机构名称': 'store_name',
  '门店名称': 'store_name',
  '收货店铺': 'store_name',
  '配送门店': 'store_name',
  'storeName': 'store_name', 'store name': 'store_name', 'Store Name': 'store_name',

  // 发货方
  '发件人姓名': 'sender_name', '发件人': 'sender_name', '发货人': 'sender_name',
  'sender': 'sender_name', 'Sender': 'sender_name', '寄件人': 'sender_name', '寄件人姓名': 'sender_name',
  '发件人电话': 'sender_phone', '发电话': 'sender_phone', '发货电话': 'sender_phone',
  'sender tel': 'sender_phone', 'Sender Tel': 'sender_phone', '寄件人电话': 'sender_phone',
  '发件人地址': 'sender_address', '发地址': 'sender_address', '发货地址': 'sender_address',
  'sender address': 'sender_address', 'Sender Address': 'sender_address', '寄件人地址': 'sender_address',

  // B组：收件人信息
  '收件人姓名': 'receiver_name', '收件人': 'receiver_name', '收货人': 'receiver_name',
  'receiver': 'receiver_name', 'Receiver': 'receiver_name',
  '收件人电话': 'receiver_phone', '收电话': 'receiver_phone', '收货电话': 'receiver_phone',
  'receiver tel': 'receiver_phone', 'Receiver Tel': 'receiver_phone',
  '收件人地址': 'receiver_address', '收地址': 'receiver_address', '收货地址': 'receiver_address',
  'receiver address': 'receiver_address', 'Receiver Address': 'receiver_address',

  // SKU 物品编码（必填）
  'SKU物品编码': 'item_code', '物品编码': 'item_code', 'SKU编码': 'item_code',
  '商品编码': 'item_code', '条码': 'item_code', 'skuCode': 'item_code',
  'SKU Code': 'item_code', 'itemCode': 'item_code', '编码': 'item_code',

  // SKU 物品名称（必填）
  'SKU物品名称': 'item_name', '物品名称': 'item_name', 'SKU名称': 'item_name',
  '商品名称': 'item_name', '品名': 'item_name', '货品': 'item_name',
  'itemName': 'item_name', 'Item Name': 'item_name', '物品': 'item_name',

  // SKU 发货数量（必填，正数）
  'SKU发货数量': 'quantity', '发货数量': 'quantity', '数量': 'quantity',
  '件数': 'quantity', 'qty': 'quantity', 'Qty': 'quantity', 'QTY': 'quantity',
  'count': 'quantity', 'Count': 'quantity',

  // SKU 规格型号
  'SKU规格型号': 'specification', '规格型号': 'specification',
  '规格': 'specification', '型号': 'specification',

  // 备注
  '备注': 'remark', '附言': 'remark', 'note': 'remark', 'Note': 'remark',
};

// 温层可选值
export const TEMP_LAYER_OPTIONS = ['常温', '冷藏', '冷冻'] as const;
