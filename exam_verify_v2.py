"""
考试需求逐项验证 V2 — 基于真实数据结构的精确规则
"""
import requests, json, time

BASE = "http://localhost:3000"
DEMOS = "D:/WorkBuddy-projects/aiTest/exam-demos/demos"

# ============================================================
# 精确规则配置（根据 extract-sample 真实数据结构）
# ============================================================

rules = {
    "黎明屯配送发货单": {
        "name": "黎明屯配送发货单", "description": "42列配送发货单, 3行干扰头+表头第4行+数据5-6行+尾部收货人",
        "fileTypes": ["excel"],
        "parser": {
            "type": "table",
            "table": {
                "headerRow": 3,    # 第4行是表头(0-based=3)
                "dataStartRow": 4, # 第5行起数据
                "dataEndRow": 6,   # 只到第6行(不含合计行7-10)
                "columns": [
                    {"sourceIndex": 0, "targetField": "配送单号", "dataType": "string"},
                    {"sourceIndex": 1, "targetField": "物品类别", "dataType": "string"},
                    {"sourceIndex": 2, "targetField": "物品编码", "dataType": "string"},
                    {"sourceIndex": 3, "targetField": "物品名称", "dataType": "string"},
                    {"sourceIndex": 5, "targetField": "规格型号", "dataType": "string"},
                    {"sourceIndex": 14, "targetField": "发货数量", "dataType": "number"},
                    {"sourceIndex": 15, "targetField": "发货单价", "dataType": "number"},
                ],
                # 从 row 9-10 提取收货人信息 (footer)
                "footer": {
                    "extractRows": [
                        {"row": 8, "fields": [
                            {"colStart": 0, "colEnd": 20, "targetField": "收货方信息", "dataType": "string"}
                        ]},
                        {"row": 9, "fields": [
                            {"colStart": 0, "colEnd": 20, "targetField": "收货方信息2", "dataType": "string"}
                        ]},
                    ]
                }
            }
        },
        "recipient": {
            "source": "footer",
            "fields": {
                "name": {"pattern": "收货机构[：:]\\s*([^\\s]+)"},
                "phone": {"pattern": "收货人手机号[：:]\\s*(\\d+)"},
            }
        }
    },
    
    "湖南仓发货明细": {
        "name": "湖南仓发货明细", "description": "32列, 第0行说明+第1行表头+从第2行起167行数据",
        "fileTypes": ["excel"],
        "parser": {
            "type": "table",
            "table": {
                "headerRow": 1,     # "收货机构 | 配送汇总单号* | ..."
                "dataStartRow": 2,  # 尹三顺自助烤肉屋...
                "columns": [
                    {"sourceIndex": 0, "targetField": "收货门店", "dataType": "string"},  # A组: storeName
                    {"sourceIndex": 2, "targetField": "运单号", "dataType": "string"},      # 配送单号
                    {"sourceIndex": 4, "targetField": "物品分类", "dataType": "string"},
                    {"sourceIndex": 5, "targetField": "物品编码", "dataType": "string"},
                    {"sourceIndex": 6, "targetField": "物品名称", "dataType": "string"},
                    {"sourceIndex": 8, "targetField": "规格型号", "dataType": "string"},
                    {"sourceIndex": 12, "targetField": "发货数量", "dataType": "number"},
                ]
            }
        }
    },
    
    "欢乐牧场模板": {
        "name": "欢乐牧场矩阵", "description": "SKU×门店矩阵, 第0行合并表头+第1行列头+第2行起数据",
        "fileTypes": ["excel"],
        "parser": {
            "type": "matrix",
            "matrix": {
                "headerRow": 1,
                "skuColumn": 1,        # col 1 = SKU名称
                "skuCodeColumn": 0,    # col 0 = SKU条码
                "storeColumns": [
                    {"index": 5, "storeName": "芙蓉店"},
                    {"index": 6, "storeName": "万家丽店"},
                    {"index": 7, "storeName": "梅溪湖店"},
                ]
            }
        }
    },
    
    "多门店分Sheet": {
        "name": "多门店分Sheet", "description": "3个Sheet, 每个Sheet独立解析后合并",
        "fileTypes": ["excel"],
        "parser": {
            "type": "multi-sheet",
            "allSheets": True,
            "sheetRule": {
                "parser": {
                    "type": "table",
                    "table": {
                        "headerRow": 3,     # Sheet内表头在行4
                        "dataStartRow": 4,  # 数据从行5开始
                        "columns": [
                            {"sourceIndex": 2, "targetField": "物品编码", "dataType": "string"},
                            {"sourceIndex": 3, "targetField": "物品名称", "dataType": "string"},
                            {"sourceIndex": 5, "targetField": "规格型号", "dataType": "string"},
                            {"sourceIndex": 14, "targetField": "发货数量", "dataType": "number"},
                        ]
                    }
                }
            }
        }
    },
    
    "门店调拨单-卡片式": {
        "name": "门店调拨单卡片", "description": "卡片堆叠, ▶ 调拨记录 #N 为卡片起始标志",
        "fileTypes": ["excel"],
        "parser": {
            "type": "card",
            "card": {
                "cardStartPattern": "▶\\s*调拨记录",
                "cardFields": [
                    {"pattern": "调拨单号[：:]\\s*(\\S+)", "field": "orderNo"},
                    {"pattern": "调入门店[：:]\\s*(\\S+)", "field": "storeName"},
                    {"pattern": "收货人[：:]\\s*(\\S+)", "field": "receiverName"},
                ],
                "itemTable": {
                    "columns": [
                        {"sourceIndex": 0, "targetField": "物品编码", "dataType": "string"},
                        {"sourceIndex": 1, "targetField": "物品名称", "dataType": "string"},
                        {"sourceIndex": 2, "targetField": "规格型号", "dataType": "string"},
                        {"sourceIndex": 3, "targetField": "发货数量", "dataType": "number"},
                    ]
                }
            }
        }
    },
    
    "黔寨寨配送单PDF": {
        "name": "黔寨寨配送单PDF", "description": "PDF, 头部元信息+中间标准表格+底部收货人",
        "fileTypes": ["pdf"],
        "parser": {
            "type": "table",
            "table": {
                "headerRow": "auto",
                "dataStartRow": "auto",
                "columns": [
                    {"sourceIndex": 0, "targetField": "物品类别", "dataType": "string"},
                    {"sourceIndex": 1, "targetField": "物品编码", "dataType": "string"},
                    {"sourceIndex": 2, "targetField": "物品名称", "dataType": "string"},
                    {"sourceIndex": 3, "targetField": "规格型号", "dataType": "string"},
                    {"sourceIndex": 5, "targetField": "发货数量", "dataType": "number"},
                ]
            }
        },
        "recipient": {
            "source": "footer",
            "fields": {
                "name": {"pattern": "收货机构[：:]\\s*(.+)"},
                "phone": {"pattern": "收货人手机号[：:]\\s*(\\d+)"},
            }
        }
    },
}

# ============================================================
# 批量测试
# ============================================================

files = [
    ("黎明屯配送发货单", "12.25海口龙湖天街-配送发货单PS2512220005001(1).xlsx"),
    ("湖南仓发货明细", "湖南仓.xlsx"),
    ("欢乐牧场模板", "欢乐牧场模板0430.xlsx"),
    ("多门店分Sheet", "多门店分Sheet出库单.xlsx"),
    ("门店调拨单-卡片式", "门店调拨单-卡片式.xlsx"),
    ("黔寨寨配送单PDF", "黔寨寨贵州烙锅（鞍山店）常温.pdf"),
]

print("=" * 80)
print("  万能导入V2 — 考试需求精确验证 V2")
print("=" * 80)

results = {}

for name, filename in files:
    rule = rules.get(name)
    filepath = f"{DEMOS}/{filename}"
    
    print(f"\n{'─' * 60}")
    print(f"  文件: {name}")
    print(f"  规则: {rule['parser']['type']} 模式")
    
    try:
        with open(filepath, "rb") as f:
            r = requests.post(f"{BASE}/api/parse",
                files={"file": (filename, f)},
                data={"rule": json.dumps(rule, ensure_ascii=False)},
                timeout=60)
        
        if r.status_code != 200:
            print(f"  ❌ HTTP {r.status_code}: {r.text[:300]}")
            results[name] = {"rows": 0, "valid": 0, "errors": [f"HTTP {r.status_code}"]}
            continue
            
        d = r.json()
        rows = d.get("totalRows", 0)
        orders = d.get("orders", [])
        valid = sum(1 for o in orders if o.get("isValid"))
        
        results[name] = {"rows": rows, "valid": valid, "orders": orders}
        
        status_icon = "✅" if valid > 0 and rows > 0 else ("⚠️" if rows > 0 else "❌")
        print(f"  {status_icon} 解析: {rows}行 / 有效: {valid}行")
        
        # 有效行预览
        valid_orders = [o for o in orders if o.get("isValid")]
        print(f"  有效行预览 (前5):")
        for o in valid_orders[:5]:
            print(f"    [{o.get('sourceRow','?')}] "
                  f"orderNo={o.get('orderNo','-')} "
                  f"store={o.get('storeName','-')} "
                  f"item={o.get('itemName','-')} "
                  f"code={o.get('itemCode','-')} "
                  f"qty={o.get('quantity','-')} "
                  f"recv={o.get('receiverName','-')}")
        
        # 无效行展示
        invalid_orders = [o for o in orders if not o.get("isValid")]
        if invalid_orders:
            print(f"  无效行 ({len(invalid_orders)}):")
            for o in invalid_orders[:5]:
                print(f"    [{o.get('sourceRow','?')}] {o.get('validationErrors',[])}")
        
        # 错误信息
        if d.get("errors"):
            for e in d["errors"][:3]:
                print(f"  ❌ {e.get('message','')}")
    
    except Exception as e:
        results[name] = {"rows": 0, "valid": 0, "errors": [str(e)]}
        print(f"  💥 异常: {e}")

# ============================================================
# 汇总
# ============================================================
print("\n" + "=" * 80)
print("  汇总报告")
print("=" * 80)

total_rows = sum(r["rows"] for r in results.values())
total_valid = sum(r["valid"] for r in results.values())

for name, filename in files:
    r = results.get(name, {})
    rows = r.get("rows", "?")
    valid = r.get("valid", "?")
    status = "✅" if valid > 0 else ("⚠️" if rows > 0 else "❌")
    print(f"  {status} {name}: {rows}行解析 / {valid}行有效")

print(f"\n  总计: {total_rows}行解析 / {total_valid}行有效")
print(f"  通过率: {total_valid}/{total_rows} = {total_valid/total_rows*100:.0f}%" if total_rows > 0 else "  0%")

# 检查缺失文件
import os
missing = []
for f in ["门店配送确认单.docx", "周配送计划.xlsx"]:
    if not os.path.exists(f"{DEMOS}/{f}"):
        missing.append(f)
if missing:
    print(f"\n  ⚠️ 缺失测试文件: {', '.join(missing)}")
    print(f"     这2个文件对应的解析模式已就绪但无法验证")
