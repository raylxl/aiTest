import json
import os
import time
from pathlib import Path

import requests

BASE = os.environ.get('BASE_URL', 'http://127.0.0.1:3000')
RULE = {
    "name": "性能测试-湖南仓1000单",
    "description": "基于湖南仓结构的1000单性能验证规则",
    "fileTypes": ["excel"],
    "identifier": {},
    "parser": {
        "type": "table",
        "table": {
            "headerRow": 1,
            "dataStartRow": 2,
            "columns": [
                {"sourceIndex": 0, "targetField": "收货门店", "dataType": "string"},
                {"sourceIndex": 2, "targetField": "运单号", "dataType": "string"},
                {"sourceIndex": 5, "targetField": "物品编码", "dataType": "string"},
                {"sourceIndex": 6, "targetField": "物品名称", "dataType": "string"},
                {"sourceIndex": 8, "targetField": "规格型号", "dataType": "string"},
                {"sourceIndex": 12, "targetField": "发货数量", "dataType": "number"}
            ]
        }
    }
}

file_path = Path(r"d:/WorkBuddy-projects/aiTest/perf-1000-hunan.xlsx")
if not file_path.exists():
    raise SystemExit(f"测试文件不存在: {file_path}")

with file_path.open('rb') as f:
    start = time.perf_counter()
    resp = requests.post(
        f"{BASE}/api/parse",
        files={"file": (file_path.name, f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        data={"rule": json.dumps(RULE, ensure_ascii=False)},
        timeout=120,
    )
    elapsed = time.perf_counter() - start

result = {
    "status_code": resp.status_code,
    "elapsed_seconds": round(elapsed, 3),
}

try:
    body = resp.json()
except Exception:
    body = {"raw": resp.text[:1000]}

result["body"] = body
print(json.dumps(result, ensure_ascii=False))
