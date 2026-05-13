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

 Date: 13/05/2026 20:06:48
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for exercises
-- ----------------------------
DROP TABLE IF EXISTS `exercises`;
CREATE TABLE `exercises` (
  `id` int NOT NULL AUTO_INCREMENT,
  `session_id` int NOT NULL,
  `user_id` int NOT NULL,
  `exercise_id` int NOT NULL COMMENT '关联exercises_library.id',
  `name_zh` varchar(128) NOT NULL COMMENT '动作名称(冗余存储)',
  `sequence` int DEFAULT '0' COMMENT '同session内的排列顺序',
  `weight` float DEFAULT '0' COMMENT '重量数值',
  `weight_unit` varchar(10) DEFAULT 'kg' COMMENT 'kg|lb',
  `reps` int DEFAULT '0' COMMENT '次数',
  `create_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `_openid` varchar(256) NOT NULL COMMENT '用于权限管理，请不要删除',
  `name_en` varchar(64) DEFAULT NULL,
  `image_name` varchar(64) DEFAULT NULL COMMENT '动作图片名称',
  `video_name` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `session_id` (`session_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `exercises_ibfk_1` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `exercises_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=67 DEFAULT CHARSET=utf8mb3;

SET FOREIGN_KEY_CHECKS = 1;
