import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button, EmptyState, FormScreen, InlineNotice, Screen, TextField } from '@/components/ui';
import { Colors, Layout, TextStyles } from '@/theme';
import { PurchaseCardSkeleton } from '@/features/purchases/components/purchase-card-skeleton';
import { usePersonDetail } from '../hooks/use-person-detail';
import { usePersonEditor } from '../hooks/use-person-editor';
import type { PersonSummary } from '../services/person-view';

/** 改名不回写历史，页面上必须说明（PRD 第 5B.5 节）。 */
const SNAPSHOT_NOTICE = '改名只影响以后选择这个人时显示的名称，已有套餐与使用记录会保留当时的名称。';

function useGoBackToList() {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/me/people');
    }
  }, [router]);
}

/** 新增使用人（我的 Tab 栈内）。只有一个名称。 */
export function NewPersonScreen() {
  const editor = usePersonEditor(null);

  return (
    <FormScreen
      title="添加使用人"
      subtitle="只需要一个名称，例如家人或朋友的称呼。"
      onCancel={editor.cancel}
      footer={
        <Button
          label={editor.saving ? '正在保存…' : '保存'}
          variant="primary"
          loading={editor.saving}
          onPress={editor.submit}
          accessibilityLabel="保存"
        />
      }
    >
      {editor.actionError ? <InlineNotice tone="warning" message={editor.actionError} /> : null}
      <TextField
        label="名称"
        required
        value={editor.name}
        onChangeText={editor.changeName}
        placeholder="例如：妈妈"
        error={editor.nameError ?? undefined}
      />
      <Text style={styles.notice}>不需要填写手机号、生日或任何其他个人信息。</Text>
    </FormScreen>
  );
}

/** 查看或编辑一个人（我的 Tab 栈内）。「自己」只读。 */
export function EditPersonScreen() {
  const goBack = useGoBackToList();
  const { personId } = useLocalSearchParams<{ personId: string }>();
  const { status, detail, reload } = usePersonDetail(personId);

  if (status === 'loading') {
    return (
      <Screen title="使用人" onBack={goBack} backLabel="取消">
        <PurchaseCardSkeleton accessibilityLabel="正在载入" />
      </Screen>
    );
  }

  if (status === 'notFound') {
    return (
      <Screen title="使用人" onBack={goBack} backLabel="取消">
        <EmptyState
          icon="people"
          title="找不到这个人"
          description="可能已经被删除了。返回使用人管理看看其他人。"
          actionLabel="返回使用人管理"
          onActionPress={goBack}
        />
      </Screen>
    );
  }

  if (detail === null) {
    return (
      <Screen title="使用人" onBack={goBack} backLabel="取消">
        <InlineNotice
          tone="warning"
          message="没能读取这个人的信息，暂时无法编辑。"
          actionLabel="重试"
          onActionPress={reload}
        />
      </Screen>
    );
  }

  if (detail.isSelf) {
    return <SelfPersonView detail={detail} onBack={goBack} />;
  }

  return <EditPersonForm key={detail.id} detail={detail} />;
}

/** 「自己」没有任何可写操作（PRD-PERSON-001）。 */
function SelfPersonView({ detail, onBack }: { detail: PersonSummary; onBack: () => void }) {
  return (
    <Screen title={detail.name} subtitle="固定使用人" onBack={onBack}>
      <View
        style={styles.statusBlock}
        accessible
        accessibilityLabel={`当前状态${detail.statusLabel}，${detail.usageLabel}`}
      >
        <Text style={styles.statusLine}>当前状态：{detail.statusLabel}</Text>
        <Text style={styles.statusMeta}>{detail.usageLabel}</Text>
      </View>
      <Text style={styles.notice}>
        「自己」是每个档案固定的使用人，新建套餐与记录时默认选中它。它不能改名、归档或删除。
      </Text>
    </Screen>
  );
}

function EditPersonForm({ detail }: { detail: PersonSummary }) {
  const editor = usePersonEditor(detail);

  const confirmArchive = useCallback(() => {
    Alert.alert(
      `归档「${detail.name}」？`,
      '归档后新建套餐与记录时不再能选择这个人。已有的套餐与使用记录都会保留，照常显示当时的名称。之后可以随时恢复。',
      [
        { text: '取消', style: 'cancel' },
        // 不用 destructive 样式：归档不是删除。
        { text: '归档', onPress: () => editor.setArchived(true) },
      ],
    );
  }, [detail.name, editor]);

  const confirmDelete = useCallback(() => {
    Alert.alert(`删除「${detail.name}」？`, '删除后不可恢复。这个人没有出现在任何记录里。', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: editor.remove },
    ]);
  }, [detail.name, editor.remove]);

  const restore = useCallback(() => {
    editor.setArchived(false);
  }, [editor]);

  const statusLabel = editor.isArchived ? '已归档' : '使用中';

  return (
    <FormScreen
      title="编辑使用人"
      subtitle="修改名称，或归档不再需要的人。"
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

      <View
        style={styles.statusBlock}
        accessible
        accessibilityLabel={`当前状态${statusLabel}，${detail.usageLabel}`}
      >
        <Text style={styles.statusLine}>当前状态：{statusLabel}</Text>
        <Text style={styles.statusMeta}>{detail.usageLabel}</Text>
      </View>

      <TextField
        label="名称"
        required
        value={editor.name}
        onChangeText={editor.changeName}
        placeholder="例如：妈妈"
        error={editor.nameError ?? undefined}
      />

      <Text style={styles.notice}>{SNAPSHOT_NOTICE}</Text>

      {editor.isArchived ? (
        <View style={styles.actionBlock}>
          <Button
            label={editor.changingStatus ? '正在恢复…' : '恢复'}
            variant="secondary"
            loading={editor.changingStatus}
            onPress={restore}
            accessibilityLabel={`恢复${detail.name}`}
          />
          <Text style={styles.notice}>恢复后新建套餐与记录时可以再次选择这个人。</Text>
        </View>
      ) : (
        <View style={styles.actionBlock}>
          <Button
            label={editor.changingStatus ? '正在处理…' : '归档'}
            variant="danger"
            loading={editor.changingStatus}
            onPress={confirmArchive}
            accessibilityLabel={`归档${detail.name}`}
          />
          <Text style={styles.notice}>归档只是不再出现在选择列表里，已有记录都会保留。</Text>
        </View>
      )}

      {detail.isReferenced ? (
        <Text style={styles.notice}>
          这个人已经出现在套餐或使用记录里，不能删除，只能归档。
        </Text>
      ) : (
        <View style={styles.actionBlock}>
          <Button
            label="删除"
            variant="danger"
            icon="trash"
            disabled={editor.changingStatus}
            onPress={confirmDelete}
            accessibilityLabel={`删除${detail.name}`}
          />
          <Text style={styles.notice}>这个人还没有出现在任何记录里，可以直接删除。</Text>
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
  actionBlock: {
    gap: Layout.labelGap,
  },
});
