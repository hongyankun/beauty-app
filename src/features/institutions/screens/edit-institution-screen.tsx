import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import {
  Button,
  EmptyState,
  FormScreen,
  InlineNotice,
  Screen,
  TextField,
} from '@/components/ui';
import { Colors, Layout, TextStyles } from '@/theme';
import { PurchaseCardSkeleton } from '@/features/purchases/components/purchase-card-skeleton';
import { useInstitutionDetail } from '../hooks/use-institution-detail';
import { useInstitutionEditor } from '../hooks/use-institution-editor';
import type { InstitutionDetail } from '../services/get-institution';

/**
 * 编辑一个机构（我的 Tab 栈内的全屏表单）。
 *
 * 只能改名称、城市与备注三项。机构 ID 始终不变，所以它与既有套餐、核销记录
 * 的关联一条都不会断；历史记录里的机构名称与城市快照也不受影响
 * （PRD-INST-005、PRD-PUR-018，任务书第五、六节）。
 *
 * 归档与恢复也在这一页完成，两者都不删除任何业务数据（任务书第七、八节）。
 */
export function EditInstitutionScreen() {
  const router = useRouter();
  const { institutionId } = useLocalSearchParams<{ institutionId: string }>();
  const { status, detail, reload } = useInstitutionDetail(institutionId);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/me/institutions');
    }
  }, [router]);

  if (status === 'loading') {
    return (
      <Screen title="编辑机构" onBack={goBack} backLabel="取消">
        <PurchaseCardSkeleton accessibilityLabel="正在载入这个机构" />
      </Screen>
    );
  }

  if (status === 'notFound') {
    return (
      <Screen title="编辑机构" onBack={goBack} backLabel="取消">
        <EmptyState
          icon="institution"
          title="找不到这个机构"
          description="它可能已经不存在了。返回机构管理看看其他机构。"
          actionLabel="返回机构管理"
          onActionPress={goBack}
        />
      </Screen>
    );
  }

  if (detail === null) {
    return (
      <Screen title="编辑机构" onBack={goBack} backLabel="取消">
        <InlineNotice
          tone="warning"
          message="没能读取这个机构，暂时无法编辑。"
          actionLabel="重试"
          onActionPress={reload}
        />
      </Screen>
    );
  }

  // 载入成功后才挂载表单，并用机构 ID 作为 key：这样草稿初值可以在表单自己的
  // 生命周期里只算一次，「有没有改动」的比较基准才是稳定的。
  return <EditInstitutionForm key={detail.id} detail={detail} />;
}

function EditInstitutionForm({ detail }: { detail: InstitutionDetail }) {
  const editor = useInstitutionEditor(detail);

  const confirmArchive = useCallback(() => {
    Alert.alert(
      `归档「${detail.name}」？`,
      `归档后它不会再出现在新增套餐和记录核销的机构列表里。已关联的 ${detail.purchaseCount} 个套餐和 ${detail.redemptionCount} 条核销记录都会保留，不会被删除，剩余次数与累计投入也不变。之后可以随时恢复。`,
      [
        { text: '取消', style: 'cancel' },
        // 不用 destructive 样式：归档不是删除，红色会让用户以为记录会消失。
        { text: '归档机构', onPress: () => editor.setArchived(true) },
      ],
    );
  }, [detail.name, detail.purchaseCount, detail.redemptionCount, editor]);

  const restore = useCallback(() => {
    editor.setArchived(false);
  }, [editor]);

  const statusLabel = editor.isArchived ? '已归档' : '使用中';

  return (
    <FormScreen
      title="编辑机构"
      subtitle="修改机构名称、城市与备注。"
      onCancel={editor.cancel}
      footer={
        <Button
          label={editor.saving ? '正在保存…' : '保存修改'}
          variant="primary"
          loading={editor.saving}
          onPress={editor.submit}
          accessibilityLabel="保存修改"
        />
      }
    >
      {editor.actionError ? <InlineNotice tone="warning" message={editor.actionError} /> : null}

      {/* 状态与关联条数：状态有文字，不只靠颜色表达（PRD-NFR-005）。 */}
      <View
        style={styles.statusBlock}
        accessible
        accessibilityLabel={`当前状态${statusLabel}，${detail.usageLabel}`}
      >
        <Text style={styles.statusLine}>当前状态：{statusLabel}</Text>
        <Text style={styles.statusMeta}>{detail.usageLabel}</Text>
      </View>

      <TextField
        label="机构名称"
        required
        value={editor.draft.name}
        onChangeText={editor.changeName}
        placeholder="例如：某某医疗美容门诊部"
        error={editor.nameError ?? undefined}
      />

      <TextField
        label="城市"
        value={editor.draft.city}
        onChangeText={editor.changeCity}
        placeholder="例如：上海"
      />

      <TextField
        label="备注"
        value={editor.draft.notes}
        onChangeText={editor.changeNotes}
        placeholder="例如：门店位置、常去的时间"
        multiline
      />

      {/* 任务书第五节要求这句话出现在页面上：改名不回写历史。 */}
      <Text style={styles.notice}>
        修改只影响以后选择该机构时显示的名称和城市，已有套餐与核销记录会保留当时的信息。
      </Text>

      {editor.isArchived ? (
        <View style={styles.archiveBlock}>
          <Button
            label={editor.changingArchive ? '正在恢复…' : '恢复机构'}
            variant="secondary"
            loading={editor.changingArchive}
            onPress={restore}
            accessibilityLabel={`恢复机构${detail.name}`}
          />
          <Text style={styles.archiveHint}>
            恢复后它会重新出现在新增套餐和记录核销的机构列表里。
          </Text>
        </View>
      ) : (
        <View style={styles.archiveBlock}>
          {/* 次要危险操作：白底 + 珊瑚色描边，不铺大面积红（UI_REFERENCE 第 10 章）。 */}
          <Button
            label={editor.changingArchive ? '正在归档…' : '归档机构'}
            variant="danger"
            loading={editor.changingArchive}
            onPress={confirmArchive}
            accessibilityLabel={`归档机构${detail.name}`}
          />
          <Text style={styles.archiveHint}>
            归档只是让它不再出现在机构选择列表里，已有套餐与核销记录都会保留。
          </Text>
        </View>
      )}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  statusBlock: {
    gap: Layout.tightGap,
  },
  statusLine: {
    ...TextStyles.bodyStrong,
    color: Colors.textPrimary,
  },
  statusMeta: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  notice: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  archiveBlock: {
    gap: Layout.labelGap,
  },
  archiveHint: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
});
