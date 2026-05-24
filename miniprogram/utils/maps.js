// miniprogram/utils/maps.js — unified equipment & muscle mapping
// Extracted from pages/library/index.js

const EQUIP_MAP = {
  '1': 'Barbell', '2': 'Body weight', '3': 'Cable', '4': 'Dumbbell',
  '5': 'EZ Barbell', '6': 'Leverage machine', '7': 'Sled machine',
  '8': 'Smith machine', '9': 'Weighted', '10': 'Assisted',
  '11': 'Band', '12': 'Battling Rope', '13': 'Bosu ball', '14': 'Hammer',
  '15': 'Kettlebell', '16': 'Medicine Ball', '17': 'Olympic barbell',
  '18': 'Power Sled', '19': 'Resistance Band', '20': 'Roll',
  '21': 'Rollball', '22': 'Rope', '23': 'Stability ball', '24': 'Stick',
  '25': 'Suspension', '26': 'Trap bar', '27': 'Vibrate Plate', '28': 'Wheel roller',
};

const EQUIP_MAP_ZH = {
  '1': '杠铃', '2': '自重', '3': '钢索', '4': '哑铃',
  '5': 'EZ杠铃', '6': '器械', '7': '雪橇机',
  '8': '史密斯机', '9': '负重', '10': '辅助',
  '11': '弹力带', '12': '战绳', '13': 'Bosu球', '14': '锤式',
  '15': '壶铃', '16': '药球', '17': '奥林匹克杠铃',
  '18': '动力雪橇', '19': '阻力带', '20': '滚轮',
  '21': '滚球', '22': '绳索', '23': '稳定球', '24': '短棍',
  '25': '悬吊', '26': 'Trap bar', '27': '震动板', '28': '轮滑滚筒',
};

const EQUIP_ICON_MAP = {
  '1': 'barbell.png', '2': 'bodyweight.png', '3': 'cable.png', '4': 'dumbell.png',
  '5': 'ez_barbell.png', '6': 'leverage_machine.png', '7': 'sled_machine.png',
  '8': 'smith_machine.png', '9': 'weighted.png', '10': 'A.png',
  '11': 'band.png', '12': 'battling_rope.png', '13': 'bosu_ball.png', '14': 'H.png',
  '15': 'kettlebell.png', '16': 'medicine_ball.png', '17': 'barbell.png',
  '18': 'power_sled.png', '19': 'resistance_band.png', '20': 'roll.png',
  '21': 'rollball.png', '22': 'rope.png', '23': 'stability_ball.png', '24': 'ST.png',
  '25': 'suspension.png', '26': 'trap_bar.png', '27': 'VP.png', '28': 'wheel_roller.png',
};

const BODY_PART_MAP = {
  '1': 'Thighs', '2': 'Chest', '3': 'Hips', '4': 'Back',
  '5': 'Upper Arms', '6': 'Shoulders', '7': 'Forearms', '8': 'Calves',
  '9': 'Neck', '10': 'Cardio', '12': 'Waist',
  '17': 'Biceps', '18': 'Triceps', '19': 'Quadriceps', '20': 'Hamstrings',
};

const BODY_PART_MAP_ZH = {
  '1': '大腿', '2': '胸部', '3': '髋部', '4': '背部',
  '5': '上臂', '6': '肩膀', '7': '前臂', '8': '小腿',
  '9': '颈部', '10': '有氧', '12': '腰部',
  '17': '肱二头肌', '18': '肱三头肌', '19': '股四头肌', '20': '腘绳肌',
};

const MUSCLE_ICON_MAP = {
  '1': 'quadriceps.png', '2': 'chest.png', '3': 'hips.png', '4': 'back.png',
  '5': 'shoulders.png', '6': 'shoulders.png', '7': 'forearms.png', '8': 'calves.png',
  '9': 'neck.png', '10': 'cardio.png', '12': 'waist.png',
  '17': 'biceps.png', '18': 'triceps.png', '19': 'quadriceps.png', '20': 'hamstrings.png',
};

module.exports = {
  EQUIP_MAP,
  EQUIP_MAP_ZH,
  EQUIP_ICON_MAP,
  BODY_PART_MAP,
  BODY_PART_MAP_ZH,
  MUSCLE_ICON_MAP,
};