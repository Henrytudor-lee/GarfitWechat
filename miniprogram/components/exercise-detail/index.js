// components/exercise-detail/index.js — 动作详情展示组件(媒体 + 标题 + 英文名 + 标签)
//
// 三处共用(2026-11-10):
//   · pages/library        动作库详情弹层
//   · pages/share          训练分享页里的动作详情弹层
//   · pages/exercise-share 动作分享详情页
//
// 为什么抽组件:
//   三个页面显示的是**同一个动作**的同一批信息, 但以前各写各的 wxml/wxss,
//   改一次样式要改三处, 漏一处就出现"同一个动作在两个页面上标签不一样"。
//   现在数据口径(utils/exerciseMeta.js)和结构都收口到这里。
//
// variant 决定视觉风格:
//   compact — 动作库弹层: 16/9 媒体 + 小号方角 chip
//   pill    — 分享类页面: 固定高媒体 + 药丸 chip
const app = getApp();
const { titleOf, enNameOf, buildTags } = require('../../utils/exerciseMeta.js');

Component({
  properties: {
    // 动作原始数据。字段口径见 utils/exerciseMeta.js 的注释:
    //   name / name_zh (动作库) 或 name_en / name_zh (训练&分享的 group)
    //   image_name / video_name / equipment_id / body_part_id / exercise_type
    exercise: {
      type: Object,
      value: null,
    },
    // 语言: 'zh' | 'en'
    locale: {
      type: String,
      value: 'zh',
    },
    // 视觉风格: 'compact' | 'pill'
    variant: {
      type: String,
      value: 'pill',
    },
    // 主题: 'day' | 'night'(中性 chip 的底色要跟主题走)
    theme: {
      type: String,
      value: 'night',
    },
    // 标题是否显示(动作库弹层的标题在头部, 这里就不重复渲染)
    showTitle: {
      type: Boolean,
      value: true,
    },
    // 媒体 / 内容是否显示(动作库弹层把媒体固定在滚动区外, 所以拆成两个实例)
    showMedia: {
      type: Boolean,
      value: true,
    },
    showBody: {
      type: Boolean,
      value: true,
    },
    // 无视频时的提示遮罩(动作库弹层有, 分享页没有)
    showVideoTip: {
      type: Boolean,
      value: false,
    },
    tipText: {
      type: String,
      value: '',
    },
    tipSubText: {
      type: String,
      value: '',
    },
    imgPrefix: {
      type: String,
      value: '',
    },
    vidPrefix: {
      type: String,
      value: '',
    },
  },

  data: {
    title: '',
    enName: '',
    tags: [],
  },

  observers: {
    /**
     * exercise / locale 任一变化都重算标题与标签
     *
     * ⚠️ 依赖 locale 变化是必须的: 切语言时同一个动作的
     *    标题/器械/肌群文案全变, 只盯着 exercise 就不刷新。
     */
    'exercise, locale': function (exercise, locale) {
      if (!exercise) return;
      const isZh = (locale || 'zh') === 'zh';
      this.setData({
        title: titleOf(exercise, isZh),
        enName: enNameOf(exercise),
        tags: buildTags(exercise, app.globalData.t || {}, isZh),
      });
    },
  },
});
