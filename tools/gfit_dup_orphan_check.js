const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const BACKEND = '/Volumes/world/program/gfit-backend';
require(path.join(BACKEND, 'node_modules/dotenv')).config({ path: path.join(BACKEND, '.env') });
const mysql = require(path.join(BACKEND, 'node_modules/mysql2/promise'));

(async () => {
  const c = await mysql.createConnection({
    host: process.env.MYSQL_HOST, port: +(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  });
  const q = async (s) => (await c.query(s))[0];

  const bakFile = fs.readdirSync('/Volumes/world/program/fitness_wechat/docs')
    .filter((f) => f.startsWith('gfit_backup_dupdelete-'))
    .sort().pop();
  const bak = JSON.parse(fs.readFileSync(path.join('/Volumes/world/program/fitness_wechat/docs', bakFile), 'utf8'));

  // 库内还在引用的文件名
  const refImg = new Set((await q("SELECT DISTINCT image_name f FROM exercises_library WHERE image_name IS NOT NULL AND image_name<>''")).map((r) => r.f));
  const refVid = new Set((await q("SELECT DISTINCT video_name f FROM exercises_library WHERE video_name IS NOT NULL AND video_name<>''")).map((r) => r.f));

  const orphanImg = [...new Set(bak.deletedRows.map((r) => r.image_name).filter((f) => f && !refImg.has(f)))];
  const orphanVid = [...new Set(bak.deletedRows.map((r) => r.video_name).filter((f) => f && !refVid.has(f)))];
  console.log(`删除的行涉及的图片文件: ${new Set(bak.deletedRows.map((r) => r.image_name).filter(Boolean)).size} 个 → 库内已无人引用(磁盘孤儿): ${orphanImg.length}`);
  console.log(`删除的行涉及的视频文件: ${new Set(bak.deletedRows.map((r) => r.video_name).filter(Boolean)).size} 个 → 库内已无人引用(磁盘孤儿): ${orphanVid.length}`);

  // 坏引用: 库引用了但磁盘没有
  const diskImg = execSync("ssh -n -i ~/.ssh/gfit_ci_deploy admin@47.108.200.98 'ls /media/gfit/exer_images'", { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean);
  const diskVid = execSync("ssh -n -i ~/.ssh/gfit_ci_deploy admin@47.108.200.98 'ls /media/gfit/exer_videos'", { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean);
  const diskImgSet = new Set(diskImg), diskVidSet = new Set(diskVid);
  const badImg = [...refImg].filter((f) => !diskImgSet.has(f));
  const badVid = [...refVid].filter((f) => !diskVidSet.has(f));
  console.log(`\n坏引用(库引用但磁盘无文件): 图片 ${badImg.length} / 视频 ${badVid.length}`);
  console.log(`磁盘文件总数: 图片 ${diskImg.length} / 视频 ${diskVid.length}`);

  // 磁盘上完全没人引用的文件数(真孤儿)
  const orphanDiskImg = diskImg.filter((f) => !refImg.has(f));
  const orphanDiskVid = diskVid.filter((f) => !refVid.has(f));
  console.log(`磁盘上已无人引用的孤儿文件: 图片 ${orphanDiskImg.length} / 视频 ${orphanDiskVid.length}`);
  console.log('  (视频孤儿样例:', orphanDiskVid.slice(0, 6).join(', ') || '无', ')');

  fs.writeFileSync('/Volumes/world/program/fitness_wechat/docs/gfit_dup_orphan_after_delete.json', JSON.stringify({
    executedAt: new Date().toISOString(),
    backup: bakFile,
    deletedCount: bak.count,
    newlyOrphanImages: orphanImg,
    newlyOrphanVideos: orphanVid,
    diskOrphanImagesTotal: orphanDiskImg.length,
    diskOrphanVideosTotal: orphanDiskVid.length,
    badRefs: { images: badImg, videos: badVid },
  }, null, 2));
  console.log('\n记录已写: docs/gfit_dup_orphan_after_delete.json');

  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
