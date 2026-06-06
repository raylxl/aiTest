/**
 * 统一规则结构校验器
 * 用于替代 deepseek.ts 的简陋 validateRule 和 parse/route.ts 的内联校验
 */

import type { ParseRule, ParserType } from '@/types/rule';

// 合法的解析类型枚举
const VALID_PARSER_TYPES: ParserType[] = [
  'table',
  'matrix',
  'double-matrix',
  'card',
  'text',
  'multi-sheet',
  'multi-page',
];

// 校验错误结构
export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

// 校验结果
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * 校验规则结构完整性
 * @param rule 待校验的规则对象
 * @returns 校验结果
 */
export function validateParseRule(rule: any): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // 基础存在性检查
  if (!rule || typeof rule !== 'object') {
    errors.push({ field: 'root', message: '规则必须是一个对象', severity: 'error' });
    return { valid: false, errors, warnings };
  }

  // name 字段
  if (!rule.name) {
    errors.push({ field: 'name', message: '规则缺少 name 字段', severity: 'error' });
  } else if (typeof rule.name !== 'string') {
    errors.push({ field: 'name', message: 'name 必须是字符串', severity: 'error' });
  }

  // description（可选）
  if (rule.description && typeof rule.description !== 'string') {
    warnings.push({ field: 'description', message: 'description 应为字符串', severity: 'warning' });
  }

  // fileTypes（可选，但如果有则校验）
  if (rule.fileTypes) {
    if (!Array.isArray(rule.fileTypes)) {
      warnings.push({ field: 'fileTypes', message: 'fileTypes 应为数组', severity: 'warning' });
    } else {
      const validFileTypes = ['excel', 'pdf', 'word', 'csv'];
      const invalidTypes = rule.fileTypes.filter((t: any) => !validFileTypes.includes(t));
      if (invalidTypes.length > 0) {
        warnings.push({
          field: 'fileTypes',
          message: `包含无效的文件类型: ${invalidTypes.join(', ')}`,
          severity: 'warning',
        });
      }
    }
  }

  // parser 对象
  if (!rule.parser || typeof rule.parser !== 'object') {
    errors.push({ field: 'parser', message: '规则缺少 parser 配置', severity: 'error' });
    return { valid: false, errors, warnings };
  }

  // parser.type
  if (!rule.parser.type) {
    errors.push({ field: 'parser.type', message: 'parser 缺少 type 字段', severity: 'error' });
    return { valid: false, errors, warnings };
  }

  if (!VALID_PARSER_TYPES.includes(rule.parser.type)) {
    errors.push({
      field: 'parser.type',
      message: `无效的解析类型: ${rule.parser.type}，合法值为: ${VALID_PARSER_TYPES.join(', ')}`,
      severity: 'error',
    });
    return { valid: false, errors, warnings };
  }

  // 根据 type 校验对应配置块
  const parserType = rule.parser.type;
  switch (parserType) {
    case 'table':
      validateTableConfig(rule.parser.table, errors, warnings);
      break;
    case 'matrix':
    case 'double-matrix':
      validateMatrixConfig(rule.parser.matrix, parserType, errors, warnings);
      break;
    case 'card':
      validateCardConfig(rule.parser.card, errors, warnings);
      break;
    case 'text':
      validateTextConfig(rule.parser.text, errors, warnings);
      break;
    case 'multi-sheet':
    case 'multi-page':
      validateMultiSourceConfig(rule.parser.multiSource, parserType, errors, warnings);
      break;
  }

  // recipient 校验（可选）
  if (rule.recipient) {
    validateRecipientConfig(rule.recipient, warnings);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 校验 table 配置
 */
function validateTableConfig(table: any, errors: ValidationError[], warnings: ValidationError[]): void {
  if (!table || typeof table !== 'object') {
    errors.push({ field: 'parser.table', message: 'table 模式缺少 table 配置', severity: 'error' });
    return;
  }

  // headerRow
  if (table.headerRow !== undefined && typeof table.headerRow !== 'number') {
    warnings.push({ field: 'parser.table.headerRow', message: 'headerRow 应为数字', severity: 'warning' });
  }

  // dataStartRow
  if (table.dataStartRow !== undefined && typeof table.dataStartRow !== 'number') {
    warnings.push({ field: 'parser.table.dataStartRow', message: 'dataStartRow 应为数字', severity: 'warning' });
  }

  // columns
  if (!table.columns || !Array.isArray(table.columns)) {
    errors.push({ field: 'parser.table.columns', message: 'table 缺少 columns 配置', severity: 'error' });
  } else if (table.columns.length === 0) {
    // 空 columns 允许——引擎会自动检测列
    warnings.push({ field: 'parser.table.columns', message: 'columns 为空，将由引擎自动检测列结构', severity: 'warning' });
  } else {
    // 校验每个 column
    table.columns.forEach((col: any, index: number) => {
      const fieldPrefix = `parser.table.columns[${index}]`;
      if (!col || typeof col !== 'object') {
        errors.push({ field: fieldPrefix, message: '列配置必须是对象', severity: 'error' });
        return;
      }
      if (col.sourceIndex === undefined && !col.sourceIndexes) {
        warnings.push({ field: fieldPrefix, message: '建议指定 sourceIndex 或 sourceIndexes', severity: 'warning' });
      }
      if (!col.targetField) {
        errors.push({ field: `${fieldPrefix}.targetField`, message: '缺少 targetField', severity: 'error' });
      }
    });
  }
}

/**
 * 校验 matrix 配置
 */
function validateMatrixConfig(
  matrix: any,
  type: 'matrix' | 'double-matrix',
  errors: ValidationError[],
  warnings: ValidationError[]
): void {
  if (!matrix || typeof matrix !== 'object') {
    errors.push({ field: 'parser.matrix', message: `${type} 模式缺少 matrix 配置`, severity: 'error' });
    return;
  }

  if (type === 'matrix') {
    // matrix 模式需要 storeColumns（允许为空数组表示自动检测所有列）
    if (!matrix.storeColumns || !Array.isArray(matrix.storeColumns)) {
      warnings.push({ field: 'parser.matrix.storeColumns', message: 'matrix 缺少 storeColumns，将自动检测门店列', severity: 'warning' });
    }
  }

  if (type === 'double-matrix') {
    // double-matrix 需要 itemPattern
    if (!matrix.itemPattern) {
      warnings.push({ field: 'parser.matrix.itemPattern', message: '建议指定 itemPattern 用于解析单元格内容', severity: 'warning' });
    }
  }
}

/**
 * 校验 card 配置
 */
function validateCardConfig(card: any, errors: ValidationError[], warnings: ValidationError[]): void {
  if (!card || typeof card !== 'object') {
    errors.push({ field: 'parser.card', message: 'card 模式缺少 card 配置', severity: 'error' });
    return;
  }

  if (!card.cardStartPattern) {
    warnings.push({ field: 'parser.card.cardStartPattern', message: '建议指定 cardStartPattern 用于识别卡片起始位置', severity: 'warning' });
  }

  if (!card.cardFields || !Array.isArray(card.cardFields)) {
    errors.push({ field: 'parser.card.cardFields', message: 'card 缺少 cardFields 配置', severity: 'error' });
  } else if (card.cardFields.length === 0) {
    warnings.push({ field: 'parser.card.cardFields', message: 'cardFields 为空，建议补充卡片字段配置', severity: 'warning' });
  }
}

/**
 * 校验 text 配置
 */
function validateTextConfig(text: any, errors: ValidationError[], warnings: ValidationError[]): void {
  if (!text || typeof text !== 'object') {
    errors.push({ field: 'parser.text', message: 'text 模式缺少 text 配置', severity: 'error' });
    return;
  }

  if (!text.patterns || !Array.isArray(text.patterns)) {
    errors.push({ field: 'parser.text.patterns', message: 'text 缺少 patterns 配置', severity: 'error' });
  } else if (text.patterns.length === 0) {
    warnings.push({ field: 'parser.text.patterns', message: 'patterns 为空，建议补充正则模式以提取字段', severity: 'warning' });
  } else {
    // 校验每个 pattern
    text.patterns.forEach((p: any, index: number) => {
      const fieldPrefix = `parser.text.patterns[${index}]`;
      if (!p || typeof p !== 'object') {
        errors.push({ field: fieldPrefix, message: 'pattern 配置必须是对象', severity: 'error' });
        return;
      }
      if (!p.regex) {
        errors.push({ field: `${fieldPrefix}.regex`, message: '缺少 regex', severity: 'error' });
      }
      if (!p.field) {
        errors.push({ field: `${fieldPrefix}.field`, message: '缺少 field', severity: 'error' });
      }
    });
  }
}

/**
 * 校验 multiSource 配置
 */
function validateMultiSourceConfig(
  multiSource: any,
  type: 'multi-sheet' | 'multi-page',
  errors: ValidationError[],
  warnings: ValidationError[]
): void {
  if (!multiSource || typeof multiSource !== 'object') {
    errors.push({ field: 'parser.multiSource', message: `${type} 模式缺少 multiSource 配置`, severity: 'error' });
    return;
  }

  if (!multiSource.subRule) {
    errors.push({ field: 'parser.multiSource.subRule', message: '缺少 subRule 子规则配置', severity: 'error' });
  } else {
    // 递归校验 subRule 的 parser
    if (multiSource.subRule.parser) {
      const subType = multiSource.subRule.parser.type;
      if (subType === 'table') {
        validateTableConfig(multiSource.subRule.parser.table, errors, warnings);
      } else if (subType === 'matrix' || subType === 'double-matrix') {
        validateMatrixConfig(multiSource.subRule.parser.matrix, subType, errors, warnings);
      }
    }
  }
}

/**
 * 校验 recipient 配置（可选，仅警告）
 */
function validateRecipientConfig(recipient: any, warnings: ValidationError[]): void {
  if (!recipient || typeof recipient !== 'object') {
    warnings.push({ field: 'recipient', message: 'recipient 配置格式异常', severity: 'warning' });
    return;
  }

  const validSources = ['header', 'footer', 'inline', 'separate'];
  if (recipient.source && !validSources.includes(recipient.source)) {
    warnings.push({
      field: 'recipient.source',
      message: `无效的 source 值: ${recipient.source}，合法值为: ${validSources.join(', ')}`,
      severity: 'warning',
    });
  }

  if (!recipient.fields || typeof recipient.fields !== 'object') {
    warnings.push({ field: 'recipient.fields', message: '建议指定 fields 配置', severity: 'warning' });
  }
}

/**
 * 格式化校验结果为用户友好的错误消息
 */
export function formatValidationErrors(result: ValidationResult): string {
  if (result.valid && result.warnings.length === 0) {
    return '规则校验通过';
  }

  const lines: string[] = [];

  if (result.errors.length > 0) {
    lines.push('❌ 错误:');
    result.errors.forEach(err => {
      lines.push(`  • [${err.field}] ${err.message}`);
    });
  }

  if (result.warnings.length > 0) {
    lines.push('⚠️ 警告:');
    result.warnings.forEach(warn => {
      lines.push(`  • [${warn.field}] ${warn.message}`);
    });
  }

  return lines.join('\n');
}
