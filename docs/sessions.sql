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

 Date: 12/05/2026 23:27:50
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for sessions
-- ----------------------------
DROP TABLE IF EXISTS `sessions`;
CREATE TABLE `sessions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `start_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `end_time` timestamp NULL DEFAULT NULL,
  `duration` int DEFAULT '0',
  `status` varchar(20) DEFAULT 'running',
  `is_done` smallint DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `_openid` varchar(256) NOT NULL COMMENT '用于权限管理，请不要删除',
  PRIMARY KEY (`id`),
  KEY `idx_sessions_user_done` (`user_id`,`is_done`),
  CONSTRAINT `sessions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb3;

SET FOREIGN_KEY_CHECKS = 1;
