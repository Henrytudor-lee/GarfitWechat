#!/usr/bin/env python3
"""
重试下载失败的视频。
通过比对 SQL 中的视频 URL 和本地已存在文件，找出缺失的视频进行重试。
"""

import os, sys, re, urllib.request, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

SQL_FILE  = os.path.join(os.path.dirname(__file__), "..", "docs", "exercises_library_migrated.sql")
VID_DIR   = os.path.join(os.path.dirname(__file__), "..", "media", "videos")

MAX_WORKERS = 4
TIMEOUT_SEC = 120
MAX_RETRIES = 4
RETRY_DELAY = 10

counter_lock = Lock()

def parse_video_urls():
    with open(SQL_FILE, encoding="utf-8") as f:
        content = f.read()

    vals_match = re.search(r'VALUES\s+(.+);', content, re.DOTALL)
    if not vals_match:
        print("ERROR: 无法找到 VALUES 语句"); sys.exit(1)

    raw  = vals_match.group(1)
    rows = re.split(r'\),\s*\(', raw)
    vid_urls = []

    for row in rows:
        fields = _split_fields(row)
        if len(fields) < 9:
            continue
        row_id = fields[0].strip().lstrip('(')
        vid    = _clean_url(fields[4].strip())
        if vid:
            vid_urls.append((row_id, vid))

    return vid_urls

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
    if s.upper() in ('NULL', '', "'NULL'"): return None
    if s.startswith("'") and s.endswith("'"): s = s[1:-1]
    if s.upper() in ('NULL',): return None
    if any(c in s for c in '\n\r\t') or (' ' in s and not s.startswith('http')):
        return None
    return s

def _get_existing_files():
    """返回已存在的视频文件名集合（不含扩展名，用于快速比对）"""
    files = {}
    if not os.path.isdir(VID_DIR):
        return files
    for fname in os.listdir(VID_DIR):
        if fname.startswith('._') or not os.path.isfile(os.path.join(VID_DIR, fname)):
            continue
        # 去掉扩展名作为 key
        name = os.path.splitext(fname)[0]
        files[name] = fname
    return files

def download_file(row_id, url):
    raw_url = url.strip()
    url_enc = raw_url.replace(' ', '%20')
    fname   = raw_url.split('/')[-1].split('?')[0]
    if not fname or len(fname) < 4:
        fname = f"{row_id}_vid.mp4"

    out_path = os.path.join(VID_DIR, fname)

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Referer": "https://apilyfta.com/",
    }

    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(url_enc, headers=headers)
            with urllib.request.urlopen(req, timeout=TIMEOUT_SEC) as resp:
                data = resp.read()
            with open(out_path, 'wb') as f:
                f.write(data)
            return ("ok", url, len(data))
        except Exception as e:
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY * (attempt + 1))
            else:
                return ("err", url, str(e))

def run_batch(label, urls, workers):
    start = time.time()
    ok, skip, err = 0, 0, 0

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(download_file, row_id, url): (row_id, url)
                   for row_id, url in urls}
        for future in as_completed(futures):
            rtype = future.result()[0]
            if   rtype == "ok":   ok   += 1
            elif rtype == "skip": skip += 1
            else:                 err  += 1
            done = ok + skip + err
            pct  = f"{done/len(urls)*100:.1f}%"
            elapsed = time.time() - start
            rate = done / elapsed if elapsed > 0 else 0
            remain = (len(urls) - done) / rate if rate > 0 else 0
            print(f"\r[{label}] {done}/{len(urls)} ({pct}) | {rate:.1f}/s | 剩余 ~{remain/60:.0f}min    ", end='', flush=True)
            if rtype == "err":
                print(f"\n  [ERR] {future.result()[1]}: {future.result()[2]}")

    elapsed = time.time() - start
    print(f"\n{label}完成！成功 {ok} 跳过 {skip} 失败 {err} 耗时 {elapsed:.0f}s")
    return ok, skip, err

def main():
    print("解析 SQL 文件...")
    all_vid_urls = parse_video_urls()
    print(f"SQL 中视频: {len(all_vid_urls)} 个")

    existing = _get_existing_files()
    print(f"本地已有视频: {len(existing)} 个")

    # 找出 SQL 有但本地没有的视频
    missing = []
    for row_id, url in all_vid_urls:
        raw_url = url.strip()
        fname = raw_url.split('/')[-1].split('?')[0]
        name_key = os.path.splitext(fname)[0]
        if name_key not in existing:
            missing.append((row_id, url))

    print(f"待重试视频: {len(missing)} 个")
    if not missing:
        print("没有需要重试的视频")
        return

    print(f"\n开始重试 → {VID_DIR}")
    ok, skip, err = run_batch("视频重试", missing, MAX_WORKERS)

    def real_size(d):
        if not os.path.exists(d): return 0
        return sum(os.path.getsize(os.path.join(d, f))
                   for f in os.listdir(d)
                   if os.path.isfile(os.path.join(d, f)) and not f.startswith('._'))
    vid_size = real_size(VID_DIR)
    print(f"\n视频: {ok+skip} 个 ({vid_size/1024/1024:.1f} MB)")

if __name__ == "__main__":
    main()
