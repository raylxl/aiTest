// 规则引擎类型定义

export type FileType = 'excel' | 'pdf' | 'word' | 'csv';
export type ParserType = 'table' | 'matrix' | 'card' | 'text' | 'multi-sheet' | 'multi-page' | 'double-matrix';
export type DataType = 'string' | 'number' | 'date';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface InferenceMeta {
  confidence?: ConfidenceLevel;
  reason?: string;
  inferred?: boolean;
}

export interface ColumnMapping extends InferenceMeta {
  sourceIndex: number;
  targetField: string;
  dataType: DataType;
  transform?: string | string[];
  required?: boolean;
  defaultValue?: string;
  sourceIndexes?: number[];
  mergeStrategy?: 'firstNonEmpty' | 'concat' | 'sum';
  splitBy?: string;
}

export interface TextPattern extends InferenceMeta {
  field: string;
  regex: string;
  group?: number;
  allMatches?: boolean;
  transform?: string | string[];
}

export interface RowAggregateConfig {
  enabled: boolean;
  groupBy?: number[];
  joinWith?: string;
  continueWhenColumnsEmpty?: number[];
}

export interface TableParserConfig {
  headerRow: number | 'auto';
  dataStartRow: number | 'auto';
  dataEndRow?: number | 'auto';
  columns: ColumnMapping[];
  skipRows?: number[];
  stopWhenPatterns?: string[];
  rowAggregate?: RowAggregateConfig;
}

export interface CompositeCellSplitConfig extends InferenceMeta {
  enabled: boolean;
  delimiter?: string;
  itemPattern?: string;
  itemNameGroup?: number;
  quantityGroup?: number;
  itemCodeGroup?: number;
  specificationGroup?: number;
  unitGroup?: number;
}

export interface MatrixParserConfig {
  headerRow: number;
  skuColumn: number;
  skuNameColumn?: number;
  skuCodeColumn?: number;
  storeColumns: { index: number; storeName: string }[];
  quantityTransform?: 'direct' | 'custom';
  compositeCellSplit?: CompositeCellSplitConfig;
}

export interface DoubleMatrixParserConfig {
  headerRow: number;
  firstColumnIsStore: boolean;
  itemPattern: string;
  dateFormat?: string;
  storeColumnIndex: number;
  dataStartColumn: number;
}

export interface CardFieldConfig extends InferenceMeta {
  field: string;
  pattern: string;
  group?: number;
}

export interface CardParserConfig {
  cardStartPattern: string;
  cardEndPattern?: string;
  cardFields: CardFieldConfig[];
  itemTable?: {
    headerRowOffset: number;
    columns: ColumnMapping[];
    stopPatterns?: string[];
  };
  recipientInCard?: {
    namePattern?: string;
    phonePattern?: string;
    addressPattern?: string;
  };
}

export interface TextParserConfig {
  patterns: TextPattern[];
  itemPatterns?: TextPattern[];
  orderSeparator?: string;
  lineFilters?: string[];
  crossLineMerge?: {
    enabled: boolean;
    maxLookahead?: number;
    codePattern?: string;
  };
}

export interface RecipientPatternField extends InferenceMeta {
  pattern: string;
  group?: number;
}

export type RecipientFieldConfig =
  | string
  | { row: number; col: number }
  | RecipientPatternField;

export interface RecipientConfig {
  source: 'inline' | 'footer' | 'header' | 'separate';
  mode?: 'store' | 'receiver' | 'both';
  fields: {
    storeName?: RecipientFieldConfig;
    name?: RecipientFieldConfig;
    phone?: RecipientFieldConfig;
    address?: RecipientFieldConfig;
    receiverName?: RecipientFieldConfig;
    receiverPhone?: RecipientFieldConfig;
    receiverAddress?: RecipientFieldConfig;
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

export interface ParseSubRule {
  parser: {
    type: ParserType;
    table?: TableParserConfig;
    matrix?: MatrixParserConfig | DoubleMatrixParserConfig;
    card?: CardParserConfig;
    text?: TextParserConfig;
    multiSource?: MultiSourceConfig;
  };
  recipient?: RecipientConfig;
}

export interface MultiSourceConfig {
  sourceType: 'sheet' | 'page';
  mergeStrategy: 'union' | 'append';
  filterSources?: string[];
  subRule: ParseSubRule;
  orderSeparator?: string;
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
    matrix?: MatrixParserConfig | DoubleMatrixParserConfig;
    card?: CardParserConfig;
    text?: TextParserConfig;
    multiSource?: MultiSourceConfig;
  };
  recipient?: RecipientConfig;
  hasInferredFields?: boolean;
  inferredFields?: string[];
}

// 解析后的运单数据
export interface ParsedOrder {
  orderNo?: string;

  // A组：门店模式（只需填收货门店）
  storeName?: string;

  // B组：收件人模式（需填以下三个）
  receiverName?: string;
  receiverPhone?: string;
  receiverAddress?: string;

  // 发货方信息（可选）
  senderName?: string;
  senderPhone?: string;
  senderAddress?: string;

  // SKU 物品信息
  itemCode?: string;
  itemName?: string;
  itemCategory?: string;
  specification?: string;
  quantity?: number;
  unit?: string;

  remark?: string;

  // 元数据字段
  extraFields?: Record<string, any>;
  sourceFile?: string;      // 来源文件名
  sourceRow?: number;       // 来源行号
  sourceSheet?: string;     // 来源 Sheet 名

  // 校验相关
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
