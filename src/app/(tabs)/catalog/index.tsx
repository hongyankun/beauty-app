import { StyleSheet, Text, View } from 'react-native';

import {
  EmptyState,
  ListGroup,
  ListRow,
  Screen,
  SearchField,
  SectionHeader,
} from '@/components/ui';
import { useComingSoon } from '@/hooks/use-coming-soon';
import { Colors, Layout, TextStyles } from '@/theme';
import type { IconName } from '@/components/ui';

/** 百科的五类内容，见 docs/PRODUCT_REQUIREMENTS.md 第 10.1 节。 */
const CATEGORIES: { title: string; subtitle: string; icon: IconName }[] = [
  { title: '医美项目', subtitle: '光电、注射、焕肤等项目说明', icon: 'treatment' },
  { title: '仪器', subtitle: '常见设备的原理与适用范围', icon: 'device' },
  { title: '注射材料', subtitle: '常见注射类材料的基础信息', icon: 'material' },
  { title: '常见成分', subtitle: '配方中常见成分的中立解释', icon: 'ingredient' },
  { title: '原理科普', subtitle: '皮肤与项目原理的基础知识', icon: 'principle' },
];

/**
 * 百科首页（静态骨架）。
 *
 * 视觉重点是「内容优先」：大标题、舒适行距、浅底分类入口，不使用彩色色块。
 */
export default function CatalogScreen() {
  const comingSoon = useComingSoon();

  return (
    <Screen title="百科" subtitle="了解项目、仪器与材料的中立信息。">
      <View style={styles.section}>
        <SearchField placeholder="搜索项目、仪器或成分" onPress={() => comingSoon('百科搜索')} />
        <Text style={styles.disclaimer}>
          百科内容仅供了解，不构成诊断或治疗建议。是否适合进行某个项目，请咨询具备资质的医生。
        </Text>
      </View>

      <View style={styles.section}>
        <SectionHeader title="内容分类" />
        <ListGroup hasLeadingIcons>
          {CATEGORIES.map((category) => (
            <ListRow
              key={category.title}
              icon={category.icon}
              title={category.title}
              subtitle={category.subtitle}
              onPress={() => comingSoon(category.title)}
            />
          ))}
        </ListGroup>
      </View>

      <View style={styles.section}>
        <SectionHeader title="我的收藏" />
        <EmptyState
          icon="bookmark"
          title="还没有收藏"
          description="浏览百科时点击收藏，条目会集中出现在这里。"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Layout.cardGap,
  },
  disclaimer: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
});
