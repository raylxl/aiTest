"""
考试需求精确验证 V3 — 修复所有已知问题
修复点：
1. excel-parser.ts: 添加 header recipient 提取 + mapFieldName 补全
2. pdf-parser.ts: mapFieldName 补全
3. 规则配置：黎明屯用 header recipient；门店调拨单修复 cardField patterns
"""
import requests, json, time, os

BASE = "http://localhost:3000"
DEMOS = "D:/WorkBuddy-projects/aiTest/exam-demos/demos"

# ============================================================
# 精确规则配置 V3
# ============================================================
rules = {

    # ── 1. 黎明屯配送发货单 ──
    # 结构: row0=标题, row1=头部信息(收货机构在col1), row2=辅助信息, row3=表头(42列), row4-5=数据, row6+=合计/尾部
    # 收货门店在 row1 col1: "黎明屯铁锅炖（海口龙湖天街店）"
    "黎明屯配送发货单": {
        "name": "黎明屯配送发货单",
        "description": "42列配送发货单, 收货机构在头部row1",
        "fileTypes": ["excel"],
        "parser": {
            "type": "table",
            "table": {
                "headerRow": 3,
                "dataStartRow": 4,
                "dataEndRow": 6,
                "columns": [
                    {"sourceIndex": 0,  "targetField": "序号",       "dataType": "string"},
                    {"sourceIndex": 2,  "targetField": "物品编码",   "dataType": "string"},
                    {"sourceIndex": 3,  "targetField": "物品名称",   "dataType": "string"},
                    {"sourceIndex": 5,  "targetField": "规格型号",   "dataType": "string"},
                    {"sourceIndex": 14, "targetField": "发货数量",   "dataType": "number"},
                    {"sourceIndex": 15, "targetField": "发货单价",   "dataType": "number"},
                ]
            }
        },
        "recipient": {
            "source": "header",
            "fields": {
                "storeName": {"row": 1, "col": 1},
                "name":      {"pattern": "收货人手机号[：:]\\s*(\\S+)"},
                "phone":     {"pattern": "收货人手机号[：:]\\s*(\\d+)"},
                "address":   {"pattern": "收货地址[：:]\\s*(.+)"},
            }
        }
    },

    # ── 2. 湖南仓发货明细 ──
    # 结构: row0=说明文字, row1=表头, row2起=167行数据, 每行列0=收货机构(=storeName)
    "湖南仓发货明细": {
        "name": "湖南仓发货明细",
        "description": "32列, 收货机构在列0",
        "fileTypes": ["excel"],
        "parser": {
            "type": "table",
            "table": {
                "headerRow": 1,
                "dataStartRow": 2,
                "columns": [
                    {"sourceIndex": 0,  "targetField": "收货门店",   "dataType": "string"},
                    {"sourceIndex": 2,  "targetField": "运单号",     "dataType": "string"},
                    {"sourceIndex": 4,  "targetField": "物品分类",   "dataType": "string"},
                    {"sourceIndex": 5,  "targetField": "物品编码",   "dataType": "string"},
                    {"sourceIndex": 6,  "targetField": "物品名称",   "dataType": "string"},
                    {"sourceIndex": 8,  "targetField": "规格型号",   "dataType": "string"},
                    {"sourceIndex": 12, "targetField": "发货数量",   "dataType": "number"},
                ]
            }
        }
    },

    # ── 3. 欢乐牧场模板 ──
    # 结构: SKU行 × 门店列(13-17), 需要 matrix 模式
    # col0=仓库, col1=货主, col2=SKU名称, col3=SKU条码, col13=银泰, col14=金银潭, col15=金桥, col16=门店B, col17=门店D
    "欢乐牧场模板": {
        "name": "欢乐牧场矩阵",
        "description": "SKU×门店矩阵, 门店在col13-17",
        "fileTypes": ["excel"],
        "parser": {
            "type": "matrix",
            "matrix": {
                "headerRow": 0,
                "skuColumn": 2,
                "skuCodeColumn": 3,
                "storeColumns": [
                    {"index": 13, "storeName": "银泰"},
                    {"index": 14, "storeName": "金银潭"},
                    {"index": 15, "storeName": "金桥"},
                    {"index": 16, "storeName": "门店B"},
                    {"index": 17, "storeName": "门店D"},
                ]
            }
        }
    },

    # ── 4. 多门店分Sheet出库单 ──
    # 3个Sheet: "银泰店"/"金桥店"/"金银潭店", 每个Sheet row0=门店名, row3=表头, row4起=数据
    # 用 multi-sheet + allSheets, 并从 header 提取 storeName
    "多门店分Sheet": {
        "name": "多门店分Sheet",
        "description": "3个Sheet, 门店名在row0",
        "fileTypes": ["excel"],
        "parser": {
            "type": "multi-sheet",
            "allSheets": True,
            "table": {
                "headerRow": 3,
                "dataStartRow": 4,
                "columns": [
                    {"sourceIndex": 1,  "targetField": "物品编码",   "dataType": "string"},
                    {"sourceIndex": 2,  "targetField": "物品名称",   "dataType": "string"},
                    {"sourceIndex": 3,  "targetField": "规格型号",   "dataType": "string"},
                    {"sourceIndex": 5,  "targetField": "发货数量",   "dataType": "number"},
                ]
            }
        },
        "recipient": {
            "source": "header",
            "fields": {
                "storeName": {"row": 0, "col": 0},
            }
        }
    },

    # ── 5. 门店调拨单-卡片式 ──
    # 结构: ▶ 调拨记录 #N 为卡片起始, 非标准表格
    # row4: "调入门店 | 门店名 | 收货人 | 姓名 | 电话 | 号码"
    # row6起: 物品编码 | 物品名称 | 规格 | 数量
    "门店调拨单-卡片式": {
        "name": "门店调拨单卡片",
        "description": "卡片堆叠, ▶ 调拨记录 #N",
        "fileTypes": ["excel"],
        "parser": {
            "type": "card",
            "card": {
                "cardStartPattern": "▶\\s*调拨记录",
                "cardFields": [
                    {"pattern": "调入门店\\s+(\\S+)",       "field": "storeName"},
                    {"pattern": "收货人\\s+(\\S+)",       "field": "receiverName"},
                    {"pattern": "电话\\s+(\\d+)",          "field": "receiverPhone"},
                    {"pattern": "调拨单号[：:]\\s*(\\S+)", "field": "orderNo"},
                ],
                "itemTable": {
                    "headerRowOffset": 2,
                    "dataStartRowOffset": 3,
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

    # ── 6. 黔寨寨配送单PDF ──
    # PDF, 头部元信息+中间物品表格+底部收货人
    # 使用 text 模式（pdf2json 表格检测不稳定）
    "黔寨寨配送单PDF": {
        "name": "黔寨寨配送单PDF",
        "description": "PDF, text模式正则提取",
        "fileTypes": ["pdf"],
        "parser": {
            "type": "text",
            "text": {
                "patterns": [
                    {"field": "orderNo",      "regex": "(?:单据编号|配送单号|运单号)[：:]\\s*(\\S+)", "group": 1},
                    {"field": "storeName",    "regex": "收货机构[：:]\\s*(.+?)(?:\\s|$)",      "group": 1},
                    {"field": "receiverName", "regex": "收货人[：:]\\s*(\\S+)",             "group": 1},
                    {"field": "receiverPhone","regex": "(?:电话|手机)[：:]\\s*(\\d+)",    "group": 1},
                ],
                "itemPatterns": [
                    {"field": "itemCode",     "regex": "^\\s*(\\S+)\\s+",             "group": 1},
                    {"field": "itemName",     "regex": "^\\s*\\S+\\s+(\\S+)",        "group": 1},
                    {"field": "quantity",     "regex": "^\\s*\\S+\\s+\\S+\\s+(\\d+)", "group": 1},
                ]
            }
        }
    },
}

# ============================================================
# 批量测试
# ============================================================

files = [
    ("黎明屯配送发货单",       "12.25海口龙湖天街-配送发货单PS2512220005001(1).xlsx"),
    ("湖南仓发货明细",         "湖南仓.xlsx"),
    ("欢乐牧场模板",           "欢乐牧场模板0430.xlsx"),
    ("多门店分Sheet",         "多门店分Sheet出库单.xlsx"),
    ("门店调拨单-卡片式",     "门店调拨单-卡片式.xlsx"),
    ("黔寨寨配送单PDF",       "黔寨寨贵州烙锅（鞍山店）常温.pdf"),
]

print("=" * 80)
print("  万能导入V2 — 考试需求精确验证 V3")
print("=" * 80)

results = {}
any_error = False

for name, filename in files:
    rule = rules.get(name)
    filepath = f"{DEMOS}/{filename}"
    
    if not os.path.exists(filepath):
        print(f"\n  ❌ {name}: 文件不存在: {filepath}")
        results[name] = {"rows": 0, "valid": 0, "errors": ["文件不存在"]}
        continue
    
    print(f"\n{'─' * 60}")
    print(f"  📄 {name}")
    print(f"  规则模式: {rule['parser']['type']}")
    
    try:
        with open(filepath, "rb") as f:
            r = requests.post(
                f"{BASE}/api/parse",
                files={"file": (filename, f)},
                data={"rule": json.dumps(rule, ensure_ascii=False)},
                timeout=60
            )
        
        if r.status_code != 200:
            print(f"  ❌ HTTP {r.status_code}: {r.text[:200]}")
            results[name] = {"rows": 0, "valid": 0, "errors": [f"HTTP {r.status_code}"]}
            any_error = True
            continue
            
        d = r.json()
        rows = d.get("totalRows", 0)
        orders = d.get("orders", [])
        valid = sum(1 for o in orders if o.get("isValid"))
        invalid = [o for o in orders if not o.get("isValid")]
        
        results[name] = {"rows": rows, "valid": valid, "orders": orders, "invalid": invalid}
        
        status = "✅" if valid > 0 else ("⚠️" if rows > 0 else "❌")
        print(f"  {status} 解析: {rows}行 / 有效: {valid}行 / 无效: {len(invalid)}行")
        
        # 有效行预览
        if valid > 0:
            print(f"  📋 有效行预览 (前3):")
            for o in orders[:3]:
                if o.get("isValid"):
                    print(f"    [{o.get('sourceRow','?')}] "
                          f"orderNo={o.get('orderNo','-')} "
                          f"store={o.get('storeName','-')} "
                          f"item={o.get('itemName','-')} "
                          f"code={o.get('itemCode','-')} "
                          f"qty={o.get('quantity','-')} "
                          f"recv={o.get('receiverName','-')}")
        
        # 无效行原因
        if invalid:
            print(f"  ⚠️  无效行原因 (前5):")
            shown = {}
            for o in invalid[:10]:
                errs = o.get("validationErrors", [])
                key = str(errs)
                if key not in shown:
                    shown[key] = True
                    print(f"    [{o.get('sourceRow','?')}] {' | '.join(errs[:2])}")
        
        if d.get("errors"):
            for e in d["errors"][:3]:
                print(f"  ⚠️  {e.get('message','')}")
    
    except Exception as e:
        results[name] = {"rows": 0, "valid": 0, "errors": [str(e)]}
        print(f"  💥 异常: {e}")
        any_error = True

# ============================================================
# 汇总报告
# ============================================================
print(f"\n{'=' * 80}")
print(f"  汇总报告")
print(f"{'=' * 80}")

total_rows = sum(r.get("rows", 0) for r in results.values())
total_valid = sum(r.get("valid", 0) for r in results.values())
total_invalid = sum(len(r.get("invalid", [])) for r in results.values())

for name, _ in files:
    r = results.get(name, {})
    rows = r.get("rows", "?")
    valid = r.get("valid", "?")
    inv = len(r.get("invalid", []))
    if valid > 0:
        status = "✅"
    elif rows > 0:
        status = "⚠️"
    else:
        status = "❌"
    print(f"  {status} {name}: {rows}行解析 / {valid}行有效 / {inv}行无效")

print(f"\n  📊 总计: {total_rows}行解析 / {total_valid}行有效 / {total_invalid}行无效")
if total_rows > 0:
    rate = total_valid / total_rows * 100
    print(f"  📈 通过率: {total_valid}/{total_rows} = {rate:.0f}%")
else:
    print(f"  📈 通过率: 0%")

# 缺失文件检查
missing = []
for f in ["门店配送确认单.docx", "周配送计划.xlsx", "配送签收单(多单PDF).pdf"]:
    if not os.path.exists(f"{DEMOS}/{f}"):
        missing.append(f)
if missing:
    print(f"\n  ⚠️  缺失测试文件 ({len(missing)}个):")
    for f in missing:
        print(f"     - {f}")
    print(f"     → 对应解析模式已就绪但无法验证")

print(f"\n{'=' * 80}")
