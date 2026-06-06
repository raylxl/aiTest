/**
 * 创建配送签收单-多单PDF（使用 pdf-lib，pdf2json 兼容）
 * 一个PDF内含3个独立配送签收单
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

const orders = [
  {
    code: 'PS20260605001',
    store: '小龙坎火锅（静安店）',
    address: '上海市静安区南京西路1000号',
    contact: '赵强',
    phone: '13700001111',
    items: [
      { code: 'SKU-D001', name: '牛油锅底', spec: '500g/袋', qty: 20 },
      { code: 'SKU-D002', name: '毛肚', spec: '300g/盒', qty: 15 },
      { code: 'SKU-D003', name: '鸭血', spec: '250g/盒', qty: 10 },
    ],
  },
  {
    code: 'PS20260605002',
    store: '西贝莜面村（长宁店）',
    address: '上海市长宁区长宁路1018号',
    contact: '刘芳',
    phone: '13600002222',
    items: [
      { code: 'SKU-E001', name: '莜面鱼鱼', spec: '400g/袋', qty: 25 },
      { code: 'SKU-E002', name: '羊肉串', spec: '10串/袋', qty: 30 },
      { code: 'SKU-E003', name: '酸奶', spec: '200ml/杯', qty: 50 },
    ],
  },
  {
    code: 'PS20260605003',
    store: '太二酸菜鱼（环球港店）',
    address: '上海市普陀区中山北路3300号',
    contact: '陈明',
    phone: '13500003333',
    items: [
      { code: 'SKU-F001', name: '酸菜鱼调料', spec: '200g/包', qty: 40 },
      { code: 'SKU-F002', name: '黑鱼片', spec: '500g/盒', qty: 20 },
    ],
  },
];

async function main() {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  // 嵌入中文字体
  const fontBytes = fs.readFileSync('C:/Windows/Fonts/simhei.ttf');
  const font = await pdfDoc.embedFont(fontBytes);
  const fontSize = 11;
  const lineHeight = 16;
  const margin = 50;
  const pageWidth = 595;
  const pageHeight = 842;

  for (const order of orders) {
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    const drawText = (text, x, size = fontSize) => {
      page.drawText(text, { x, y, size, font, color: rgb(0, 0, 0) });
      y -= lineHeight;
    };

    const drawLine = () => {
      page.drawLine({
        start: { x: margin, y: y + 4 },
        end: { x: pageWidth - margin, y: y + 4 },
        thickness: 0.5,
        color: rgb(0, 0, 0),
      });
      y -= 8;
    };

    // 标题
    page.drawText('配送签收单', {
      x: pageWidth / 2 - 50,
      y,
      size: 18,
      font,
      color: rgb(0, 0, 0),
    });
    y -= 30;

    drawLine();

    // 基本信息
    drawText('配送单号: ' + order.code);
    drawText('收货门店: ' + order.store);
    drawText('收货地址: ' + order.address);
    drawText('联系人: ' + order.contact + '    电话: ' + order.phone);
    y -= 10;

    drawLine();

    // 表头
    drawText('SKU编码 / 名称 / 规格 / 数量', margin, 10);
    y -= 4;
    drawLine();

    // 物品明细
    for (const item of order.items) {
      drawText(item.code + ' / ' + item.name + ' / ' + item.spec + ' / ' + String(item.qty), margin, 10);
    }

    y -= 8;
    drawLine();

    // 合计
    const total = order.items.reduce((s, i) => s + i.qty, 0);
    drawText('合计: ' + total + ' 件');

    // 签字区
    y -= 40;
    drawText('签收人签字: ________________    日期: ________________');
    y -= 20;
    drawText('备注: ____________________________');
  }

  const pdfBytes = await pdfDoc.save();
  const filePath = path.join(publicDir, '配送签收单-多单.pdf');
  fs.writeFileSync(filePath, pdfBytes);
  console.log(`✅ 创建: 配送签收单-多单.pdf (${pdfBytes.length} bytes, ${orders.length}个签收单)`);
}

main().catch(console.error);
