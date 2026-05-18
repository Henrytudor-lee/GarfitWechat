#!/usr/bin/env python3
"""
Step 2: 上传本地 media/ 目录到腾讯云 COS，并生成 URL 映射文件。
Step 3: 生成 UPDATE SQL，把 exercises_library 的旧 URL 替换成新 CDN URL。

用法:
  python3 upload_and_remap.py --upload          # 上传 + 生成映射
  python3 upload_and_remap.py --remap-only      # 只生成 UPDATE SQL（已有映射）
  python3 upload_and_remap.py --check            # 检查本地文件完整性
"""

import os, sys, json, argparse, hashlib
from pathlib import Path

# ============================================================
# 配置 — 上传前请填写以下信息
# ============================================================
MEDIA_DIR   = os.path.join(os.path.dirname(__file__), "..", "media")
MAPPING_FILE = os.path.join(os.path.dirname(__file__), "url_mapping.json")

# --- 腾讯云 COS 配置（替换成你的）---
COS_SECRET_ID  = "YOUR_SECRET_ID"
COS_SECRET_KEY = "YOUR_SECRET_KEY"
COS_REGION     = "ap-guangzhou"      # 地域，如 ap-guangzhou / ap-shanghai
COS_BUCKET     = "fitness-media-130001"  # Bucket 名称（不带 .cos. 区域名后缀）

# --- 或使用腾讯云 CloudBase Storage 内网地址 ---
# 如果用 CloudBase 环境内置存储，填入环境 ID
CLOUDBASE_ENV_ID = ""   # 例如 "636c-cloudbase-d9gwy4qvodf85fe69-1427916036"

# 旧 URL 前缀（将被替换）
OLD_URL_PREFIX = "https://apilyfta.com/static"

# 新 URL 前缀（上传后的 CDN 地址）
NEW_URL_PREFIX = "https://your-cdn.example.com/static"
# 或使用 COS 默认域名：
# NEW_URL_PREFIX = f"https://{COS_BUCKET}.cos.{COS_REGION}.myqcloud.com"

# ============================================================
# Step 3: 生成 UPDATE SQL（不需要 COS）
# ============================================================
def generate_remap_sql(mapping_file, out_file):
    """根据 url_mapping.json 生成 UPDATE SQL。"""
    if not os.path.exists(mapping_file):
        print(f"ERROR: 映射文件不存在: {mapping_file}")
        return

    with open(mapping_file, encoding="utf-8") as f:
        mapping = json.load(f)

    updates = []
    for old_url, new_url in mapping.items():
        # image_name 和 video_file 都可能包含旧 URL
        safe_old = old_url.replace("'", "''")
        safe_new = new_url.replace("'", "''")
        updates.append(
            f"UPDATE exercises_library "
            f"SET image_name = REPLACE(image_name, '{safe_old}', '{safe_new}'),\n"
            f"    video_file  = REPLACE(video_file,  '{safe_old}', '{safe_new}'),\n"
            f"    updated_at  = NOW()\n"
            f"WHERE image_name = '{safe_old}' OR video_file = '{safe_old}';"
        )

    sql = (
        "-- URL 重映射 SQL\n"
        "-- 由 upload_and_remap.py 自动生成\n"
        "-- 建议先 SELECT 预览受影响行数再执行\n\n"
        + "\n\n".join(updates)
    )

    with open(out_file, "w", encoding="utf-8") as f:
        f.write(sql)

    print(f"UPDATE SQL 已生成: {out_file}")
    print(f"共 {len(updates)} 条更新语句")


# ============================================================
# Step 2: 上传到腾讯云 COS
# ============================================================
def upload_to_cos(local_dir, mapping_file):
    """上传 local_dir 下所有文件到腾讯云 COS，生成映射表。"""
    try:
        from qcloud_cos import CosConfig, CosService
    except ImportError:
        print("需要安装腾讯云 COS SDK:")
        print("  pip install qcloud_cos_python3")
        sys.exit(1)

    # 配置
    config = CosConfig(Secret_id=COS_SECRET_ID, Secret_key=COS_SECRET_KEY, Region=COS_REGION)
    client = CosService(config)

    mapping = {}
    upload_count = 0
    skip_count = 0
    error_count = 0

    for root, _, files in os.walk(local_dir):
        for fname in files:
            local_path = os.path.join(root, fname)
            rel_path = os.path.relpath(local_path, local_dir).replace(os.sep, "/")
            cos_key = f"fitness/{rel_path}"   # COS 里的路径

            try:
                # 上传（静默覆盖）
                client.putObject(
                    Bucket=f"{COS_BUCKET}-{COS_SECRET_ID[:10]}",  # Bucket 命名规则
                    Body=open(local_path, "rb"),
                    Key=cos_key,
                    StorageClass="STANDARD",
                )
                new_url = f"{NEW_URL_PREFIX}/{rel_path}"
                # 对应的旧 URL（从文件名反推）
                old_url = find_original_url(fname, local_dir)
                if old_url:
                    mapping[old_url] = new_url
                upload_count += 1
                print(f"  [OK]  {rel_path}")

            except Exception as e:
                # 文件已存在则跳过
                if "ResourceAlreadyExists" in str(e) or "403" in str(e):
                    skip_count += 1
                else:
                    error_count += 1
                    print(f"  [ERR] {rel_path}: {e}")

    # 保存映射
    with open(mapping_file, "w", encoding="utf-8") as f:
        json.dump(mapping, f, ensure_ascii=False, indent=2)

    print(f"\n完成: 上传 {upload_count}, 跳过 {skip_count}, 错误 {error_count}")
    print(f"映射文件: {mapping_file}")


def find_original_url(fname, local_dir):
    """根据本地文件名查找对应的原始 URL（做粗略匹配）。"""
    # 本地文件命名：{id}_{原文件名} 或直接用 {id}.ext
    # 从 SQL 解析出来的旧 URL 太分散，这里返回 None
    # 映射会通过 image_name 字段内容（包含完整旧 URL）来做替换
    return None


# ============================================================
# 工具：检查本地文件完整性
# ============================================================
def check_local_media(media_dir):
    """统计 media 目录文件数和大小，生成初步映射。"""
    img_dir = os.path.join(media_dir, "images")
    vid_dir = os.path.join(media_dir, "videos")

    for label, d in [("图片", img_dir), ("视频", vid_dir)]:
        if not os.path.exists(d):
            print(f"[{label}] 目录不存在: {d}")
            continue
        files = [f for f in os.listdir(d) if os.path.isfile(os.path.join(d, f))]
        total_size = sum(os.path.getsize(os.path.join(d, f)) for f in files)
        print(f"[{label}] {len(files)} 个文件, {total_size/1024/1024:.1f} MB → {d}")


# ============================================================
# 主入口
# ============================================================
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="上传媒体文件并生成 URL 映射")
    parser.add_argument("--upload", action="store_true", help="上传到 COS 并生成映射")
    parser.add_argument("--remap-only", action="store_true", help="只生成 UPDATE SQL")
    parser.add_argument("--check", action="store_true", help="检查本地文件完整性")
    parser.add_argument("--mapping", default=MAPPING_FILE, help="映射文件路径")
    parser.add_argument("--sql-out", default="docs/exercises_library_url_remap.sql",
                        help="输出 SQL 文件路径")

    args = parser.parse_args()

    if args.check:
        check_local_media(MEDIA_DIR)
    elif args.remap_only:
        generate_remap_sql(args.mapping, args.sql_out)
    elif args.upload:
        upload_to_cos(MEDIA_DIR, args.mapping)
        generate_remap_sql(args.mapping, args.sql_out)
    else:
        parser.print_help()
