import type { EncyclopediaArticle } from '../../types';
import { SOURCES } from '../sources';

/**
 * 光电项目 · 超声能量类。
 *
 * 公开资料对这类项目的描述较为克制（「温和」「逐渐出现」），本文如实转述，
 * 不做增强，也不涉及设备型号与参数。
 */
export const ULTRASOUND_TREATMENTS: EncyclopediaArticle = {
  id: 'art-energy-ultrasound',
  slug: 'ultrasound-treatments',
  title: '超声能量类项目基础知识',
  summary: '超声类项目把热能送到皮肤较深层，公开资料把紧致效果描述为「温和」，结果需要数月逐渐显现。',
  category: 'lightAndEnergy',
  tags: ['光电', '超声', '紧致'],
  aliases: [
    '超声',
    '超音波',
    '聚焦超声',
    'HIFU',
    'ultrasound',
    '超声刀',
    '提升',
    '紧致',
  ],
  sections: [
    {
      heading: '这类项目在做什么',
      paragraphs: [
        '美国皮肤病学会（AAD）说明，用于紧致的超声设备把热送到皮肤深层。',
        '美国食品药品监督管理局（FDA）把超声列为非侵入式身体塑形技术的一类。',
      ],
    },
    {
      heading: '公开资料描述的一般结果',
      paragraphs: [
        'AAD 说明，一次治疗后通常在 2 到 6 个月内出现「温和的」提升与紧致；增加治疗次数可能带来更多改善。',
        'AAD 同时强调，非手术项目无法达到面部提升、眼睑手术或颈部提升等手术的效果，更适合松弛程度较轻的人。',
        '非侵入式项目通常几乎没有停工期，常见反应是发红与肿胀，多数操作在 1 小时以内，结果逐渐出现。',
      ],
    },
    {
      heading: '可能出现的风险',
      paragraphs: [
        'FDA 列出的超声相关并发症包括烧伤与神经损伤；各类非侵入式塑形技术共有的常见反应包括疼痛或不适、发红、肿胀、淤青与硬结。',
        'FDA 还说明，这类技术的结果可能是暂时的，并且不用于治疗肥胖或减重。',
      ],
    },
    {
      heading: '需要事先说明的情况',
      paragraphs: [
        'FDA 建议在接受这类治疗前完整说明自己的病史。',
        'AAD 说明，处于妊娠期、有皮肤感染或正在服用某些药物的人，一般不是这类项目的合适人选。',
      ],
    },
  ],
  limitations: [
    '公开资料对超声紧致的描述集中在「温和」与「逐渐出现」，个体之间差异明显。',
    '本文不涉及设备型号、能量参数或作用层次。',
    'FDA 的相关说明以身体塑形类设备为主，面部用途在不同地区的监管口径可能不同。',
  ],
  seekHelp: [
    '治疗中或治疗后出现难以忍受的疼痛、烧伤样改变或水疱，应及时就医。',
    '出现麻木、刺痛或局部活动异常等可能与神经相关的表现，应及时就医。',
    '治疗区域出现持续加重的肿胀或硬结，应联系操作者并就医。',
  ],
  sources: [SOURCES.fdaBodyContouring, SOURCES.aadFirmSaggingSkin],
  reviewedOn: '2026-09-18',
  reviewStatus: 'sourceChecked',
};
