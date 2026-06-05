import type { ParseRule } from '@/types/rule';

/**
 * 预设规则 - 黎明屯配送发货单（Excel，42列）
 */
export const rule_limingtu: ParseRule = {
  name: '黎明屯配送发货单',
  description: '42列，干扰头部+尾部散落收货人信息',
  fileTypes: ['excel'],
  identifier: {
    headerKeywords: ['物品分类', '物品编码', '物品名称', '规格型号'],
  },
  parser: {
    type: 'table',
    table: {
      headerRow: 3,
      dataStartRow: 4,
      dataEndRow: 6,
      columns: [
        { sourceIndex: 0, targetField: '序号', dataType: 'number' },
        { sourceIndex: 1, targetField: '物品分类', dataType: 'string' },
        { sourceIndex: 2, targetField: '物品编码', dataType: 'string' },
        { sourceIndex: 3, targetField: '物品名称', dataType: 'string' },
        { sourceIndex: 4, targetField: '规格型号', dataType: 'string' },
        { sourceIndex: 5, targetField: '单位', dataType: 'string' },
        { sourceIndex: 6, targetField: '数量', dataType: 'number' },
      ],
    },
  },
  recipient: {
    source: 'footer',
    fields: {
      name: { pattern: '收货人[：:]\\s*(.+?)(?:\\s|$)' },
      phone: { pattern: '(?:电话|手机)[：:]\\s*(\\d+)' },
      address: { pattern: '(?:地址|收货地址)[：:]\\s*(.+)' },
    },
  },
};

/**
 * 预设规则 - 湖南仓发货明细（Excel，32列167行）
 */
export const rule_hunan: ParseRule = {
  name: '湖南仓发货明细',
  description: '32列167行，按配送单号跨行聚合',
  fileTypes: ['excel'],
  identifier: {
    headerKeywords: ['配送单号', '收货人', '电话', '地址'],
  },
  parser: {
    type: 'table',
    table: {
      headerRow: 1,
      dataStartRow: 2,
      dataEndRow: 'auto',
      columns: [
        { sourceIndex: 0, targetField: '配送单号', dataType: 'string' },
        { sourceIndex: 1, targetField: '收货人', dataType: 'string' },
        { sourceIndex: 2, targetField: '电话', dataType: 'string' },
        { sourceIndex: 3, targetField: '地址', dataType: 'string' },
        { sourceIndex: 4, targetField: '物品编码', dataType: 'string' },
        { sourceIndex: 5, targetField: '物品名称', dataType: 'string' },
        { sourceIndex: 6, targetField: '规格型号', dataType: 'string' },
        { sourceIndex: 7, targetField: '单位', dataType: 'string' },
        { sourceIndex: 8, targetField: '数量', dataType: 'number' },
      ],
    },
  },
  recipient: {
    source: 'inline',
    fields: {},
  },
};

/**
 * 预设规则 - 欢乐牧场模板（Excel，SKU×门店矩阵）
 */
export const rule_huanle: ParseRule = {
  name: '欢乐牧场模板',
  description: 'SKU×门店矩阵，需矩阵转置',
  fileTypes: ['excel'],
  identifier: {
    headerKeywords: ['SKU名称', 'SKU条码', '银泰', '金银潭', '金桥'],
  },
  parser: {
    type: 'matrix',
    matrix: {
      headerRow: 0,
      skuColumn: 2,
      storeColumns: [
        { index: 13, storeName: '银泰' },
        { index: 14, storeName: '金银潭' },
        { index: 15, storeName: '金桥' },
        { index: 16, storeName: '门店B' },
        { index: 17, storeName: '门店D' },
      ],
    },
  },
};

/**
 * 预设规则 - 黔寨寨配送单（PDF，2页标准表格）
 */
export const rule_qianzhai: ParseRule = {
  name: '黔寨寨配送单',
  description: '2页，标准表格+底部签字区纯文本',
  fileTypes: ['pdf'],
  identifier: {
    headerKeywords: ['物品类别', '物品编码', '物品名称'],
  },
  parser: {
    type: 'table',
    table: {
      headerRow: 'auto',
      dataStartRow: 'auto',
      columns: [
        { sourceIndex: 0, targetField: '物品类别', dataType: 'string' },
        { sourceIndex: 1, targetField: '物品编码', dataType: 'string' },
        { sourceIndex: 2, targetField: '物品名称', dataType: 'string' },
        { sourceIndex: 3, targetField: '规格型号', dataType: 'string' },
        { sourceIndex: 4, targetField: '订货单位', dataType: 'string' },
        { sourceIndex: 5, targetField: '数量', dataType: 'number' },
      ],
    },
  },
  recipient: {
    source: 'footer',
    fields: {
      name: { pattern: '收货人[：:]\\s*(.+?)(?:\\s|$)' },
      phone: { pattern: '(?:电话|手机)[：:]\\s*(\\d+)' },
      address: { pattern: '(?:地址|收货地址)[：:]\\s*(.+)' },
    },
  },
};

/**
 * 预设规则 - 多门店分Sheet出库单（Excel，3个Sheet）
 */
export const rule_multi_sheet: ParseRule = {
  name: '多门店分Sheet出库单',
  description: '3个Sheet独立解析后合并',
  fileTypes: ['excel'],
  identifier: {
    sheetCount: 3,
    headerKeywords: ['序号', '物品编码', '物品名称', '出库数量'],
  },
  parser: {
    type: 'multi-sheet',
    multiSource: {
      sourceType: 'sheet',
      mergeStrategy: 'append',
      subRule: {
        parser: {
          type: 'table',
          table: {
            headerRow: 2,
            dataStartRow: 3,
            dataEndRow: 'auto',
            columns: [
              { sourceIndex: 0, targetField: '序号', dataType: 'number' },
              { sourceIndex: 1, targetField: '物品编码', dataType: 'string' },
              { sourceIndex: 2, targetField: '物品名称', dataType: 'string' },
              { sourceIndex: 3, targetField: '规格型号', dataType: 'string' },
              { sourceIndex: 4, targetField: '单位', dataType: 'string' },
              { sourceIndex: 5, targetField: '数量', dataType: 'number' },
            ],
          },
        },
      },
    },
  },
  recipient: {
    source: 'footer',
    fields: {
      name: { pattern: '收货人[：:]\\s*(.+?)(?:\\s|$)' },
      phone: { pattern: '(?:电话|手机)[：:]\\s*(\\d+)' },
      address: { pattern: '(?:地址|收货地址)[：:]\\s*(.+)' },
    },
  },
};

/**
 * 预设规则 - 门店调拨单-卡片式（Excel）
 */
export const rule_card: ParseRule = {
  name: '门店调拨单-卡片式',
  description: '非标准表格，按卡片边界识别拆分',
  fileTypes: ['excel'],
  identifier: {
    headerKeywords: ['调拨记录', '调入门店', '收货人'],
  },
  parser: {
    type: 'card',
    card: {
      cardStartPattern: '▶\\s*调拨记录\\s*#\\d+',
      cardFields: [
        { field: '调入门店', pattern: '调入门店[：:]\\s*(.+?)(?:\\s|$)' },
        { field: '收货人', pattern: '收货人[：:]\\s*(.+?)(?:\\s|$)' },
        { field: '电话', pattern: '(?:电话|手机)[：:]\\s*(\\d+)' },
        { field: '地址', pattern: '(?:地址|收货地址)[：:]\\s*(.+)' },
      ],
      itemTable: {
        headerRowOffset: 0,
        columns: [
          { sourceIndex: 0, targetField: '物品编码', dataType: 'string' },
          { sourceIndex: 1, targetField: '物品名称', dataType: 'string' },
          { sourceIndex: 2, targetField: '规格型号', dataType: 'string' },
          { sourceIndex: 3, targetField: '数量', dataType: 'number' },
        ],
      },
    },
  },
};

/**
 * 所有预设规则
 */
export const presetRules: ParseRule[] = [
  rule_limingtu,
  rule_hunan,
  rule_huanle,
  rule_qianzhai,
  rule_multi_sheet,
  rule_card,
];

/**
 * 根据文件名匹配预设规则
 */
export function matchPresetRule(fileName: string): ParseRule | null {
  const name = fileName.toLowerCase();
  
  if (name.includes('海口') || name.includes('黎明屯') || name.includes('配送发货单')) {
    return rule_limingtu;
  }
  if (name.includes('湖南仓')) {
    return rule_hunan;
  }
  if (name.includes('欢乐牧场')) {
    return rule_huanle;
  }
  if (name.includes('黔寨寨') || name.includes('烙锅')) {
    return rule_qianzhai;
  }
  if (name.includes('多门店') || name.includes('分sheet')) {
    return rule_multi_sheet;
  }
  if (name.includes('调拨') || name.includes('卡片')) {
    return rule_card;
  }
  
  return null;
}
