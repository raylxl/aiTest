import type { ParseRule, ParsedOrder, ParseResult, FileType, ColumnMapping, TableParserConfig } from '@/types/rule';
import { parseExcelFile, parseTable, parseMatrix, parseCards, parseDoubleMatrix } from './excel-parser';
import { parsePDFFile, parsePDFTable, parsePDFText, parsePDFMultiPage } from './pdf-parser';
import { parseWordFile, parseWordText } from './word-parser';

/**
 * 规则引擎核心
 * 根据规则解析各种格式的文件
 */
export class ParseEngine {
  /**
   * 解析文件
   */
  async parseFile(
    file: File | ArrayBuffer,
    fileName: string,
    rule: ParseRule
  ): Promise<ParseResult> {
    const startTime = Date.now();
    const fileType = this.detectFileType(fileName);
    
    try {
      let buffer: ArrayBuffer;
      if (file instanceof File) {
        buffer = await file.arrayBuffer();
      } else {
        buffer = file;
      }

      let orders: ParsedOrder[] = [];

      switch (fileType) {
        case 'excel':
          orders = await this.parseExcel(buffer, rule);
          break;
        case 'pdf':
          orders = await this.parsePDF(buffer, rule);
          break;
        case 'word':
          orders = await this.parseWord(buffer, rule);
          break;
        case 'csv':
          orders = await this.parseCSV(buffer, rule);
          break;
        default:
          throw new Error(`不支持的文件类型: ${fileType}`);
      }

      // 数据校验
      const validatedOrders = this.validateOrders(orders);
      const errorRows = validatedOrders.filter(o => !o.isValid).length;

      return {
        success: true,
        orders: validatedOrders,
        totalRows: validatedOrders.length,
        errorRows,
        metadata: {
          fileName,
          fileType,
          parseTime: Date.now() - startTime,
        },
      };
    } catch (error) {
      return {
        success: false,
        orders: [],
        totalRows: 0,
        errorRows: 0,
        errors: [error instanceof Error ? error.message : '解析失败'],
        metadata: {
          fileName,
          fileType,
          parseTime: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * 检测文件类型
   */
  detectFileType(fileName: string): FileType {
    const ext = fileName.toLowerCase().split('.').pop();
    switch (ext) {
      case 'xlsx':
      case 'xls':
      case 'xlsm':
        return 'excel';
      case 'pdf':
        return 'pdf';
      case 'docx':
      case 'doc':
        return 'word';
      case 'csv':
        return 'csv';
      default:
        throw new Error(`未知文件类型: ${ext}`);
    }
  }

  /**
   * 解析Excel文件
   */
  private async parseExcel(buffer: ArrayBuffer, rule: ParseRule): Promise<ParsedOrder[]> {
    const excelData = await parseExcelFile(buffer);
    
    // 多Sheet模式
    if (rule.parser.type === 'multi-sheet') {
      if (rule.parser.multiSource) {
        return this.parseMultiSheet(excelData, rule);
      }
      // 如果没有multiSource配置，但有table配置，对所有Sheet应用table规则
      if (rule.parser.table) {
        return this.parseAllSheets(excelData, rule);
      }
      // 如果没有任何配置，尝试用默认table配置解析所有Sheet
      const defaultTableConfig: TableParserConfig = {
        headerRow: 'auto',
        dataStartRow: 'auto',
        columns: []
      };
      const tempRule = { ...rule, parser: { ...rule.parser, table: defaultTableConfig } };
      return this.parseAllSheets(excelData, tempRule);
    }

    // 单Sheet模式
    const sheet = excelData.sheets[0];
    if (!sheet) throw new Error('Excel文件没有Sheet');

    const parserType = rule.parser.type as string;
    switch (parserType) {
      case 'table': {
        // 如果columns为空，自动检测列配置
        let tableConfig = rule.parser.table!;
        if (!tableConfig.columns || tableConfig.columns.length === 0) {
          // 先检测是否是卡片式布局，如果是则自动切换到card模式
          if (this.detectCardLayoutFromData(sheet.data)) {
            return this.parseCardAuto(sheet.data);
          }
          // 检测是否是矩阵模式（门店在列头，如"银泰|金桥|金银潭"）
          const matrixConfig = this.detectMatrixFromData(sheet.data);
          if (matrixConfig) {
            return parseMatrix(sheet.data, matrixConfig);
          }
          tableConfig = this.autoDetectColumns(sheet.data, tableConfig);
        } else {
          // 检查是否缺少关键必填字段，自动补充
          tableConfig = this.mergeMissingColumns(sheet.data, tableConfig);
        }
        
        // 自动检测dataEndRow：在"合计"行后停止（避免footer元数据行被当数据行）
        if (tableConfig.dataEndRow === undefined || tableConfig.dataEndRow === 'auto') {
          const headerRow = typeof tableConfig.headerRow === 'number' ? tableConfig.headerRow : 0;
          const dataStartRow = typeof tableConfig.dataStartRow === 'number' ? tableConfig.dataStartRow : headerRow + 1;
          for (let i = dataStartRow; i < sheet.data.length; i++) {
            const row = sheet.data[i];
            if (!row) continue;
            const firstCell = String(row[0] || '').trim();
            // 合计/总计行之后都是footer区域
            if (firstCell === '合计' || firstCell === '总计') {
              tableConfig = { ...tableConfig, dataEndRow: i };
              break;
            }
          }
        }
        
        // 从header区域（表头行之前）提取收货人/门店信息
        const headerRecipient = this.extractHeaderAreaRecipient(sheet.data, 
          typeof tableConfig.headerRow === 'number' ? tableConfig.headerRow : 0);
        
        // 构建recipient配置（如果没有提供的话）
        let effectiveRecipient = rule.recipient;
        if (!effectiveRecipient && Object.keys(headerRecipient).length > 0) {
          effectiveRecipient = {
            source: 'header',
            fields: headerRecipient,
          } as any;
        }
        
        return parseTable(sheet.data, tableConfig, effectiveRecipient);
      }
      case 'matrix':
        return parseMatrix(sheet.data, rule.parser.matrix!);
      case 'card': {
        // 如果card配置存在，直接使用；否则自动检测
        if (rule.parser.card) {
          return parseCards(sheet.data, rule.parser.card);
        }
        return this.parseCardAuto(sheet.data);
      }
      case 'double-matrix':
        // 双重转置：周配送计划格式 (门店x日期矩阵 + 复合单元格拆分)
        if (rule.parser.matrix) {
          return parseDoubleMatrix(sheet.data, rule.parser.matrix as any);
        }
        throw new Error('double-matrix模式需要配置matrix规则');
      case 'multi-sheet':
        // multi-sheet但没有配置，尝试用table模式解析第一个sheet
        if (rule.parser.table) {
          return parseTable(sheet.data, rule.parser.table, rule.recipient);
        }
        throw new Error('multi-sheet模式需要配置multiSource或table规则');
      default:
        throw new Error(`Excel不支持的解析模式: ${parserType}`);
    }
  }

  /**
   * 解析多Sheet Excel（使用multiSource配置）
   */
  private parseMultiSheet(excelData: any, rule: ParseRule): ParsedOrder[] {
    const orders: ParsedOrder[] = [];
    const config = rule.parser.multiSource!;
    
    for (const sheet of excelData.sheets) {
      // 过滤指定Sheet
      if (config.filterSources && !config.filterSources.includes(sheet.name)) {
        continue;
      }

      const subRule = config.subRule;
      let sheetOrders: ParsedOrder[] = [];

      if (subRule.parser.type === 'table' && subRule.parser.table) {
        sheetOrders = parseTable(sheet.data, subRule.parser.table, rule.recipient);
      } else if (subRule.parser.type === 'matrix' && subRule.parser.matrix) {
        sheetOrders = parseMatrix(sheet.data, subRule.parser.matrix);
      } else if (subRule.parser.type === 'card' && subRule.parser.card) {
        sheetOrders = parseCards(sheet.data, subRule.parser.card);
      }

      // 添加Sheet来源信息
      for (const order of sheetOrders) {
        order.sourceSheet = sheet.name;
      }

      orders.push(...sheetOrders);
    }

    return orders;
  }

  /**
   * 解析所有Sheet（使用同一个table规则）
   */
  private parseAllSheets(excelData: any, rule: ParseRule): ParsedOrder[] {
    const orders: ParsedOrder[] = [];
    const tableConfig = rule.parser.table!;
    
    for (const sheet of excelData.sheets) {
      // 跳过空Sheet
      if (!sheet.data || sheet.data.length === 0) continue;

      try {
        // 如果columns为空，自动检测列
        let config = tableConfig;
        if (!config.columns || config.columns.length === 0) {
          config = this.autoDetectColumns(sheet.data, config);
        }
        
        const sheetOrders = parseTable(sheet.data, config, rule.recipient);
        
        // 添加Sheet来源信息 + 补全storeName
        const sheetStoreName = sheetOrders[0]?.storeName || 
                              (rule.recipient?.source === 'header' ? undefined : sheet.name);
        for (const order of sheetOrders) {
          order.sourceSheet = sheet.name;
          if (!order.storeName && sheetStoreName) {
            order.storeName = sheetStoreName;
          }
        }

        orders.push(...sheetOrders);
      } catch (e) {
        // 单个Sheet解析失败不影响其他Sheet
        console.warn(`Sheet "${sheet.name}" 解析失败:`, e);
      }
    }

    return orders;
  }

  /**
   * 自动检测列配置
   */
  private autoDetectColumns(data: any[][], baseConfig: TableParserConfig): TableParserConfig {
    if (!data || data.length < 2) return baseConfig;
    
    // 智能查找表头行：跳过标题行（单元格内容很长、通常是文档标题），找到真正的列标题行
    const fieldNameKeywords = ['单号', '编码', '名称', '数量', '门店', '收货', '电话', '地址', '规格', '单位', '日期', '序号', '分类', '备注', '仓库', '品牌'];
    let headerRow = 0;
    let bestScore = 0;
    
    for (let i = 0; i < Math.min(data.length, 15); i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;
      
      // 检查是否有非空单元格
      const nonEmptyCells = row.filter((cell: any) => cell !== null && cell !== undefined && String(cell).trim() !== '');
      if (nonEmptyCells.length === 0) continue;
      
      // 评分：匹配到的关键词越多，列数越多（至少3列），越可能是表头
      let score = 0;
      let longCellCount = 0;
      let shortCellCount = 0;
      for (const cell of nonEmptyCells) {
        const cellStr = String(cell).trim();
        const len = cellStr.length;
        // 极长文本（>30字符）很可能是标题或说明，大幅扣分
        if (len > 30) { longCellCount++; continue; }
        // 中等文本（15-30字符）可能是值字段内容，轻微扣分
        if (len > 15) { score -= 1; continue; }
        // 短文本（≤15字符）是表头关键词的典型长度
        shortCellCount++;
        for (const kw of fieldNameKeywords) {
          if (cellStr.includes(kw)) score += 3;
        }
      }
      
      // 加分：列数多（表格特征）
      if (nonEmptyCells.length >= 3) score += 5;
      if (nonEmptyCells.length >= 5) score += 5;
      
      // 扣分：有长文本单元格（标题/说明行）
      score -= longCellCount * 5;
      
      // 扣分：如果长单元格占比过高，这是header info区域而非列标题
      if (longCellCount > shortCellCount) score -= 10;
      
      if (score > bestScore) {
        bestScore = score;
        headerRow = i;
      }
    }
    
    const headerRowData = data[headerRow];
    if (!headerRowData) return baseConfig;
    
    // 自动检测列映射 — 使用最长关键词优先匹配，避免「SKU条码」被误匹配为itemName
    const columns: ColumnMapping[] = [];
    const fieldNameMapEntries: [string, string][] = [
      ['配送汇总单号', 'orderNo'], ['配送单号', 'orderNo'], ['运单号', 'orderNo'], ['订单号', 'orderNo'],
      ['外部订单号', 'orderNo'], ['客户单号', 'orderNo'], ['参考编码', 'orderNo'],
      ['单据号', 'orderNo'], ['单号', 'orderNo'], ['外部编码', 'orderNo'],
      ['收货门店', 'storeName'], ['收货机构', 'storeName'],
      ['门店', 'storeName'], ['店铺', 'storeName'], ['机构', 'storeName'],
      ['收货人', 'receiverName'], ['收件人', 'receiverName'],
      ['联系电话', 'receiverPhone'], ['收货人电话', 'receiverPhone'],
      ['电话', 'receiverPhone'], ['手机', 'receiverPhone'],
      ['收货地址', 'receiverAddress'], ['收件地址', 'receiverAddress'],
      ['详细地址', 'receiverAddress'], ['地址', 'receiverAddress'],
      ['物品编码', 'itemCode'], ['商品编码', 'itemCode'],
      ['SKU编码', 'itemCode'], ['SKU条码', 'itemCode'], ['SKU码', 'itemCode'],
      ['条码', 'itemCode'], ['编码', 'itemCode'],
      ['物品名称', 'itemName'], ['商品名称', 'itemName'],
      ['货品名称', 'itemName'], ['SKU名称', 'itemName'],
      ['名称', 'itemName'], ['品名', 'itemName'],
      ['物品', 'itemName'], ['商品', 'itemName'], ['货品', 'itemName'],
      ['SKU', 'itemName'],
      ['规格型号', 'specification'],
      ['规格', 'specification'], ['型号', 'specification'],
      ['发货数量', 'quantity'], ['出库数量', 'quantity'],
      ['订货数量', 'quantity'], ['数量', 'quantity'],
      ['订货单位', 'unit'], ['发货单位', 'unit'], ['辅助单位', 'unit'],
      ['单位', 'unit'],
      ['物品分类', 'itemCategory'], ['分类', 'itemCategory'],
      ['物品品牌', 'itemCategory'], ['品牌', 'itemCategory'],
      ['物品行号', 'itemCategory'], ['行号', 'itemCategory'],
      ['仓库', 'itemCategory'], ['备注', 'remark'],
    ];
    
    for (let i = 0; i < headerRowData.length; i++) {
      const cell = String(headerRowData[i] || '').trim();
      if (!cell) continue;
      
      // 去掉必填标记（*号）再匹配
      const cellClean = cell.replace(/\*+$/, '').replace(/（必填）$/, '').trim();
      
      // 排除"备注"类列——"物品备注"、"收货机构备注"不应匹配到"物品"→itemName、"收货机构"→storeName
      if (/备注$/.test(cellClean)) {
        columns.push({ sourceIndex: i, targetField: 'remark', dataType: 'string' });
        continue;
      }
      
      // 排除"物品X"类非目标列——"物品重量"、"物品体积"、"物品品牌"包含"物品"但不是物品名称
      // 同理排除"收货X"非目标列——"收货机构"、"收货日期"不应匹配到"收货"→receiverName
      // 同理排除"数量X"非目标列——"原订货数量"、"接单数量"等派生数量列
      const excludePatterns: [RegExp, string][] = [
        [/^物品(?!名称|编码|分类|行号)/, 'itemName'],  // 物品重量/体积/品牌 → 不是itemName
        [/重量$|体积$|金额$|单价$|折扣|费用/, 'skip'],  // 重量/体积/金额/单价/折扣/费用 → 跳过
        [/收货(?!人|门店|机构|地址|电话|电话)/, 'skip'], // 收货日期/收货方式 → 跳过(但保留收货人/收货门店)
        [/^分拣/, 'skip'],   // 分拣员/分拣状态/分拣单位 → 跳过
        [/^基准/, 'skip'],   // 基准单位/基准数量 → 跳过
        [/^折[前后]/, 'skip'], // 折前/折后 → 跳过
        [/^合计/, 'skip'],   // 合计金额/合计单价 → 跳过
        [/^成本/, 'skip'],   // 成本单价/成本金额 → 跳过
        [/^支付/, 'skip'],   // 支付折扣 → 跳过
        [/^促销/, 'skip'],   // 促销折扣 → 跳过
        [/^手动/, 'skip'],   // 手动折扣 → 跳过
        [/换算率?$/, 'skip'], // 换算率/换算关系 → 跳过
        [/^创建/, 'skip'],   // 创建人/创建日期 → 跳过
        [/换算关系$/, 'skip'], // 辅助单位换算关系 → 跳过
      ];
      
      let shouldExclude = false;
      for (const [pattern, reason] of excludePatterns) {
        if (pattern.test(cellClean)) {
          shouldExclude = true;
          break;
        }
      }
      if (shouldExclude) continue;
      
      // 查找匹配的字段名（最长匹配优先）
      let bestMatch = '';
      let bestField = '';
      for (const [keyword, field] of fieldNameMapEntries) {
        if ((cellClean.includes(keyword) || cell.includes(keyword)) && keyword.length > bestMatch.length) {
          bestMatch = keyword;
          bestField = field;
        }
      }
      
      if (bestField) {
        const dataType = bestField === 'quantity' ? 'number' : 'string';
        columns.push({ sourceIndex: i, targetField: bestField, dataType });
      }
    }
    
    return {
      ...baseConfig,
      headerRow,
      dataStartRow: headerRow + 1,
      columns,
    };
  }

  /**
   * 测试用：获取autoDetectColumns的映射结果
   */
  public testAutoDetect(data: any[][]): { headerRow: number; columns: ColumnMapping[] } {
    const config = this.autoDetectColumns(data, { headerRow: 'auto', dataStartRow: 'auto', columns: [] });
    return { headerRow: config.headerRow as number, columns: config.columns };
  }

  /**
   * 合并缺失的关键字段：如果AI规则缺少必填字段，自动从表头补充
   * 解决AI提示词缺少storeName等问题时的兜底
   */
  private mergeMissingColumns(data: any[][], tableConfig: TableParserConfig): TableParserConfig {
    if (!tableConfig.columns || tableConfig.columns.length === 0) return tableConfig;
    
    const headerRow = typeof tableConfig.headerRow === 'number' ? tableConfig.headerRow : 0;
    const headerRowData = data[headerRow];
    if (!headerRowData) return tableConfig;

    const existingFields = new Set(tableConfig.columns.map((c: any) => c.targetField));
    const newColumns = [...tableConfig.columns];
    let hasNew = false;

    // 检查A/B组必填字段
    const hasGroupA = existingFields.has('storeName');
    const hasGroupB = existingFields.has('receiverName') && existingFields.has('receiverPhone') && existingFields.has('receiverAddress');

    // 如果两组都缺失，且表头中有未映射的列，尝试匹配
    if (!hasGroupA && !hasGroupB) {
      for (let i = 0; i < headerRowData.length; i++) {
        const cell = String(headerRowData[i] || '').trim();
        if (!cell) continue;
        // 检查这个列是否已经被映射
        if (tableConfig.columns.some((c: any) => c.sourceIndex === i)) continue;

        if (/门店|机构|店铺|收货门店|配送门店/.test(cell)) {
          newColumns.push({ sourceIndex: i, targetField: 'storeName', dataType: 'string' });
          existingFields.add('storeName');
          hasNew = true;
          console.log(`[mergeMissingColumns] 自动补充 storeName ← 列${i} "表头:${cell}"`);
        } else if (/收货人|收件人|联系人/.test(cell) && !existingFields.has('receiverName')) {
          newColumns.push({ sourceIndex: i, targetField: 'receiverName', dataType: 'string' });
          existingFields.add('receiverName');
          hasNew = true;
        } else if (/电话|手机|联系方式/.test(cell) && !existingFields.has('receiverPhone')) {
          newColumns.push({ sourceIndex: i, targetField: 'receiverPhone', dataType: 'string' });
          existingFields.add('receiverPhone');
          hasNew = true;
        } else if (/地址/.test(cell) && !existingFields.has('receiverAddress')) {
          newColumns.push({ sourceIndex: i, targetField: 'receiverAddress', dataType: 'string' });
          existingFields.add('receiverAddress');
          hasNew = true;
        }
      }
    }

    // 补充其他必填字段
    const requiredFields = [
      { field: 'itemCode', patterns: [/编码|条码|SKU码|item.?code/i] },
      { field: 'itemName', patterns: [/名称|品名|货品|商品|item.?name/i] },
      { field: 'quantity', patterns: [/数量|件数|发货|qty|count/i] },
    ];

    for (const required of requiredFields) {
      if (existingFields.has(required.field)) continue;
      for (let i = 0; i < headerRowData.length; i++) {
        const cell = String(headerRowData[i] || '').trim();
        if (!cell) continue;
        if (tableConfig.columns.some((c: any) => c.sourceIndex === i)) continue;
        if (required.patterns.some(p => p.test(cell))) {
          const dataType = required.field === 'quantity' ? 'number' : 'string';
          newColumns.push({ sourceIndex: i, targetField: required.field, dataType });
          existingFields.add(required.field);
          hasNew = true;
          console.log(`[mergeMissingColumns] 自动补充 ${required.field} ← 列${i} "表头:${cell}"`);
          break;
        }
      }
    }

    if (!hasNew) return tableConfig;
    return { ...tableConfig, columns: newColumns };
  }

  /**
   * 解析PDF文件
   */
  private async parsePDF(buffer: ArrayBuffer, rule: ParseRule): Promise<ParsedOrder[]> {
    const pdfData = await parsePDFFile(buffer);

    switch (rule.parser.type) {
      case 'table': {
        const tableOrders = parsePDFTable(pdfData.pages, rule.parser.table!, rule.recipient);
        // 如果table模式提取不到数据，尝试text模式作为fallback
        if (tableOrders.length === 0 && rule.recipient) {
          // 从recipient配置生成text规则
          const textConfig = this.generateTextConfigFromRecipient(rule.recipient);
          const textOrders = parsePDFText(pdfData.pages, textConfig);
          if (textOrders.length > 0) return textOrders;
        }
        return tableOrders;
      }
      case 'text':
        return parsePDFText(pdfData.pages, rule.parser.text!);
      case 'multi-page':
        return parsePDFMultiPage(pdfData.pages, rule.parser.multiSource!);
      default:
        throw new Error(`PDF不支持的解析模式: ${rule.parser.type}`);
    }
  }

  /**
   * 解析Word文件
   */
  private async parseWord(buffer: ArrayBuffer, rule: ParseRule): Promise<ParsedOrder[]> {
    const wordData = await parseWordFile(buffer);

    if (rule.parser.type === 'text' && rule.parser.text) {
      return parseWordText(wordData, rule.parser.text);
    }

    throw new Error(`Word不支持的解析模式: ${rule.parser.type}`);
  }

  /**
   * 从 recipient 配置生成 text 模式规则（PDF fallback）
   */
  private generateTextConfigFromRecipient(recipient: NonNullable<ParseRule['recipient']>): NonNullable<ParseRule['parser']['text']> {
    const fields = recipient.fields;
    const patterns: any[] = [];
    const itemPatterns: any[] = [];
    
    // 生成收货人/门店字段的正则
    if (fields.storeName) {
      if (typeof fields.storeName === 'string') {
        patterns.push({ field: 'storeName', regex: `${fields.storeName}[：:]\\s*(.+)`, group: 1 });
      } else if (fields.storeName && 'pattern' in fields.storeName) {
        patterns.push({ field: 'storeName', regex: fields.storeName.pattern, group: 1 });
      }
    }
    // 添加常见的配送单字段匹配
    patterns.push(
      { field: 'storeName', regex: '收货机构[：:]\\s*(.+)', group: 1 },
      { field: 'storeName', regex: '收货门店[：:]\\s*(.+)', group: 1 },
      { field: 'storeName', regex: '门店[：:]\\s*(.+)', group: 1 },
      { field: 'orderNo', regex: '(?:单据编号|配送单号|运单号|订单号)[：:]\\s*(\\S+)', group: 1 },
      { field: 'receiverName', regex: '收货人[：:]\\s*(.+)', group: 1 },
      { field: 'receiverPhone', regex: '(?:电话|手机|联系电话)[：:]\\s*(\\d+)', group: 1 },
      { field: 'receiverAddress', regex: '(?:地址|收货地址|详细地址)[：:]\\s*(.+)', group: 1 },
      { field: 'itemCode', regex: '(?:物品编码|商品编码|SKU编码|SKU条码|编码)[：:]\\s*(\\S+)', group: 1 },
      { field: 'itemName', regex: '(?:物品名称|商品名称|货品名称|品名)[：:]\\s*(.+)', group: 1 },
      { field: 'quantity', regex: '(?:数量|发货数量|出库数量)[：:]\\s*(\\d+(?:\\.\\d+)?)', group: 1 },
      { field: 'specification', regex: '(?:规格型号|规格)[：:]\\s*(.+)', group: 1 },
      { field: 'unit', regex: '单位[：:]\\s*(.+)', group: 1 },
    );
    
    // 检测文本中是否有表格行样式的物品数据
    // 使用精确的SKU编码模式（如ZBWP0001），避免匹配到时间/重量/页码等非物品数据
    itemPatterns.push(
      { field: 'itemCode', regex: '([A-Z]{2,4}\\d{4,})', group: 1 },
      { field: 'itemName', regex: '[A-Z]{2,4}\\d{4,}\\s+(\\S+)', group: 1 },
      { field: 'quantity', regex: '[A-Z]{2,4}\\d{4,}\\s+\\S+\\s+(?:.*?\\s+)?(\\d+(?:\\.\\d+)?)', group: 1 },
    );

    return { patterns, itemPatterns };
  }

  /**
   * 解析CSV文件
   */
  private async parseCSV(buffer: ArrayBuffer, rule: ParseRule): Promise<ParsedOrder[]> {
    const text = new TextDecoder().decode(buffer);
    const lines = text.split('\n').filter(line => line.trim());
    const data = lines.map(line => line.split(',').map(cell => cell.trim().replace(/^"|"$/g, '')));

    if (rule.parser.type === 'table' && rule.parser.table) {
      return parseTable(data, rule.parser.table, rule.recipient);
    }

    throw new Error(`CSV不支持的解析模式: ${rule.parser.type}`);
  }

  /**
   * 校验订单数据（A/B 组二选一业务规则）
   *
   * 考试要求：
   * - A组（门店模式）：只需填写"收货门店"(storeName)，不要求收件人姓名/电话/地址
   * - B组（收件人模式）：需填写"收件人姓名 + 收件人电话 + 收件人地址"三个字段
   * - 两组都填也可以，但至少填一组。两组都没填则校验不通过
   * - SKU物品编码、SKU物品名称：必填
   * - SKU发货数量：必填且必须为正数
   */
  private validateOrders(orders: ParsedOrder[]): ParsedOrder[] {
    return orders.map(order => {
      const errors: string[] = [];

      // ========== A/B 组二选一校验 ==========
      // 判断A组（门店模式）是否完整
      const groupAComplete = Boolean(order.storeName?.trim());

      // 判断B组（收件人模式）是否完整（三个字段都需有值）
      const groupBComplete = Boolean(
        order.receiverName?.trim() &&
        order.receiverPhone?.trim() &&
        order.receiverAddress?.trim()
      );

      if (!groupAComplete && !groupBComplete) {
        errors.push(
          '收货信息不完整：请填写「收货门店」（A组门店模式），' +
          '或填写完整的「收件人姓名 + 电话 + 地址」（B组收件人模式）'
        );
      }

      // ========== SKU 必填校验 ==========
      if (!order.itemCode?.trim()) {
        errors.push('SKU物品编码为必填项');
      }
      if (!order.itemName?.trim()) {
        errors.push('SKU物品名称为必填项');
      }

      // ========== 数量校验（必须为正数）==========
      if (order.quantity === undefined || order.quantity === null) {
        errors.push('SKU发货数量为必填项');
      } else if (typeof order.quantity === 'number') {
        if (order.quantity <= 0) {
          errors.push('SKU发货数量必须为正数');
        }
        // 检查是否为整数或合理小数（最多2位小数）
        if (order.quantity !== Math.floor(order.quantity * 100) / 100) {
          errors.push('SKU发货数量最多保留2位小数');
        }
      }

      // ========== 电话格式校验（提示性，非阻塞）==========
      if (order.receiverPhone?.trim() && !/^1\d{10}$/.test(order.receiverPhone.trim())) {
        // 不是标准11位手机号，可能是座机或其他格式
        // 仅记录警告，不作为错误阻止提交
      }

      return {
        ...order,
        isValid: errors.length === 0,
        validationErrors: errors,
      };
    });
  }

  // matchRule 方法已移除 — 考试要求：规则由用户手动选择

  /**
   * 检测数据是否是卡片式布局
   * 特征：行中有"▶ 调拨记录 #N"、门店标签行、物品子表等卡片标记
   */
  private detectCardLayoutFromData(data: any[][]): boolean {
    if (!data || data.length < 5) return false;
    
    // 检查前20行是否有卡片起始标记
    const cardStartPatterns = [
      /▶\s*(?:调拨|配送|出库)?\s*记录/i,
      /◆\s*\d+/,
      /第\d+\s*(?:条|项|笔)/,
      /---{3,}/,
      /调拨记录/i,
    ];
    
    for (let i = 0; i < Math.min(data.length, 20); i++) {
      const rowText = (data[i] || []).join(' ').trim();
      for (const pattern of cardStartPatterns) {
        if (pattern.test(rowText)) return true;
      }
    }
    
    // 备选检测：看是否有"调入门店"+"收货人"+"物品编码"在连续行中反复出现
    let cardCount = 0;
    for (let i = 0; i < Math.min(data.length, 30); i++) {
      const rowText = (data[i] || []).join(' ').trim();
      if (/调入门店|收货门店/.test(rowText)) cardCount++;
    }
    // 如果"门店"标签出现2次以上，很可能是卡片式
    return cardCount >= 2;
  }

  /**
   * 自动解析卡片式布局（无需card配置）
   * 自动检测卡片边界、收货人信息、物品列表
   */
  private parseCardAuto(data: any[][]): ParsedOrder[] {
    const orders: ParsedOrder[] = [];
    
    // 阶段1：识别卡片边界
    interface CardRegion {
      startRow: number;
      endRow: number;
      headerRows: number[];  // 卡片头部行（收货人信息）
      itemStartRow: number;  // 物品表起始行
      itemEndRow: number;    // 物品表结束行
    }
    
    const cards: CardRegion[] = [];
    let currentCard: CardRegion | null = null;
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowText = (row || []).join(' ').trim();
      const firstCell = String(row?.[0] || '').trim();
      
      // 检测卡片起始行
      const isCardStart = /▶\s*(?:调拨|配送|出库)?\s*记录/i.test(rowText) ||
                         /◆\s*\d+/.test(rowText) ||
                         /调拨记录/.test(rowText) ||
                         /---{3,}/.test(firstCell);
      
      // 检测"调入门店"行（也是卡片区域的开始）
      const isStoreRow = /调入门店|收货门店/.test(rowText);
      
      if (isCardStart || (isStoreRow && !currentCard)) {
        // 保存上一个卡片
        if (currentCard) {
          currentCard.endRow = i;
          cards.push(currentCard);
        }
        currentCard = {
          startRow: i,
          endRow: data.length,
          headerRows: [],
          itemStartRow: -1,
          itemEndRow: data.length,
        };
        if (isStoreRow) currentCard.headerRows.push(i);
        continue;
      }
      
      if (currentCard) {
        if (isStoreRow) {
          currentCard.headerRows.push(i);
        }
        
        // 检测物品表头
        if (/物品编码|物品名称|编码.*名称|SKU/.test(rowText) && currentCard.itemStartRow === -1) {
          currentCard.itemStartRow = i + 1;
        }
      }
    }
    
    // 保存最后一个卡片
    if (currentCard) {
      currentCard.endRow = data.length;
      cards.push(currentCard);
    }
    
    // 如果没有检测到卡片标记，尝试按"门店行"分段
    if (cards.length === 0) {
      let cardStart = -1;
      for (let i = 0; i < data.length; i++) {
        const rowText = (data[i] || []).join(' ').trim();
        if (/调入门店|收货门店/.test(rowText)) {
          if (cardStart >= 0) {
            cards.push({
              startRow: cardStart,
              endRow: i,
              headerRows: [cardStart],
              itemStartRow: -1,
              itemEndRow: i,
            });
          }
          cardStart = i;
        }
        if (/物品编码|物品名称|编码.*名称/.test(rowText) && cardStart >= 0) {
          // 找到物品表头，上一个卡片的itemStartRow
          const lastCard = cards[cards.length - 1];
          if (lastCard && lastCard.itemStartRow === -1) {
            lastCard.itemStartRow = i + 1;
          }
        }
      }
      if (cardStart >= 0) {
        cards.push({
          startRow: cardStart,
          endRow: data.length,
          headerRows: [cardStart],
          itemStartRow: -1,
          itemEndRow: data.length,
        });
      }
    }
    
    // 阶段2：解析每个卡片
    for (const card of cards) {
      const cardInfo: Record<string, string> = {};
      
      // 提取卡片头部信息（收货人、门店等）
      for (let i = card.startRow; i < card.endRow && i < data.length; i++) {
        const row = data[i];
        if (!row) continue;
        
        // key:value 格式提取（如"调入门店  尹三顺自助烤肉（银泰店）  收货人  王店长  电话  13900001111"）
        const rowText = (row as any[]).join(' ');
        this.extractKeyValuePairs(row, cardInfo);
      }
      
      // 提取物品行
      const itemRows = this.findItemRows(data, card);
      
      for (const itemRow of itemRows) {
        const order: ParsedOrder = {
          storeName: cardInfo.storeName || undefined,
          receiverName: cardInfo.receiverName || undefined,
          receiverPhone: cardInfo.receiverPhone || undefined,
          receiverAddress: cardInfo.receiverAddress || undefined,
          orderNo: cardInfo.orderNo || undefined,
          itemCode: itemRow.itemCode || undefined,
          itemName: itemRow.itemName || undefined,
          specification: itemRow.specification || undefined,
          quantity: itemRow.quantity,
          unit: itemRow.unit || undefined,
          sourceRow: itemRow.rowIndex,
          isValid: true,
          validationErrors: [],
        };
        orders.push(order);
      }
    }
    
    return orders;
  }

  /**
   * 从行数据中提取 key:value 对
   * 支持 "key  value  key  value" 格式
   */
  private extractKeyValuePairs(row: any[], result: Record<string, string>): void {
    const keyPatterns: [string, RegExp][] = [
      ['storeName', /(?:调入门店|收货门店|门店)[：:]?\s*/],
      ['receiverName', /收货人[：:]?\s*/],
      ['receiverPhone', /(?:电话|手机|联系电话)[：:]?\s*/],
      ['receiverAddress', /(?:收货地址|地址)[：:]?\s*/],
      ['orderNo', /(?:调拨单号|配送单号|单据号|单号)[：:]?\s*/],
    ];
    
    // 拼接行文本
    const rowText = row.map(c => String(c || '').trim()).filter(Boolean).join('  ');
    
    for (const [field, pattern] of keyPatterns) {
      if (result[field]) continue; // 已有值不覆盖
      const match = rowText.match(pattern);
      if (match && match.index !== undefined) {
        // 取匹配位置后的文本，到下一个key或行尾
        const afterMatch = rowText.substring(match.index + match[0].length);
        // 截取到下一个关键词前
        const nextKeyMatch = afterMatch.match(/(?:调入门店|收货门店|门店|收货人|电话|手机|收货地址|地址|调拨单号|配送单号|物品编码|物品名称|规格|数量)/);
        const value = nextKeyMatch 
          ? afterMatch.substring(0, nextKeyMatch.index).trim()
          : afterMatch.trim();
        if (value) result[field] = value;
      }
    }
  }

  /**
   * 查找卡片内的物品数据行
   */
  private findItemRows(data: any[][], card: { startRow: number; endRow: number; itemStartRow: number }): Array<{ rowIndex: number; itemCode: string; itemName: string; specification: string; quantity: number | undefined; unit: string }> {
    const items: Array<{ rowIndex: number; itemCode: string; itemName: string; specification: string; quantity: number | undefined; unit: string }> = [];
    
    const searchStart = card.itemStartRow > 0 ? card.itemStartRow : card.startRow;
    
    for (let i = searchStart; i < card.endRow && i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;
      
      const firstCell = String(row[0] || '').trim();
      // 跳过空行、合计行、标题行、关键字行
      if (!firstCell || firstCell === '合计' || firstCell === '总计' || 
          /调入门店|收货门店|收货人|电话|地址|物品编码|▶|◆|---/.test(firstCell)) continue;
      
      // 检查是否像物品编码（字母+数字的组合，如 ZBWP0001）
      const isItemCode = /^[A-Z]{2,4}\d{3,}/i.test(firstCell) || 
                         /^\d+$/.test(firstCell) && row.length >= 3;
      
      if (isItemCode || (firstCell.length > 2 && row.length >= 3)) {
        const itemCode = String(row[0] || '').trim();
        const itemName = String(row[1] || '').trim();
        const spec = String(row[2] || '').trim();
        const qtyStr = String(row[3] || '').trim();
        const unit = String(row[4] || '').trim();
        
        // 确保至少有编码和名称
        if (itemCode && itemName) {
          const qty = this.parseNumber(qtyStr);
          items.push({ rowIndex: i, itemCode, itemName, specification: spec, quantity: qty, unit });
        }
      }
    }
    
    return items;
  }

  private parseNumber(value: any): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const num = Number(String(value).replace(/[^\d.-]/g, ''));
    return isNaN(num) ? undefined : num;
  }

  /**
   * 检测数据是否是矩阵模式（SKU×门店）
   * 特征：列头中包含门店名（"银泰"、"金桥"、"金银潭"等），且有SKU名称/条码列
   */
  private detectMatrixFromData(data: any[][]): import('@/types/rule').MatrixParserConfig | null {
    if (!data || data.length < 3) return null;
    
    const headerRow = data[0];
    if (!headerRow) return null;
    
    // 检查列头中是否有 SKU 列
    let skuColumn = -1;
    let skuCodeColumn = -1;
    const storeColumns: { index: number; storeName: string }[] = [];
    
    // 已知的SKU列名
    const skuNameKeywords = ['SKU名称', '物品名称', '商品名称', '货品名称', '品名'];
    const skuCodeKeywords = ['SKU条码', 'SKU编码', '物品编码', '商品编码', '条码', '编码'];
    
    // 已知的非门店列名（排除这些列）
    const nonStoreKeywords = ['仓库', '货主', 'SKU', '物品', '商品', '编码', '条码', '名称', '规格',
      '库存', '在库', '可用', '待移', '分配', '冻结', '单位', '状态', '结余', '序号', '数量',
      '分类', '品牌', '地址', '电话', '收货', '备注', '合计', '型号'];
    
    for (let i = 0; i < headerRow.length; i++) {
      const cell = String(headerRow[i] || '').trim();
      if (!cell) continue;
      
      // 检查SKU列
      for (const kw of skuNameKeywords) {
        if (cell.includes(kw) && skuColumn === -1) {
          skuColumn = i;
          break;
        }
      }
      for (const kw of skuCodeKeywords) {
        if (cell.includes(kw) && skuCodeColumn === -1) {
          skuCodeColumn = i;
          break;
        }
      }
      
      // 检查门店列：不是已知非门店列，且在SKU列之后
      if (i > Math.max(skuColumn, skuCodeColumn, 0)) {
        const isNonStore = nonStoreKeywords.some(kw => cell.includes(kw));
        if (!isNonStore) {
          // 门店列特征：简短（≤6字符），通常是店名
          // 或者列名包含"店"、"门店"
          if (cell.includes('店') || cell.includes('门店') || cell.length <= 8) {
            storeColumns.push({ index: i, storeName: cell });
          }
        }
      }
    }
    
    // 如果找到了SKU列和至少2个门店列，认为是矩阵模式
    if (skuColumn >= 0 && storeColumns.length >= 2) {
      return {
        headerRow: 0,
        skuColumn,
        skuCodeColumn: skuCodeColumn >= 0 ? skuCodeColumn : undefined,
        storeColumns,
      };
    }
    
    return null;
  }

  /**
   * 从表头行之前的key:value区域 + 页脚区域提取收货人/门店信息
   * 用于配送发货单等头部含有收货机构信息的格式
   */
  private extractHeaderAreaRecipient(data: any[][], headerRowIndex: number): Record<string, string> {
    const result: Record<string, string> = {};
    
    // 搜索区域1：表头行之前（通常包含收货机构、供货机构等）
    // 搜索区域2：页脚区域（最后10行，包含收货人、收货地址等）
    const areas = [
      { start: 0, end: headerRowIndex },
      { start: Math.max(0, data.length - 10), end: data.length },
    ];
    
    // key:value 提取模式
    const fieldPatterns: [string, RegExp][] = [
      ['storeName', /收货机构[：:\s]+(.+?)(?:\s{2,}|$)/],
      ['storeName', /收货门店[：:\s]+(.+?)(?:\s{2,}|$)/],
      ['storeName', /(?:调入门店|门店)[：:\s]+(.+?)(?:\s{2,}|$)/],
      ['receiverName', /收货人[：:\s]+(.+?)(?:\s{2,}|\s*$)/],
      ['receiverPhone', /(?:收货电话|联系电话|电话|手机)[：:\s]+([\d]+)/],
      ['receiverAddress', /(?:收货地址|地址)[：:\s]+(.+?)(?:\s{2,}|$)/],
      ['orderNo', /(?:单据号|配送单号|运单号)[：:\s]+(\S+)/],
    ];
    
    for (const area of areas) {
      for (let i = area.start; i < area.end && i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;
        
        // 方法1：将整行拼接为文本，用正则提取
        const rowText = row.map(c => String(c || '').trim()).filter(Boolean).join('  ');
        for (const [field, pattern] of fieldPatterns) {
          if (result[field]) continue;
          const match = rowText.match(pattern);
          if (match) {
            const value = match[1]?.trim();
            if (value) result[field] = value;
          }
        }
        
        // 方法2：key在单元格A，value在单元格B的格式（如 "收货机构" 在 col0，"黎明屯..." 在 col1）
        for (let c = 0; c < row.length - 1; c++) {
          const key = String(row[c] || '').trim();
          const val = String(row[c + 1] || '').trim();
          if (!key || !val) continue;
          
          if (/收货机构/.test(key) && !result.storeName) {
            result.storeName = val;
          } else if (/收货门店/.test(key) && !result.storeName) {
            result.storeName = val;
          } else if (/^收货人$/.test(key) && !result.receiverName) {
            result.receiverName = val;
          } else if (/^(?:收货电话|联系电话|电话)$/.test(key) && !result.receiverPhone) {
            if (/^\d{7,11}$/.test(val)) result.receiverPhone = val;
          } else if (/^(?:收货地址|地址)$/.test(key) && !result.receiverAddress) {
            result.receiverAddress = val;
          } else if (/^(?:单据号|配送单号)$/.test(key) && !result.orderNo) {
            result.orderNo = val;
          }
        }
      }
    }
    
    return result;
  }
}

// 导出单例
export const parseEngine = new ParseEngine();
