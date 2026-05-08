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
  { key: 'external_code', label: '外部编码', required: false },
  { key: 'sender_name', label: '发件人姓名', required: true },
  { key: 'sender_phone', label: '发件人电话', required: true },
  { key: 'sender_address', label: '发件人地址', required: true },
  { key: 'receiver_name', label: '收件人姓名', required: true },
  { key: 'receiver_phone', label: '收件人电话', required: true },
  { key: 'receiver_address', label: '收件人地址', required: true },
  { key: 'weight', label: '重量(kg)', required: true },
  { key: 'quantity', label: '件数', required: true },
  { key: 'temp_layer', label: '温层', required: true, options: ['常温', '冷藏', '冷冻'] },
  { key: 'remark', label: '备注', required: false },
];

// 列名别名映射表（用于自动识别）
export const COLUMN_ALIAS_MAP: Record<string, string> = {
  // 外部编码（英文别名最全）
  '外部编码': 'external_code',
  '外部订单号': 'external_code',
  '客户单号': 'external_code',
  '单号': 'external_code',
  'ref code': 'external_code',
  'ref_code': 'external_code',
  'refCode': 'external_code',
  'Ref Code': 'external_code',
  'reference_code': 'external_code',
  'reference code': 'external_code',
  'order_no': 'external_code',
  'order no': 'external_code',
  'orderNo': 'external_code',
  'Order No': 'external_code',
  'tracking_no': 'external_code',
  'tracking no': 'external_code',
  'trackingNo': 'external_code',
  'Tracking No': 'external_code',
  'waybill_no': 'external_code',
  'waybill no': 'external_code',
  'waybillNo': 'external_code',
  'Waybill No': 'external_code',
  'shipment_no': 'external_code',
  'shipment no': 'external_code',
  'shipmentNo': 'external_code',
  'Shipment No': 'external_code',
  'code': 'external_code',
  'Code': 'external_code',
  // 发件人姓名
  '发件人姓名': 'sender_name',
  '发件人': 'sender_name',        // 分组模板别名
  '发货人': 'sender_name',
  'sender': 'sender_name',
  '寄件人': 'sender_name',
  '寄件人姓名': 'sender_name',
  // 发件人电话
  '发件人电话': 'sender_phone',
  '发件电话': 'sender_phone',      // 分组模板别名
  '发货电话': 'sender_phone',
  'sender tel': 'sender_phone',
  '寄件人电话': 'sender_phone',
  // 发件人地址
  '发件人地址': 'sender_address',
  '发件地址': 'sender_address',    // 分组模板别名
  '发货地址': 'sender_address',
  'sender address': 'sender_address',
  '寄件人地址': 'sender_address',
  // 收件人姓名
  '收件人姓名': 'receiver_name',
  '收件人': 'receiver_name',       // 分组模板别名
  '收货人': 'receiver_name',
  'receiver': 'receiver_name',
  // 收件人电话
  '收件人电话': 'receiver_phone',
  '收件电话': 'receiver_phone',     // 分组模板别名
  '收货电话': 'receiver_phone',
  'receiver tel': 'receiver_phone',
  // 收件人地址
  '收件人地址': 'receiver_address',
  '收件地址': 'receiver_address',   // 分组模板别名
  '收货地址': 'receiver_address',
  'receiver address': 'receiver_address',
  // 重量
  '重量(kg)': 'weight',
  '重量': 'weight',
  'weight(kg)': 'weight',
  'weight': 'weight',
  '重量(KG)': 'weight',
  '重量(Kg)': 'weight',
  'w': 'weight',
  'W': 'weight',
  // 件数
  '件数': 'quantity',
  '数量': 'quantity',
  'qty': 'quantity',
  'QTY': 'quantity',
  'count': 'quantity',
  'Count': 'quantity',
  'n': 'quantity',
  'N': 'quantity',
  // 温层
  '温层': 'temp_layer',
  '温度要求': 'temp_layer',
  'temp zone': 'temp_layer',
  // 备注
  '备注': 'remark',
  '附言': 'remark',
  'note': 'remark',
};

// 温层可选值
export const TEMP_LAYER_OPTIONS = ['常温', '冷藏', '冷冻'] as const;
