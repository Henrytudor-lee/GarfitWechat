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

 Date: 12/05/2026 23:27:57
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for users
-- ----------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `_openid` varchar(256) NOT NULL COMMENT '用于权限管理，请不要删除',
  `name` varchar(64) DEFAULT NULL,
  `avatar` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `role` varchar(64) DEFAULT NULL,
  `status` tinyint NOT NULL DEFAULT '1',
  `phone` varchar(11) DEFAULT NULL COMMENT '手机号',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb3;

SET FOREIGN_KEY_CHECKS = 1;
