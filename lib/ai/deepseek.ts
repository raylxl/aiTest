import type { ParseRule } from '@/types/rule';
import https from 'https';

const DEEPSEEK_API_URL = 'https://www.vbcode.io/v1/chat/completions';

const SYSTEM_PROMPT = `你是一个文件解析规则生成专家。你的任务是根据用户提供的文件样本，生成JSON格式的解析规则。

## 规则类型说明

1. **table** - 标准表格格式：有明确的表头行和数据行
2. **matrix** - 矩阵格式：SKU×门店矩阵，需要转置
3. **card** - 卡片格式：多个独立卡片堆叠
4. **text** - 纯文本格式：无表格，用正则提取
5. **multi-sheet** - 多Sheet格式：Excel有多个Sheet
6. **multi-page** - 多页格式：PDF有多个独立单元

## 输出格式

请输出严格的JSON格式，结构如下：

\`\`\`json
{
  "name": "规则名称",
  "description": "规则描述",
  "fileTypes": ["excel"],
  "identifier": {
    "fileNamePattern": "文件名正则",
    "headerKeywords": ["关键词1", "关键词2"]
  },
  "parser": {
    "type": "table|matrix|card|text|multi-sheet",
    "table": {
      "headerRow": 0,
      "dataStartRow": 1,
      "columns": [
        {"sourceIndex": 0, "targetField": "字段名", "dataType": "string|number"}
      ]
    }
  },
  "recipient": {
    "source": "footer|inline|header",
    "fields": {
      "name": {"pattern": "收货人[：:]\\\\s*(.+?)(?:\\\\s|$)"},
      "phone": {"pattern": "(?:电话|手机)[：:]\\\\s*(\\\\d+)"},
      "address": {"pattern": "(?:地址|收货地址)[：:]\\\\s*(.+)"}
    }
  }
}
\`\`\`

## 字段映射规则

targetField应使用以下标准字段名：
- 运单号/单据号/配送单号 → orderNo
- 发货人 → senderName
- 收货人/收货人姓名 → receiverName
- 电话/手机/联系电话 → receiverPhone
- 地址/收货地址/详细地址 → receiverAddress
- 物品名称/商品名称/SKU名称 → itemName
- 物品编码/商品编码/SKU编码 → itemCode
- 物品分类 → itemCategory
- 规格型号/规格 → specification
- 单位 → unit
- 数量/发货数量/出库数量 → quantity

## 重要提示

1. 只输出JSON，不要包含任何解释文字
2. headerRow和dataStartRow使用0-based索引
3. sourceIndex是列的索引（0-based）
4. 正则表达式需要正确转义
`;

/**
 * 使用Node.js https模块调用API（绕过Cloudflare检测）
 */
function callAPIWithHttps(apiKey: string, body: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(DEEPSEEK_API_URL);
    const postData = JSON.stringify(body);
    
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`解析响应失败: ${data.substring(0, 200)}`));
          }
        } else {
          reject(new Error(`API调用失败 (${res.statusCode}): ${data.substring(0, 500)}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`请求错误: ${e.message}`));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * 调用AI API生成解析规则
 */
export async function generateRuleWithAI(
  fileSample: string,
  fileType: string,
  fileName: string
): Promise<ParseRule> {
  const apiKey = process.env.AI_API_KEY;
  
  if (!apiKey) {
    throw new Error('未配置AI_API_KEY');
  }

  const userMessage = `请根据以下文件样本生成解析规则。

## 文件信息
- 文件名：${fileName}
- 文件类型：${fileType}

## 文件内容样本（前20行）
\`\`\`
${fileSample}
\`\`\`

请分析文件结构，生成对应的解析规则JSON。`;

  const body = {
    model: 'gpt-5.4',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage }
    ],
    temperature: 0.1,
    max_tokens: 4000,
  };

  // 使用Node.js https模块调用（绕过Cloudflare检测）
  const data = await callAPIWithHttps(apiKey, body);
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('AI API返回空内容');
  }

  // 提取JSON内容
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('无法从AI响应中提取JSON');
  }

  try {
    const rule = JSON.parse(jsonMatch[0]) as ParseRule;
    
    // 验证规则格式
    validateRule(rule);
    
    return {
      ...rule,
      id: undefined, // 新规则没有ID
    };
  } catch (error) {
    throw new Error(`解析AI生成的规则失败: ${error}`);
  }
}

/**
 * 验证规则格式
 */
function validateRule(rule: any): void {
  if (!rule.name) throw new Error('规则缺少name字段');
  if (!rule.parser?.type) throw new Error('规则缺少parser.type字段');
  
  const validTypes = ['table', 'matrix', 'card', 'text', 'multi-sheet', 'multi-page'];
  if (!validTypes.includes(rule.parser.type)) {
    throw new Error(`无效的解析类型: ${rule.parser.type}`);
  }
}

/**
 * 从Excel文件提取样本数据
 */
export function extractExcelSample(data: any[][], maxRows: number = 20): string {
  const sampleRows = data.slice(0, maxRows);
  return sampleRows.map((row, i) => {
    const cells = row.map((cell: any) => String(cell ?? '')).join(' | ');
    return `[${i}] ${cells}`;
  }).join('\n');
}

/**
 * 从PDF文本提取样本数据
 */
export function extractPDFSample(text: string, maxChars: number = 3000): string {
  return text.substring(0, maxChars);
}

/**
 * 从Word文本提取样本数据
 */
export function extractWordSample(text: string, maxChars: number = 3000): string {
  return text.substring(0, maxChars);
}
