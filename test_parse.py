#!/usr/bin/env python3
"""万能导入解析功能验证报告 v3 - 最终版"""
import json, requests, os, sys

BASE_URL = "http://localhost:3000"
DEMOS_DIR = r"D:\WorkBuddy-projects\aiTest\exam-demos\demos"

TESTS = [
    # 1. 配送发货单 - 标题+元数据+表头+数据
    {
        "file": "12.25海口龙湖天街-配送发货单PS2512220005001(1).xlsx",
        "type": "excel",
        "rule": {
            "name": "配送发货单", "fileTypes": ["excel"],
            "parser": {
                "type": "table",
                "table": {
                    "headerRow": 3, "dataStartRow": 4, "skipRows": [6],
                    "columns": [
                        {"sourceIndex": 2, "targetField": "物品编码", "dataType": "string"},
                        {"sourceIndex": 3, "targetField": "物品名称", "dataType": "string"},
                        {"sourceIndex": 5, "targetField": "规格型号", "dataType": "string"},
                        {"sourceIndex": 14, "targetField": "发货数量", "dataType": "number"},
                    ]
                }
            },
            "recipient": {"source": "footer", "fields": {}}
        }
    },
    # 2. 湖南仓 - 标准出库单
    {
        "file": "湖南仓.xlsx",
        "type": "excel",
        "rule": {
            "name": "湖南仓出库单", "fileTypes": ["excel"],
            "parser": {
                "type": "table",
                "table": {
                    "headerRow": 1, "dataStartRow": 2,
                    "columns": [
                        {"sourceIndex": 5, "targetField": "物品编码", "dataType": "string"},
                        {"sourceIndex": 6, "targetField": "物品名称", "dataType": "string"},
                        {"sourceIndex": 8, "targetField": "规格型号", "dataType": "string"},
                        {"sourceIndex": 12, "targetField": "发货数量", "dataType": "number"},
                        {"sourceIndex": 26, "targetField": "收货人", "dataType": "string"},
                        {"sourceIndex": 27, "targetField": "收货人电话", "dataType": "string"},
                        {"sourceIndex": 28, "targetField": "收货地址", "dataType": "string"},
                    ]
                }
            }
        }
    },
    # 3. 欢乐牧场模板 - 库存+门店矩阵
    {
        "file": "欢乐牧场模板0430.xlsx",
        "type": "excel",
        "rule": {
            "name": "欢乐牧场库存模板", "fileTypes": ["excel"],
            "parser": {
                "type": "table",
                "table": {
                    "headerRow": 0, "dataStartRow": 1,
                    "columns": [
                        {"sourceIndex": 3, "targetField": "SKU条码", "dataType": "string"},
                        {"sourceIndex": 2, "targetField": "SKU名称", "dataType": "string"},
                        {"sourceIndex": 6, "targetField": "库存单位", "dataType": "string"},
                        {"sourceIndex": 7, "targetField": "规格", "dataType": "string"},
                    ]
                }
            }
        }
    },
    # 4. 多门店分Sheet - 每个Sheet一个门店
    {
        "file": "多门店分Sheet出库单.xlsx",
        "type": "excel",
        "rule": {
            "name": "多门店分Sheet", "fileTypes": ["excel"],
            "parser": {
                "type": "multi-sheet",
                "table": {
                    "headerRow": 3, "dataStartRow": 4,
                    "columns": [
                        {"sourceIndex": 1, "targetField": "物品编码", "dataType": "string"},
                        {"sourceIndex": 2, "targetField": "物品名称", "dataType": "string"},
                        {"sourceIndex": 3, "targetField": "规格型号", "dataType": "string"},
                        {"sourceIndex": 4, "targetField": "单位", "dataType": "string"},
                        {"sourceIndex": 5, "targetField": "出库数量", "dataType": "number"},
                    ]
                }
            },
            "recipient": {"source": "footer", "fields": {}}
        }
    },
    # 5. 门店调拨单-卡片式
    {
        "file": "门店调拨单-卡片式.xlsx",
        "type": "excel",
        "rule": {
            "name": "门店调拨单卡片式", "fileTypes": ["excel"],
            "parser": {
                "type": "card",
                "card": {
                    "cardStartPattern": "▶ 调拨记录",
                    "cardFields": [
                        {"sourceIndex": 1, "targetField": "收货人", "labelPattern": "调入门店"},
                        {"sourceIndex": 3, "targetField": "收货人", "labelPattern": "收货人"},
                        {"sourceIndex": 5, "targetField": "电话", "labelPattern": "电话"},
                    ],
                    "itemHeaderRow": 0,
                    "itemColumns": [
                        {"sourceIndex": 0, "targetField": "物品编码", "dataType": "string"},
                        {"sourceIndex": 1, "targetField": "物品名称", "dataType": "string"},
                        {"sourceIndex": 2, "targetField": "规格型号", "dataType": "string"},
                        {"sourceIndex": 3, "targetField": "数量", "dataType": "number"},
                    ]
                }
            }
        }
    },
    # 6. test.pdf - PDF
    {
        "file": "test.pdf",
        "type": "pdf",
        "rule": {
            "name": "PDF表格解析", "fileTypes": ["pdf"],
            "parser": {"type": "table", "table": {"headerRow": "auto", "dataStartRow": "auto", "columns": []}}
        }
    },
    # 7. 黔寨寨PDF
    {
        "file": "黔寨寨贵州烙锅（鞍山店）常温.pdf",
        "type": "pdf",
        "rule": {
            "name": "黔寨寨PDF", "fileTypes": ["pdf"],
            "parser": {"type": "table", "table": {"headerRow": "auto", "dataStartRow": "auto", "columns": []}}
        }
    },
]


def test_parse(filepath, filename, rule):
    with open(filepath, "rb") as f:
        resp = requests.post(BASE_URL + "/api/parse",
            files={"file": (filename, f)},
            data={"rule": json.dumps(rule, ensure_ascii=False)})
    return resp.json()


def test_sample(filepath, filename):
    with open(filepath, "rb") as f:
        resp = requests.post(BASE_URL + "/api/extract-sample",
            files={"file": (filename, f)})
    return resp.json()


def fmt(o):
    p = []
    if o.get("itemCode"): p.append(f"编码={o['itemCode']}")
    if o.get("itemName"): p.append(f"名称={o['itemName']}")
    if o.get("quantity") is not None: p.append(f"数量={o['quantity']}")
    if o.get("receiverName"): p.append(f"收货={o['receiverName']}")
    if o.get("receiverPhone"): p.append(f"电话={o['receiverPhone']}")
    if o.get("receiverAddress"): p.append(f"地址={o['receiverAddress'][:15]}...") if o.get("receiverAddress") and len(o.get("receiverAddress",""))>15 else None
    if o.get("storeName"): p.append(f"门店={o['storeName']}")
    if o.get("specification"): p.append(f"规格={o['specification']}")
    ef = o.get("extraFields") or {}
    ef_filtered = {k: v for k, v in ef.items() if v and v != ""}
    if ef_filtered and not o.get("itemName"):
        ef_s = ", ".join(f"{k}={v}" for k, v in list(ef_filtered.items())[:3])
        p.append(f"extra({ef_s})")
    return ", ".join(p) if p else "(空)"


def main():
    print("=" * 80)
    print("万能导入解析功能验证报告")
    print("=" * 80)

    results = []
    all_orders = []

    for test in TESTS:
        fn = test["file"]
        fp = os.path.join(DEMOS_DIR, fn)
        if not os.path.exists(fp):
            print(f"\n[SKIP] {fn} - 不存在")
            results.append({"file": fn, "status": "SKIP"})
            continue

        print(f"\n{'─' * 60}")
        print(f"[{test['type'].upper()}] {fn}")

        # 样本提取
        s = test_sample(fp, fn)
        if not s.get("success"):
            print(f"  ✗ 样本失败: {s.get('error')}")
            results.append({"file": fn, "status": "FAIL", "error": s.get("error")})
            continue

        # 解析
        r = test_parse(fp, fn, test["rule"])
        if not r.get("success"):
            print(f"  ✗ 解析失败: {'; '.join(r.get('errors',[]))}")
            results.append({"file": fn, "status": "FAIL", "error": "parse failed"})
            continue

        orders = r.get("orders", [])
        total = len(orders)
        valid = sum(1 for o in orders if o.get("isValid"))
        t = r.get("metadata", {}).get("parseTime", 0)

        status_icon = "✓" if valid == total and total > 0 else ("⚠" if total > 0 else "○")
        print(f"  {status_icon} 解析成功 | 总行数: {total} | 有效: {valid} | 无效: {total-valid} | {t}ms")

        for o in orders[:4]:
            icon = "✓" if o.get("isValid") else "✗"
            print(f"    [{o.get('sourceRow','?')}] {icon} {fmt(o)}")
            for e in (o.get("validationErrors") or [])[:2]:
                print(f"         └ {e}")

        all_orders.extend(orders)
        results.append({"file": fn, "type": test["type"], "rows": total, "valid": valid, "time": t})

    # 汇总
    print(f"\n{'=' * 80}")
    print("验证结果汇总")
    print("=" * 80)
    print(f"{'#':<3} {'文件':<42} {'类型':<7} {'行数':>5} {'有效':>5} {'状态':<6}")
    print("-" * 72)
    for i, r in enumerate(results, 1):
        name = r["file"][:40]
        rows = r.get("rows", "-")
        valid = r.get("valid", "-")
        st = "✓" if rows != "-" and rows > 0 and r.get("valid", 0) == rows else ("⚠" if rows != "-" and rows > 0 else "○")
        print(f"{i:<3} {name:<42} {r.get('type','-'):<7} {str(rows):>5} {str(valid):>5} {st:<6}")

    total_files = len(TESTS)
    passed = sum(1 for r in results if r.get("rows", 0) > 0)
    fully_valid = sum(1 for r in results if r.get("rows", 0) > 0 and r.get("valid", 0) == r.get("rows", 0))
    
    print(f"\n核心解析引擎: {passed}/{total_files} 文件成功解析数据行")
    print(f"完全有效数据: {fully_valid}/{total_files} 文件所有行通过校验")
    print(f"总计解析记录: {len(all_orders)} 条")
    print(f"有效记录: {sum(1 for o in all_orders if o.get('isValid'))}/{len(all_orders)}")

    return 0

if __name__ == "__main__":
    sys.exit(main())
