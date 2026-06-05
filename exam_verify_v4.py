"""
考试需求精确验证 V4 — 修复空行+PDF列索引
修复点：
1. 多门店分Sheet: 加 dataEndRow，跳过尾部空行
2. 门店调拨单: 修复 card itemTable 的 headerRowOffset
3. 黔寨寨PDF: 使用 table 模式 + 正确列索引
"""
import requests, json, time, os

BASE = "http://localhost:3000"
DEMOS = "D:/WorkBuddy-projects/aiTest/exam-demos/demos"

rules = {

    "黎明屯配送发货单": {
        "name": "黎明屯配送发货单",
        "description": "42列, 收货机构在row1 col1",
        "fileTypes": ["excel"],
        "parser": {
            "type": "table",
            "table": {
                "headerRow": 3,
                "dataStartRow": 4,
                "dataEndRow": 6,
                "columns": [
                    {"sourceIndex": 2, "targetField": "物品编码", "dataType": "string"},
                    {"sourceIndex": 3, "targetField": "物品名称", "dataType": "string"},
                    {"sourceIndex": 5, "targetField": "规格型号", "dataType": "string"},
                    {"sourceIndex": 14, "targetField": "发货数量", "dataType": "number"},
                ]
            }
        },
        "recipient": {
            "source": "header",
            "fields": {
                "storeName": {"row": 1, "col": 1},
            }
        }
    },

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
                    {"sourceIndex": 0, "targetField": "收货门店", "dataType": "string"},
                    {"sourceIndex": 2, "targetField": "运单号",   "dataType": "string"},
                    {"sourceIndex": 5, "targetField": "物品编码", "dataType": "string"},
                    {"sourceIndex": 6, "targetField": "物品名称", "dataType": "string"},
                    {"sourceIndex": 8, "targetField": "规格型号", "dataType": "string"},
                    {"sourceIndex": 12, "targetField": "发货数量", "dataType": "number"},
                ]
            }
        }
    },

    "欢乐牧场模板": {
        "name": "欢乐牧场矩阵",
        "description": "SKU×门店矩阵, storeColumns=13-17",
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

    "多门店分Sheet": {
        "name": "多门店分Sheet",
        "description": "3个Sheet, 每Sheet行1=标题, 行4=表头, 行5-14=数据, 行15+=空",
        "fileTypes": ["excel"],
        "parser": {
            "type": "multi-sheet",
            "allSheets": True,
            "table": {
                "headerRow": 3,
                "dataStartRow": 4,
                "dataEndRow": 14,
                "columns": [
                    {"sourceIndex": 1, "targetField": "物品编码", "dataType": "string"},
                    {"sourceIndex": 2, "targetField": "物品名称", "dataType": "string"},
                    {"sourceIndex": 3, "targetField": "规格型号", "dataType": "string"},
                    {"sourceIndex": 5, "targetField": "发货数量", "dataType": "number"},
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

    "黔寨寨配送单PDF": {
        "name": "黔寨寨配送单PDF",
        "description": "PDF表格模式, 使用pdf2json表格检测",
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
                "storeName": {"pattern": "收货机构[：:]\\s*(.+)"},
                "name":      {"pattern": "收货人[：:]\\s*(\\S+)"},
                "phone":     {"pattern": "收货人手机号[：:]\\s*(\\d+)"},
            }
        }
    },
}

# ==========================================================
# 批量测试
# ==========================================================

files = [
    ("黎明屯配送发货单",   "12.25海口龙湖天街-配送发货单PS2512220005001(1).xlsx"),
    ("湖南仓发货明细",     "湖南仓.xlsx"),
    ("欢乐牧场模板",       "欢乐牧场模板0430.xlsx"),
    ("多门店分Sheet",     "多门店分Sheet出库单.xlsx"),
    ("门店调拨单-卡片式", "门店调拨单-卡片式.xlsx"),
    ("黔寨寨配送单PDF",   "黔寨寨贵州烙锅（鞍山店）常温.pdf"),
]

print("=" * 80)
print("  万能导入V2 — 考试需求精确验证 V4")
print("=" * 80)

results = {}
any_error = False

for name, filename in files:
    rule = rules.get(name)
    filepath = f"{DEMOS}/{filename}"

    if not os.path.exists(filepath):
        print(f"\n❌ {name}: 文件不存在")
        results[name] = {"rows": 0, "valid": 0}
        continue

    print(f"\n{'─' * 60}")
    print(f"  📂 {name}")
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
            results[name] = {"rows": 0, "valid": 0}
            continue

        d = r.json()
        rows   = d.get("totalRows", 0)
        orders = d.get("orders", [])
        valid  = sum(1 for o in orders if o.get("isValid"))
        inv    = [o for o in orders if not o.get("isValid")]
        results[name] = {"rows": rows, "valid": valid, "inv": inv, "orders": orders}

        status = "✅" if valid > 0 else ("⚠️" if rows > 0 else "❌")
        print(f"  {status} 解析: {rows}行 / 有效: {valid}行 / 无效: {len(inv)}行")

        if valid > 0:
            print(f"  有效行预览 (前3):")
            for o in orders[:3]:
                if o.get("isValid"):
                    print(f"    [{o.get('sourceRow','?')}] "
                          f"orderNo={o.get('orderNo','-')} "
                          f"store={o.get('storeName','-')} "
                          f"item={o.get('itemName','-')} "
                          f"qty={o.get('quantity','-')} "
                          f"recv={o.get('receiverName','-')}")

        if inv:
            print(f"  无效行原因 (前3):")
            shown = set()
            for o in inv[:10]:
                errs = tuple(o.get("validationErrors", []))
                if errs not in shown:
                    shown.add(errs)
                    print(f"    [{o.get('sourceRow','?')}] {' | '.join(errs[:2])}")

    except Exception as e:
        print(f"  💥 异常: {e}")
        results[name] = {"rows": 0, "valid": 0, "err": str(e)}
        any_error = True

# ==========================================================
# 汇总
# ==========================================================
print(f"\n{'=' * 80}")
print(f"  汇总报告")
print(f"{'=' * 80}")

total_rows   = sum(r.get("rows",   0) for r in results.values())
total_valid  = sum(r.get("valid",  0) for r in results.values())
total_inv    = sum(len(r.get("inv", [])) for r in results.values())

for name, _ in files:
    r = results.get(name, {})
    rows  = r.get("rows",  "?")
    valid = r.get("valid", "?")
    inv   = len(r.get("inv", []))
    if valid > 0:
        status = "✅"
    elif rows > 0:
        status = "⚠️"
    else:
        status = "❌"
    print(f"  {status} {name}: {rows}行解析 / {valid}行有效 / {inv}行无效")

print(f"\n  📊 总计: {total_rows}行解析 / {total_valid}行有效 / {total_inv}行无效")
if total_rows > 0:
    rate = total_valid / total_rows * 100
    print(f"  📈 通过率: {total_valid}/{total_rows} = {rate:.0f}%")

# 缺失文件
missing = []
for f in ["门店配送确认单.docx", "周配送计划.xlsx", "配送签收单(多单PDF).pdf"]:
    if not os.path.exists(f"{DEMOS}/{f}"):
        missing.append(f)
if missing:
    print(f"\n  ⚠️ 缺失测试文件 ({len(missing)}个):")
    for f in missing:
        print(f"     - {f}")

print(f"\n{'=' * 80}")
