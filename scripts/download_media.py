#!/usr/bin/env python3
"""
下载 exercises_library 所有图片和视频资源到本地目录。
用法: python3 download_media.py
"""

import os, sys, re, urllib.request, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

# ============================================================
# 配置
# ============================================================
SQL_FILE    = os.path.join(os.path.dirname(__file__), "..", "docs", "exercises_library_migrated.sql")
OUT_DIR     = os.path.join(os.path.dirname(__file__), "..", "media")
IMG_DIR     = os.path.join(OUT_DIR, "images")
VID_DIR     = os.path.join(OUT_DIR, "videos")

MAX_WORKERS_IMG = 10
MAX_WORKERS_VID = 3
TIMEOUT_SEC     = 60
MAX_RETRIES     = 3
RETRY_DELAY     = 5

counter_lock = Lock()

# ============================================================
# 解析 SQL 文件
# ============================================================
def parse_urls():
    with open(SQL_FILE, encoding="utf-8") as f:
        content = f.read()

    vals_match = re.search(r'VALUES\s+(.+);', content, re.DOTALL)
    if not vals_match:
        print("ERROR: 无法找到 VALUES 语句"); sys.exit(1)

    raw  = vals_match.group(1)
    rows = re.split(r'\),\s*\(', raw)
    img_urls, vid_urls = [], []

    for row in rows:
        fields = _split_fields(row)
        if len(fields) < 9:
            continue
        row_id = fields[0].strip().lstrip('(')
        img    = _clean_url(fields[2].strip())
        vid    = _clean_url(fields[4].strip())
        if img: img_urls.append((row_id, img))
        if vid: vid_urls.append((row_id, vid))

    return img_urls, vid_urls

def _split_fields(row):
    fields, current, in_str = [], '', False
    i = 0
    while i < len(row):
        ch, nxt = row[i], row[i+1] if i+1 < len(row) else ''
        if ch == "'" and nxt == "'":
            current += "''"; i += 2; continue
        if ch == "'":
            in_str = not in_str
        elif ch == ',' and not in_str:
            fields.append(current); current = ''; i += 1; continue
        current += ch; i += 1
    fields.append(current)
    return fields

def _clean_url(s):
    s = s.strip()
    if s.upper() in ('NULL', ''): return None
    if s.startswith("'") and s.endswith("'"): s = s[1:-1]
    # 跳过含空格/换行等异常字符的 URL（表示解析错误）
    if any(c in s for c in '\n\r\t') or ' ' in s and not s.startswith('http'):
        return None
    return s

# ============================================================
# 下载单个文件
# ============================================================
def download_file(row_id, url, out_dir, ext):
    raw_url = url.strip()
    if not raw_url or raw_url.upper() == 'NULL': return ("skip", raw_url)

    # 路径空格 %20 编码后 urllib 才能正确处理
    url = raw_url.replace(' ', '%20')

    # 用原始 URL 提取文件名（%20 → space，保持可读文件名）
    fname = raw_url.split('/')[-1].split('?')[0]
    if not fname or len(fname) < 4:
        fname = f"{row_id}_{ext}"

    url_ext = os.path.splitext(fname)[1].lower()
    if not url_ext:
        fname += '.png' if ext == 'img' else '.mp4'
    else:
        # 保留 URL 原文件名（含空格），后续上传时再处理
        pass

    out_path = os.path.join(out_dir, fname)

    if os.path.exists(out_path):
        return ("skip", url)

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Referer": "https://apilyfta.com/",
    }

    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=TIMEOUT_SEC) as resp:
                data = resp.read()
            with open(out_path, 'wb') as f:
                f.write(data)
            return ("ok", url, len(data))
        except Exception as e:
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY)
            else:
                return ("err", url, str(e))

# ============================================================
# 主流程
# ============================================================
def run_batch(label, urls, out_dir, ext, workers, total_ref):
    start = time.time()
    ok, skip, err = 0, 0, 0

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(download_file, row_id, url, out_dir, ext): (row_id, url)
                   for row_id, url in urls}
        for future in as_completed(futures):
            rtype = future.result()[0]
            if   rtype == "ok":   ok   += 1
            elif rtype == "skip": skip += 1
            else:                 err  += 1
            done = ok + skip + err
            pct    = f"{done/len(urls)*100:.1f}%"
            elapsed = time.time() - start
            rate   = done / elapsed if elapsed > 0 else 0
            remain = (len(urls) - done) / rate if rate > 0 else 0
            print(f"\r[{label}] {done}/{len(urls)} ({pct}) | {rate:.1f}/s | 剩余 ~{remain/60:.0f}min    ", end='', flush=True)
            if rtype == "err":
                print(f"\n  [ERR] {future.result()[1]}: {future.result()[2]}")

    elapsed = time.time() - start
    print(f"\n{label}完成！成功 {ok} 跳过 {skip} 失败 {err} 耗时 {elapsed:.0f}s")
    return ok, skip, err

def main():
    os.makedirs(IMG_DIR, exist_ok=True)
    os.makedirs(VID_DIR, exist_ok=True)

    print("解析 SQL 文件...")
    img_urls, vid_urls = parse_urls()
    print(f"图片: {len(img_urls)} 个, 视频: {len(vid_urls)} 个")

    print(f"\n开始下载图片 → {IMG_DIR}")
    img_ok, img_skip, img_err = run_batch("图片", img_urls, IMG_DIR, 'img', MAX_WORKERS_IMG, len(img_urls))

    print(f"\n开始下载视频 → {VID_DIR}")
    vid_ok, vid_skip, vid_err = run_batch("视频", vid_urls, VID_DIR, 'vid', MAX_WORKERS_VID, len(vid_urls))

    def real_size(d):
        if not os.path.exists(d): return 0
        return sum(os.path.getsize(os.path.join(d, f))
                   for f in os.listdir(d)
                   if os.path.isfile(os.path.join(d, f)) and not f.startswith('._'))

    img_size = real_size(IMG_DIR)
    vid_size = real_size(VID_DIR)
    print(f"\n========== 完成 ==========")
    print(f"图片: {img_ok+img_skip} 个 ({img_size/1024/1024:.1f} MB)")
    print(f"视频: {vid_ok+vid_skip} 个 ({vid_size/1024/1024:.1f} MB)")
    print(f"保存目录: {OUT_DIR}")

if __name__ == "__main__":
    main()
