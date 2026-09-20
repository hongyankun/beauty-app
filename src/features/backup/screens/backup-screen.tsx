import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button, Card, InlineNotice, Screen, SectionHeader } from '@/components/ui';
import { Colors, Layout, Spacing, TextStyles } from '@/theme';
import { useBackupExport } from '../hooks/use-backup-export';
import {
  BACKUP_RESTORED_DETAIL,
  BACKUP_RESTORED_MESSAGE,
  useBackupRestore,
} from '../hooks/use-backup-restore';
import type { BackupSummary } from '../services/summarize-backup-document';

/** 备份里装了什么。用用户的话说，不出现表名、字段名与 schema 版本（任务书第 8.3 节）。 */
const BACKUP_SCOPE: readonly string[] = [
  '套餐与套餐里的项目',
  '核销记录，包含已撤销的',
  '机构，包含已归档的',
  '心愿',
  '百科收藏',
];

/**
 * 覆盖前的最后一道确认。
 *
 * 文案是任务书第七节逐字规定的，不做同义替换：这是用户在 App 里最后一次
 * 能够反悔的时刻，「同步」「导入一些数据」「继续」这类含糊说法都会让人
 * 低估它的后果。标题用问句、正文写清「替换」和「无法撤销」，
 * 左边那个按钮叫「返回检查」而不是「取消」——它要传达的是「回去再看一眼」，
 * 不是「什么都没发生」。
 */
const RESTORE_CONFIRM = {
  title: '用这份备份覆盖当前数据？',
  body: '当前 App 中的套餐、核销、机构、心愿和收藏将被替换为备份中的内容。恢复完成后无法在 App 内撤销。',
  cancelLabel: '返回检查',
  confirmLabel: '确认恢复',
} as const;

/**
 * 数据备份。
 *
 * 一页两件事，顺序不能反：上半屏是导出，下半屏是恢复。
 * 导出是安全的、随时可做的；恢复会**整体覆盖**当前数据且在 App 内无法撤销。
 * 把恢复放在后面、与导出之间隔开，并在它自己的区块里先劝一句「先导出一份当前数据」，
 * 是因为用户走到这里往往是因为出了状况，而出状况时最容易点错的就是这个按钮
 * （任务书第七、十一节）。
 *
 * 全屏只有「导出备份」一个实心主按钮（UI_REFERENCE 第 10 章）：
 * 选文件是次按钮，「恢复这份备份」用危险语义（白底描边），不铺大面积红。
 */
export function BackupScreen() {
  const router = useRouter();
  const exporter = useBackupExport();
  const restorer = useBackupRestore();

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/me');
    }
  }, [router]);

  const exporting = exporter.status === 'exporting';
  const opening = restorer.status === 'opening';
  const restoring = restorer.status === 'restoring';

  const confirmRestore = useCallback(() => {
    Alert.alert(RESTORE_CONFIRM.title, RESTORE_CONFIRM.body, [
      // 「返回检查」只关掉弹窗：不写任何一行数据，摘要原样留在页面上。
      { text: RESTORE_CONFIRM.cancelLabel, style: 'cancel' },
      {
        text: RESTORE_CONFIRM.confirmLabel,
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const outcome = await restorer.restore();
            if (outcome !== 'restored') {
              // 失败的说法由页面上的提示条给出，这里不再叠一个弹窗。
              return;
            }
            Alert.alert(BACKUP_RESTORED_MESSAGE, BACKUP_RESTORED_DETAIL, [
              {
                text: '好',
                // 回首页而不是留在这一页：恢复之后用户要确认的是自己的记录回来了，
                // 而首页的数字是最快能看出这一点的地方。各列表都在获得焦点时重读数据库，
                // 因此不需要重启 App，也不需要手工刷新。
                onPress: () => router.replace('/(tabs)/home'),
              },
            ]);
          })();
        },
      },
    ]);
  }, [restorer, router]);

  return (
    <Screen
      title="数据备份"
      subtitle="将当前档案中的套餐、核销、机构、心愿和收藏导出为 JSON 文件，也可以从一份备份恢复。"
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

      {exporter.sharedMessage ? (
        <InlineNotice tone="neutral" message={exporter.sharedMessage} />
      ) : null}
      {exporter.errorMessage ? (
        <InlineNotice
          tone="warning"
          message={exporter.errorMessage}
          actionLabel="重试"
          onActionPress={exporter.start}
        />
      ) : null}

      <Button
        // 进行中的状态由文案说出来，不只靠按钮里那个转圈（UI_REFERENCE 第 10 章）。
        label={exporting ? '正在生成备份…' : '导出备份'}
        icon="dataExport"
        variant="primary"
        loading={exporting}
        onPress={exporter.start}
      />

      <View style={styles.section}>
        <SectionHeader title="从备份恢复" />
        <Text style={styles.note}>
          恢复会用备份中的内容整体替换当前档案：现在有、备份里没有的记录会被删除，
          恢复完成后无法在 App 内撤销。建议先用上面的「导出备份」保存一份当前数据。
        </Text>

        {restorer.summary ? <SummaryCard summary={restorer.summary} /> : null}

        {restorer.errorMessage ? (
          <InlineNotice tone="warning" message={restorer.errorMessage} />
        ) : null}
        {restorer.status === 'restored' ? (
          <InlineNotice tone="neutral" message={`${BACKUP_RESTORED_MESSAGE}。${BACKUP_RESTORED_DETAIL}`} />
        ) : null}

        <Button
          label={opening ? '正在读取备份…' : restorer.summary ? '换一个备份文件' : '选择备份文件'}
          icon="dataImport"
          variant="secondary"
          loading={opening}
          disabled={restoring}
          disabledReason={restoring ? '正在恢复，请等这一步完成。' : undefined}
          onPress={restorer.openFile}
        />

        {restorer.summary ? (
          <Button
            label={restoring ? '正在恢复…' : '恢复这份备份'}
            variant="danger"
            loading={restoring}
            disabled={opening}
            disabledReason={opening ? '正在读取备份文件。' : undefined}
            onPress={confirmRestore}
          />
        ) : null}
      </View>
    </Screen>
  );
}

/**
 * 待确认备份的摘要。
 *
 * 只有时间、格式版本与六个条数：用户此刻要判断的是「这是不是我要的那一份」，
 * 不是逐条核对内容。也刻意不显示套餐名与机构名——这一屏随时可能被人从背后看见
 * （任务书第七节）。
 *
 * 数值不设 `numberOfLines`：系统字体放大到最大档时宁可换行，不能截断（PRD-NFR-006）。
 */
function SummaryCard({ summary }: { summary: BackupSummary }) {
  return (
    <Card style={styles.listCard}>
      <SummaryLine label="备份生成时间" value={summary.exportedAtLabel ?? '未知'} />
      <SummaryLine label="备份格式版本" value={`第 ${summary.formatVersion} 版`} />
      <SummaryLine label="套餐" value={`${summary.purchaseCount} 个`} />
      <SummaryLine label="套餐项目" value={`${summary.purchaseItemCount} 个`} />
      <SummaryLine label="核销记录" value={`${summary.redemptionCount} 条`} />
      <SummaryLine label="机构" value={`${summary.institutionCount} 个`} />
      <SummaryLine label="心愿" value={`${summary.wishlistCount} 条`} />
      <SummaryLine label="百科收藏" value={`${summary.favoriteCount} 篇`} />
    </Card>
  );
}

/** 一行「名称 + 数值」。整行是一个读屏节点，否则读屏用户会听到一串孤零零的数字。 */
function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow} accessible accessibilityLabel={`${label}：${value}`}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
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
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  summaryLabel: {
    ...TextStyles.body,
    color: Colors.textSecondary,
    flex: 1,
  },
  summaryValue: {
    ...TextStyles.body,
    color: Colors.textPrimary,
    flexShrink: 1,
    textAlign: 'right',
  },
});
