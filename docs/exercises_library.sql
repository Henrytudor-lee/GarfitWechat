/*
 Navicat Premium Dump SQL

 Source Server         : garciafitness
 Source Server Type    : MySQL
 Source Server Version : 80030 (8.0.30-cynos-3.1.16.003)
 Source Host           : sh-cynosdbmysql-grp-6ib8n15i.sql.tencentcdb.com:26415
 Source Schema         : cloudbase-d9gwy4qvodf85fe69

 Target Server Type    : MySQL
 Target Server Version : 80030 (8.0.30-cynos-3.1.16.003)
 File Encoding         : 65001

 Date: 13/05/2026 20:19:04
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for exercises_library
-- ----------------------------
DROP TABLE IF EXISTS `exercises_library`;
CREATE TABLE `exercises_library` (
  `id` int NOT NULL,
  `name` varchar(128) NOT NULL,
  `image_name` varchar(255) DEFAULT '',
  `video_name` varchar(512) DEFAULT NULL,
  `equipment_id` varchar(255) NOT NULL DEFAULT '0',
  `body_part_id` varchar(64) DEFAULT '',
  `exercise_type` varchar(32) DEFAULT 'Strength',
  `is_favorite` smallint DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `name_zh` varchar(64) DEFAULT NULL COMMENT '中文名称',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

SET FOREIGN_KEY_CHECKS = 1;
