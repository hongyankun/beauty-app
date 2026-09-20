import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Card, Icon, ListGroup, ListRow, Screen, SectionHeader } from '@/components/ui';
import { useComingSoon } from '@/hooks/use-coming-soon';
import { Colors, Layout, Radii, TextStyles } from '@/theme';

/**
 * 我的（静态骨架）。
 *
 * 第一版只有当前用户本人一个档案（ADR-015）：这里不出现档案切换入口、
 * 不出现多档案管理，也不出现其他使用人。
 *
 * 「数据管理」里机构管理与数据备份是真的可用页面，清除缓存仍是占位。
 */
export default function MeScreen() {
  const router = useRouter();
  const comingSoon = useComingSoon();

  return (
    <Screen title="我的" subtitle="管理你的档案、数据与隐私设置。">
      <Card style={styles.profileCard}>
        <View style={styles.avatar}>
          <Icon name="me" size={24} color={Colors.mintPrimary} />
        </View>
        <View style={styles.profileTexts}>
          <Text style={styles.profileName}>个人档案</Text>
          <Text style={styles.profileHint}>所有套餐与记录都属于本人</Text>
        </View>
      </Card>

      <View style={styles.section}>
        <SectionHeader title="数据管理" />
        <ListGroup hasLeadingIcons>
          <ListRow
            icon="institution"
            title="机构管理"
            subtitle="整理套餐和核销中使用过的机构"
            onPress={() => router.push('/(tabs)/me/institutions')}
          />
          <ListRow
            icon="dataExport"
            title="数据备份"
            subtitle="把记录导出为备份文件"
            onPress={() => router.push('/(tabs)/me/backup')}
          />
          <ListRow
            icon="trash"
            title="清除缓存"
            subtitle="清理本地临时数据"
            onPress={() => comingSoon('清除缓存')}
          />
        </ListGroup>
      </View>

      <View style={styles.section}>
        <SectionHeader title="设置" />
        <ListGroup hasLeadingIcons>
          <ListRow
            icon="privacy"
            title="隐私与安全"
            subtitle="隐私政策、用户协议、删除数据"
            onPress={() => comingSoon('隐私与安全')}
          />
          <ListRow
            icon="about"
            title="关于与免责声明"
            subtitle="版本信息与内容免责声明"
            onPress={() => comingSoon('关于与免责声明')}
          />
        </ListGroup>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.iconGap,
  },
  avatar: {
    width: Layout.minTouchSize,
    height: Layout.minTouchSize,
    borderRadius: Radii.input,
    backgroundColor: Colors.mintLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileTexts: {
    flex: 1,
    gap: Layout.tightGap,
  },
  profileName: {
    ...TextStyles.bodyStrong,
    color: Colors.textPrimary,
  },
  profileHint: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  section: {
    gap: Layout.cardGap,
  },
});
