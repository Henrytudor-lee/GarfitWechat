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

 Date: 25/05/2026 22:44:51
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
  `favor_exercises` varchar(255) DEFAULT NULL COMMENT '用户喜爱的动作id列表',
  `practiced_exercises` varchar(255) DEFAULT NULL COMMENT '标识用户训练过的动作id列表',
  `gender` varchar(12) DEFAULT NULL COMMENT 'male - 男性；female - 女性； 可以为空',
  `birthday` timestamp NULL DEFAULT NULL COMMENT '用户生日',
  `purpose` tinyint DEFAULT '1' COMMENT '1 - 塑形；2 - 减肥；3 - 养生；默认值1',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb3;

SET FOREIGN_KEY_CHECKS = 1;
