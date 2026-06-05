// 规则引擎类型定义

export type FileType = 'excel' | 'pdf' | 'word' | 'csv';
export type ParserType = 'table' | 'matrix' | 'card' | 'text' | 'multi-sheet' | 'multi-page';
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
}

export interface CardParserConfig {
  cardStartPattern: string;
  cardFields: {
    field: string;
    pattern: string;
    group?: number;
  }[];
  itemTable?: {
    headerRowOffset: number;
    columns: ColumnMapping[];
  };
}

export interface TextParserConfig {
  patterns: TextPattern[];
  itemPatterns?: TextPattern[];
}

export interface MultiSourceConfig {
  sourceType: 'sheet' | 'page';
  mergeStrategy: 'union' | 'append';
  filterSources?: string[];
  subRule: Omit<ParseRule, 'id' | 'name' | 'description' | 'fileTypes' | 'identifier'>;
}

export interface RecipientConfig {
  source: 'inline' | 'footer' | 'header' | 'separate';
  fields: {
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
  orderNo?: string;
  senderName?: string;
  senderPhone?: string;
  senderAddress?: string;
  receiverName?: string;
  receiverPhone?: string;
  receiverAddress?: string;
  itemName?: string;
  itemCode?: string;
  itemCategory?: string;
  specification?: string;
  quantity?: number;
  unit?: string;
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
