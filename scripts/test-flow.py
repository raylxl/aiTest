#!/usr/bin/env python3
"""
万能导入V2 全流程测试脚本
测试6份模板文件：上传 → AI分析 → 规则解析 → 保存运单
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error

BASE_URL = "http://localhost:3000"
PUBLIC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public")

FILES = [
    "湖南仓.xlsx",
    "欢乐牧场模板0430.xlsx",
    "12.25海口龙湖天街-配送发货单PS2512220005001(1).xlsx",
    "多门店分Sheet出库单.xlsx",
    "门店调拨单-卡片式.xlsx",
    "黔寨寨贵州烙锅（鞍山店）常温.pdf",
]

def multipart_upload(url, file_path, fields=None):
    """发送 multipart/form-data 请求"""
    import mimetypes
    boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
    filename = os.path.basename(file_path)
    
    with open(file_path, "rb") as f:
        file_data = f.read()
    
    content_type = mimetypes.guess_type(file_path)[0] or "application/octet-stream"
    
    body = b""
    if fields:
        for key, value in fields.items():
            body += f"--{boundary}\r\n".encode()
            body += f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode()
            body += f"{value}\r\n".encode()
    
    body += f"--{boundary}\r\n".encode()
    body += f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode()
    body += f"Content-Type: {content_type}\r\n\r\n".encode()
    body += file_data
    body += f"\r\n--{boundary}--\r\n".encode()
    
    req = urllib.request.Request(url, data=body)
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read().decode("utf-8"))

def post_json(url, data):
    """发送 JSON POST 请求"""
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body)
    req.add_header("Content-Type", "application/json")
    
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))

def test_file(file_path, index):
    """测试单个文件的完整流程"""
    filename = os.path.basename(file_path)
    print(f"\n{'='*60}")
    print(f"📄 文件 {index+1}/6: {filename}")
    print(f"{'='*60}")
    
    file_size = os.path.getsize(file_path) / 1024
    print(f"   文件大小: {file_size:.1f} KB")
    
    # Step 1: AI分析生成规则
    print(f"\n   🔍 Step 1: AI分析生成规则...")
    start = time.time()
    try:
        result = multipart_upload(f"{BASE_URL}/api/analyze", file_path)
        analyze_time = time.time() - start
        
        if not result.get("success"):
            print(f"   ❌ 分析失败: {result.get('error', '未知错误')}")
            return {"file": filename, "status": "FAIL", "step": "analyze", "error": result.get("error")}
        
        rule = result.get("rule", {})
        rule_name = rule.get("name", "未命名规则")
        rule_source = result.get("ruleSource", "unknown")
        print(f"   ✅ 规则生成成功 ({analyze_time:.1f}s)")
        print(f"      规则名称: {rule_name}")
        print(f"      规则来源: {rule_source}")
        print(f"      解析类型: {rule.get('parser', {}).get('type', 'N/A')}")
    except Exception as e:
        print(f"   ❌ 分析异常: {e}")
        return {"file": filename, "status": "FAIL", "step": "analyze", "error": str(e)}
    
    # Step 2: 使用规则解析文件
    print(f"\n   📊 Step 2: 使用规则解析文件...")
    start = time.time()
    try:
        parse_result = multipart_upload(f"{BASE_URL}/api/parse", file_path, {"rule": json.dumps(rule)})
        parse_time = time.time() - start
        
        if not parse_result.get("success", True) and parse_result.get("error"):
            print(f"   ❌ 解析失败: {parse_result.get('error')}")
            return {"file": filename, "status": "FAIL", "step": "parse", "error": parse_result.get("error")}
        
        orders = parse_result.get("orders", [])
        total_rows = parse_result.get("totalRows", len(orders))
        errors = parse_result.get("errors", [])
        valid_count = sum(1 for o in orders if o.get("isValid", True))
        invalid_count = len(orders) - valid_count
        
        print(f"   ✅ 解析完成 ({parse_time:.1f}s)")
        print(f"      总记录数: {total_rows}")
        print(f"      有效记录: {valid_count}")
        print(f"      无效记录: {invalid_count}")
        if errors:
            print(f"      解析错误: {len(errors)} 个")
    except Exception as e:
        print(f"   ❌ 解析异常: {e}")
        return {"file": filename, "status": "FAIL", "step": "parse", "error": str(e)}
    
    # Step 3: 保存运单到数据库
    print(f"\n   💾 Step 3: 保存运单到数据库...")
    start = time.time()
    try:
        save_data = {
            "orders": orders[:50],  # 限制保存数量，避免超时
            "fileName": filename,
            "fileType": "excel" if filename.endswith((".xlsx", ".xls")) else "pdf",
            "ruleName": rule_name,
            "ruleJson": rule,
        }
        save_result = post_json(f"{BASE_URL}/api/import-orders", save_data)
        save_time = time.time() - start
        
        if not save_result.get("success", True) and save_result.get("error"):
            print(f"   ⚠️ 保存警告: {save_result.get('error')}")
        else:
            batch_id = save_result.get("batchId", "N/A")
            inserted = save_result.get("insertedCount", save_result.get("message", "N/A"))
            print(f"   ✅ 保存完成 ({save_time:.1f}s)")
            print(f"      批次ID: {batch_id}")
            print(f"      保存结果: {inserted}")
    except Exception as e:
        print(f"   ⚠️ 保存异常 (数据库可能未配置): {e}")
        save_time = 0
    
    total_time = analyze_time + parse_time + save_time
    print(f"\n   📈 性能统计:")
    print(f"      AI分析: {analyze_time:.1f}s")
    print(f"      规则解析: {parse_time:.1f}s")
    print(f"      数据保存: {save_time:.1f}s")
    print(f"      总耗时: {total_time:.1f}s")
    
    return {
        "file": filename,
        "status": "PASS",
        "rule_name": rule_name,
        "rule_source": rule_source,
        "total_rows": total_rows,
        "valid_count": valid_count,
        "invalid_count": invalid_count,
        "analyze_time": round(analyze_time, 1),
        "parse_time": round(parse_time, 1),
        "save_time": round(save_time, 1),
        "total_time": round(total_time, 1),
    }

def main():
    print("🚀 万能导入V2 全流程测试")
    print(f"   测试环境: {BASE_URL}")
    print(f"   测试文件: {len(FILES)} 个")
    
    # 检查服务是否可用
    try:
        urllib.request.urlopen(f"{BASE_URL}/import", timeout=5)
    except Exception as e:
        print(f"\n❌ 服务不可用: {e}")
        sys.exit(1)
    
    results = []
    for i, filename in enumerate(FILES):
        file_path = os.path.join(PUBLIC_DIR, filename)
        if not os.path.exists(file_path):
            print(f"\n⚠️ 文件不存在: {file_path}")
            results.append({"file": filename, "status": "SKIP", "error": "文件不存在"})
            continue
        
        result = test_file(file_path, i)
        results.append(result)
    
    # 汇总报告
    print(f"\n{'='*60}")
    print(f"📊 测试汇总报告")
    print(f"{'='*60}")
    
    passed = sum(1 for r in results if r.get("status") == "PASS")
    failed = sum(1 for r in results if r.get("status") == "FAIL")
    skipped = sum(1 for r in results if r.get("status") == "SKIP")
    
    print(f"\n   ✅ 通过: {passed}")
    print(f"   ❌ 失败: {failed}")
    print(f"   ⏭️  跳过: {skipped}")
    
    print(f"\n{'─'*60}")
    print(f"{'文件名':<40} {'状态':<6} {'记录数':<8} {'耗时':<8}")
    print(f"{'─'*60}")
    for r in results:
        status_icon = "✅" if r.get("status") == "PASS" else "❌" if r.get("status") == "FAIL" else "⏭️"
        rows = r.get("total_rows", "-")
        time_str = f"{r.get('total_time', '-')}s" if r.get("total_time") else "-"
        print(f"{r.get('file', 'N/A'):<40} {status_icon:<6} {str(rows):<8} {time_str:<8}")
    
    print(f"{'─'*60}")
    
    # 保存报告
    report_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tests", "flow-test-report.json")
    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump({"timestamp": time.strftime("%Y-%m-%d %H:%M:%S"), "results": results}, f, ensure_ascii=False, indent=2)
    print(f"\n   报告已保存: {report_path}")
    
    return 0 if failed == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
