/**
 * 创建配送签收单-多单PDF
 * 一个PDF内含3个独立配送签收单，每个有独立的收货人信息和物品明细
 */
import PDFDocument from 'pdfkit';
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

function drawOrder(doc, order, isFirst) {
  if (!isFirst) {
    doc.addPage();
  }

  // 标题
  doc.fontSize(18).text('配送签收单', { align: 'center' });
  doc.moveDown(0.5);

  // 分隔线
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.5);

  // 基本信息
  doc.fontSize(11);
  doc.text(`配送单号：${order.code}`);
  doc.text(`收货门店：${order.store}`);
  doc.text(`收货地址：${order.address}`);
  doc.text(`联系人：${order.contact}    电话：${order.phone}`);
  doc.moveDown(0.5);

  // 表头
  const tableTop = doc.y;
  const colX = [50, 140, 300, 420, 500];
  const colW = [90, 160, 120, 80, 45];

  doc.fontSize(10).font('Helvetica-Bold');
  doc.text('编码', colX[0], tableTop, { width: colW[0] });
  doc.text('名称', colX[1], tableTop, { width: colW[1] });
  doc.text('规格', colX[2], tableTop, { width: colW[2] });
  doc.text('数量', colX[3], tableTop, { width: colW[3] });

  doc.moveTo(50, tableTop + 15).lineTo(545, tableTop + 15).stroke();

  // 数据行
  doc.font('Helvetica').fontSize(10);
  let y = tableTop + 22;
  for (const item of order.items) {
    doc.text(item.code, colX[0], y, { width: colW[0] });
    doc.text(item.name, colX[1], y, { width: colW[1] });
    doc.text(item.spec, colX[2], y, { width: colW[2] });
    doc.text(String(item.qty), colX[3], y, { width: colW[3] });
    y += 20;
  }

  // 分隔线
  doc.moveTo(50, y + 5).lineTo(545, y + 5).stroke();

  // 签字区
  doc.moveDown(2);
  doc.text(`合计：${order.items.reduce((s, i) => s + i.qty, 0)} 件`, 50, doc.y);
  doc.moveDown(2);
  doc.text('签收人签字：________________    日期：________________', 50, doc.y);
  doc.moveDown(1);
  doc.text('备注：____________________________', 50, doc.y);
}

async function main() {
  const filePath = path.join(publicDir, '配送签收单-多单.pdf');
  const doc = new PDFDocument({ margin: 50 });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  orders.forEach((order, idx) => {
    drawOrder(doc, order, idx === 0);
  });

  doc.end();

  await new Promise(resolve => stream.on('finish', resolve));
  const stat = fs.statSync(filePath);
  console.log(`✅ 创建: 配送签收单-多单.pdf (${stat.size} bytes, ${orders.length}个签收单)`);
}

main().catch(console.error);
