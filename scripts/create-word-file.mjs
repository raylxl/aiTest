/**
 * 创建门店配送确认单.docx — 纯文本段落格式
 * 考试要求的 Word 纯文本解析测试文件
 */
import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

const records = [
  {
    code: 'PS20260601001',
    store: '尹三顺自助烤肉（银泰店）',
    address: '上海市浦东新区银泰百货B1层',
    contact: '张伟',
    phone: '13812345678',
    note: '请在14:00前送达',
    items: [
      { code: 'SKU-A001', name: '冻牛肉卷', spec: '500g/盒', qty: 20 },
      { code: 'SKU-A002', name: '冻羊肉片', spec: '300g/盒', qty: 15 },
      { code: 'SKU-A003', name: '虾滑', spec: '250g/袋', qty: 30 },
      { code: 'SKU-A004', name: '鱼豆腐', spec: '200g/袋', qty: 25 },
    ],
  },
  {
    code: 'PS20260601002',
    store: '海底捞火锅（南京路店）',
    address: '上海市黄浦区南京东路800号',
    contact: '李娜',
    phone: '13987654321',
    note: '轻拿轻放',
    items: [
      { code: 'SKU-B001', name: '麻辣锅底', spec: '400g/袋', qty: 10 },
      { code: 'SKU-B002', name: '番茄锅底', spec: '400g/袋', qty: 8 },
      { code: 'SKU-B003', name: '肥牛卷', spec: '500g/盒', qty: 12 },
    ],
  },
  {
    code: 'PS20260601003',
    store: '外婆家（徐汇店）',
    address: '上海市徐汇区肇嘉浜路1000号',
    contact: '王磊',
    phone: '13611112222',
    note: '无',
    items: [
      { code: 'SKU-C001', name: '西湖醋鱼调料', spec: '100g/包', qty: 50 },
      { code: 'SKU-C002', name: '东坡肉半成品', spec: '600g/份', qty: 18 },
    ],
  },
];

function createDocx() {
  const children = [];

  // 标题
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: '门店配送确认单', bold: true, size: 32 })],
    })
  );

  for (const rec of records) {
    // 分隔线
    children.push(
      new Paragraph({
        spacing: { before: 300, after: 100 },
        children: [new TextRun({ text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' })],
      })
    );

    // 单据信息
    const infoLines = [
      `编号：${rec.code}`,
      `门店：${rec.store}`,
      `地址：${rec.address}`,
      `联系人：${rec.contact}  电话：${rec.phone}`,
      '',
      '物品清单：',
    ];
    for (const line of infoLines) {
      children.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [new TextRun({ text: line, size: 24 })],
        })
      );
    }

    // 物品行
    rec.items.forEach((item, idx) => {
      children.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({
              text: `${idx + 1}. 编码: ${item.code} | 名称: ${item.name} | 规格: ${item.spec} | 数量: ${item.qty}`,
              size: 24,
            }),
          ],
        })
      );
    });

    // 备注
    children.push(
      new Paragraph({
        spacing: { before: 100, after: 60 },
        children: [new TextRun({ text: `备注：${rec.note}`, size: 24 })],
      })
    );
  }

  // 结尾分隔线
  children.push(
    new Paragraph({
      spacing: { before: 300 },
      children: [new TextRun({ text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' })],
    })
  );

  const doc = new Document({
    sections: [{ children }],
  });

  return doc;
}

async function main() {
  const doc = createDocx();
  const buffer = await Packer.toBuffer(doc);
  const filePath = path.join(publicDir, '门店配送确认单.docx');
  fs.writeFileSync(filePath, buffer);
  console.log(`✅ 创建: 门店配送确认单.docx (${buffer.length} bytes)`);
}

main().catch(console.error);
