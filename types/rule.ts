// 规则引擎类型定义

export type FileType = 'excel' | 'pdf' | 'word' | 'csv';
export type ParserType = 'table' | 'matrix' | 'card' | 'text' | 'multi-sheet' | 'multi-page' | 'double-matrix';
export type DataType = 'string' | 'number' | 'date';

export interface ColumnMapping {
  sourceIndex: number;
  targetField: string;
  dataType: DataType;
  transform?: string;
  required?: boolean;
  defaultValue?: string;
}

export interface TextPattern {
  field: string;
  regex: string;
  group?: number;
}

export interface TableParserConfig {
  headerRow: number | 'auto';
  dataStartRow: number | 'auto';
  dataEndRow?: number | 'auto';
  columns: ColumnMapping[];
  skipRows?: number[];
}

export interface MatrixParserConfig {
  headerRow: number;
  skuColumn: number;
  skuNameColumn?: number;
  skuCodeColumn?: number;
  storeColumns: { index: number; storeName: string }[];
  quantityTransform?: 'direct' | 'custom';
  // 新增：支持复合单元格拆分（周配送计划场景）
  compositeCellSplit?: {
    enabled: boolean;
    delimiter?: string;  // 分隔符，默认换行
    itemPattern?: string;  // 提取物品名和数量的正则，如 "(.+?)\s*[xX×]\s*(\d+)"
  };
}

// 新增：双重转置解析配置（周配送计划）
export interface DoubleMatrixParserConfig {
  // 第一行是日期/星期作为列头
  headerRow: number;
  // 第一列是门店作为行头
  firstColumnIsStore: boolean;
  // 物品提取正则：从单元格"物品名x数量\n物品名x数量"中提取
  itemPattern: string;  // 如 "(.+?)\s*[xX×]\s*(\d+)"
  // 日期格式
  dateFormat?: string;
  // 门店列索引
  storeColumnIndex: number;
  // 数据起始列
  dataStartColumn: number;
}

export interface CardParserConfig {
  cardStartPattern: string;
  // 新增：卡片结束标志（用于更准确地识别卡片边界）
  cardEndPattern?: string;
  cardFields: {
    field: string;
    pattern: string;
    group?: number;
  }[];
  itemTable?: {
    headerRowOffset: number;
    columns: ColumnMapping[];
  };
  // 新增：卡片内收货人信息提取配置
  recipientInCard?: {
    namePattern?: string;
    phonePattern?: string;
    addressPattern?: string;
  };
}

export interface TextParserConfig {
  patterns: TextPattern[];
  itemPatterns?: TextPattern[];
  // 新增：订单分隔符（用于Word/PDF多订单拆分）
  orderSeparator?: string;
}

export interface MultiSourceConfig {
  sourceType: 'sheet' | 'page';
  mergeStrategy: 'union' | 'append';
  filterSources?: string[];
  subRule: Omit<ParseRule, 'id' | 'name' | 'description' | 'fileTypes' | 'identifier'>;
  // 新增：订单分隔符（用于多Sheet/多页拆分）
  orderSeparator?: string;
}

export interface RecipientConfig {
  source: 'inline' | 'footer' | 'header' | 'separate';
  mode?: 'store' | 'receiver' | 'both';  // A组(门店) / B组(收件人) / 两组都填
  fields: {
    storeName?: string | { row: number; col: number } | { pattern: string }; // 收货门店
    name?: string | { row: number; col: number } | { pattern: string };
    phone?: string | { row: number; col: number } | { pattern: string };
    address?: string | { row: number; col: number } | { pattern: string };
  };
}

export interface RuleIdentifier {
  fileNamePattern?: string;
  sheetCount?: number;
  headerKeywords?: string[];
  structureSignature?: string;
  minRows?: number;
  minCols?: number;
}

export interface ParseRule {
  id?: string;
  name: string;
  description?: string;
  fileTypes: FileType[];
  identifier: RuleIdentifier;
  parser: {
    type: ParserType;
    table?: TableParserConfig;
    matrix?: MatrixParserConfig;
    card?: CardParserConfig;
    text?: TextParserConfig;
    multiSource?: MultiSourceConfig;
  };
  recipient?: RecipientConfig;
}

// 解析后的运单数据
export interface ParsedOrder {
  orderNo?: string;              // 外部编码（用于去重和聚合）

  // A组：门店模式（只需填收货门店）
  storeName?: string;            // 收货门店/机构名称

  // B组：收件人模式（需填以下三个）
  receiverName?: string;         // 收件人姓名
  receiverPhone?: string;        // 收件人联系方式
  receiverAddress?: string;      // 收件人完整地址

  // 发货方信息（可选）
  senderName?: string;
  senderPhone?: string;
  senderAddress?: string;

  // SKU 物品信息
  itemCode?: string;             // SKU 物品编码（必填）
  itemName?: string;             // SKU 物品名称（必填)
  itemCategory?: string;         // 物品分类
  specification?: string;        // SKU 规格型号
  quantity?: number;             // SKU 发货数量（必填，正数）
  unit?: string;

  remark?: string;               // 备注

  extraFields?: Record<string, any>;
  sourceRow?: number;
  sourceSheet?: string;
  isValid?: boolean;
  validationErrors?: string[];
}

// 解析结果
export interface ParseResult {
  success: boolean;
  orders: ParsedOrder[];
  totalRows: number;
  errorRows: number;
  errors?: string[];
  metadata?: {
    fileName: string;
    fileType: string;
    sheets?: string[];
    parseTime: number;
  };
}

// 规则匹配结果
export interface RuleMatchResult {
  rule: ParseRule;
  confidence: number;
  matchReasons: string[];
}
