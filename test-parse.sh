#!/bin/bash

# 测试解析6份文件
BASE_URL="http://localhost:3000"
DEMO_DIR="d:/WorkBuddy-projects/aiTest/exam-demos/demos"

echo "=========================================="
echo "测试万能导入V2 - 解析6份文件"
echo "=========================================="

# 测试文件列表
FILES=(
  "12.25海口龙湖天街-配送发货单PS2512220005001(1).xlsx"
  "湖南仓.xlsx"
  "欢乐牧场模板0430.xlsx"
  "黔寨寨贵州烙锅（鞍山店）常温.pdf"
  "多门店分Sheet出库单.xlsx"
  "门店调拨单-卡片式.xlsx"
)

for file in "${FILES[@]}"; do
  echo ""
  echo "------------------------------------------"
  echo "测试文件: $file"
  echo "------------------------------------------"
  
  # 发送解析请求
  response=$(curl -s -X POST "$BASE_URL/api/parse" \
    -F "file=@$DEMO_DIR/$file" \
    2>&1)
  
  # 检查响应
  if echo "$response" | grep -q '"success":true'; then
    total=$(echo "$response" | grep -o '"totalRows":[0-9]*' | cut -d':' -f2)
    errors=$(echo "$response" | grep -o '"errorRows":[0-9]*' | cut -d':' -f2)
    echo "✅ 解析成功: 共 $total 条记录, $errors 条错误"
    
    # 显示前3条记录
    echo "前3条记录:"
    echo "$response" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    orders = data.get('orders', [])[:3]
    for i, order in enumerate(orders, 1):
        print(f'  {i}. {order.get(\"itemName\", \"-\")} / {order.get(\"receiverName\", \"-\")} / 数量: {order.get(\"quantity\", \"-\")}')
except:
    print('  (无法解析JSON)')
" 2>/dev/null || echo "  (无法显示记录)"
  else
    echo "❌ 解析失败"
    echo "$response" | head -100
  fi
done

echo ""
echo "=========================================="
echo "测试完成"
echo "=========================================="
