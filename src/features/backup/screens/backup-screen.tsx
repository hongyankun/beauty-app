import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card, InlineNotice, Screen, SectionHeader } from '@/components/ui';
import { Colors, Layout, TextStyles } from '@/theme';
import { useBackupExport } from '../hooks/use-backup-export';

/** 备份里装了什么。用用户的话说，不出现表名、字段名与 schema 版本（任务书第 8.3 节）。 */
const BACKUP_SCOPE: readonly string[] = [
  '套餐与套餐里的项目',
  '核销记录，包含已撤销的',
  '机构，包含已归档的',
  '心愿',
  '百科收藏',
];

/**
 * 数据备份。
 *
 * 这一页只做一件事：把当前档案的业务数据导成一个 JSON 文件，交给系统分享面板。
 * 本轮**只导出，不恢复**，因此页面上没有、也不许有一个点不动的「恢复备份」按钮——
 * 一个假入口比一句「以后会有」更让人困惑（任务书第 3.2 节）。
 *
 * 全屏只有「导出备份」一个实心主按钮（UI_REFERENCE 第 10 章）。
 */
export function BackupScreen() {
  const router = useRouter();
  const { status, sharedMessage, errorMessage, start } = useBackupExport();

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/me');
    }
  }, [router]);

  const exporting = status === 'exporting';

  return (
    <Screen
      title="数据备份"
      subtitle="将当前档案中的套餐、核销、机构、心愿和收藏导出为 JSON 文件。"
      onBack={goBack}
    >
      {/*
        隐私提示排在范围与按钮之前：备份文件是一份完整的个人消费档案，
        用户该在决定分享到哪里之前就读到这句话（任务书第 8.3 节）。
      */}
      <InlineNotice
        tone="neutral"
        message="备份包含个人消费记录和机构信息，请保存到你信任的位置。"
      />

      <View style={styles.section}>
        <SectionHeader title="备份包含" />
        <Card style={styles.listCard}>
          {BACKUP_SCOPE.map((item) => (
            <BulletLine key={item} text={item} />
          ))}
        </Card>
        <Text style={styles.note}>
          百科文章正文随 App 提供，不需要备份，因此不在这个文件里。
        </Text>
      </View>

      {sharedMessage ? <InlineNotice tone="neutral" message={sharedMessage} /> : null}
      {errorMessage ? (
        <InlineNotice tone="warning" message={errorMessage} actionLabel="重试" onActionPress={start} />
      ) : null}

      <Button
        // 进行中的状态由文案说出来，不只靠按钮里那个转圈（UI_REFERENCE 第 10 章）。
        label={exporting ? '正在生成备份…' : '导出备份'}
        icon="dataExport"
        variant="primary"
        loading={exporting}
        onPress={start}
      />

      <Text style={styles.note}>从备份恢复数据将在后续版本提供。</Text>
    </Screen>
  );
}

/** 项目符号行：符号只是排版，语义由文字承担，因此对读屏隐藏。 */
function BulletLine({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bullet} importantForAccessibility="no">
        ·
      </Text>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Layout.labelGap,
  },
  listCard: {
    gap: Layout.labelGap,
  },
  note: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: Layout.iconGap,
  },
  bullet: {
    ...TextStyles.body,
    color: Colors.textSecondary,
  },
  bulletText: {
    ...TextStyles.body,
    color: Colors.textPrimary,
    flex: 1,
    lineHeight: 24,
  },
});
