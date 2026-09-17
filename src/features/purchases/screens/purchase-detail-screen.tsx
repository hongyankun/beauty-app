import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import {
  Button,
  Card,
  EmptyState,
  InlineNotice,
  Screen,
  SectionHeader,
  TextField,
} from '@/components/ui';
import { useDataAccess } from '@/hooks/use-data-access';
import { Colors, Layout, Spacing, TextStyles } from '@/theme';
import { formatMinorAsYuan } from '@/utils/money';
import { DangerConfirmModal, type DangerConfirmFact } from '../components/danger-confirm-modal';
import { PurchaseCardSkeleton } from '../components/purchase-card-skeleton';
import { PurchaseItemCard } from '../components/purchase-item-card';
import { RedemptionRow } from '../components/redemption-row';
import { usePurchaseDetail } from '../hooks/use-purchase-detail';
import {
  deletePurchasePermanently,
  getPurchaseDeletionImpact,
  type PurchaseDeletionImpact,
} from '../services/delete-purchase';
import { toUserMessage } from '../services/errors';
import type {
  PurchaseDetail,
  PurchaseDetailRedemption,
} from '../services/get-purchase-detail';
import { voidRedemption } from '../services/void-redemption';

/**
 * 套餐详情。
 *
 * 用 `FlatList` 承载核销历史，套餐信息与项目列表放进 `ListHeaderComponent`：
 * 一个套餐的项目通常只有几个，而核销记录会一直累积，需要虚拟化的是后者
 * （PRD-NFR-007）。项目卡片若也铺进列表，就要把两种完全不同的行混在同一个
 * `data` 里，反而更难读。
 *
 * 余次不在这里计算，由 `getPurchaseDetail` 从数据库派生（ARCHITECTURE 第三节）。
 * 撤销与删除也不在这里执行 SQL，页面只负责确认交互与刷新（任务书第六、八节）。
 */
export function PurchaseDetailScreen() {
  const router = useRouter();
  const dataAccess = useDataAccess();
  const { purchaseId } = useLocalSearchParams<{ purchaseId: string }>();
  const { status, detail, reload } = usePurchaseDetail(purchaseId);

  /** 正在确认撤销的那条核销；为 null 时弹层不显示。 */
  const [voidTarget, setVoidTarget] = useState<PurchaseDetailRedemption | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);

  /** 确认框里的影响范围，来自数据库的实时统计；为 null 时弹层不显示。 */
  const [deleteImpact, setDeleteImpact] = useState<PurchaseDeletionImpact | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // 三个提交闸门。放在 ref 而不是 state 里，连点两次时第二次同步就能被挡住
  // （任务书第十节）。状态更新是异步的，靠 state 拦不住同一帧内的第二次点击。
  const voidingRef = useRef(false);
  const loadingImpactRef = useRef(false);
  const deletingRef = useRef(false);
  /** 上一次打开撤销弹层的记录，用来判断要不要清空已填写的原因。 */
  const lastVoidTargetId = useRef<string | null>(null);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/records');
    }
  }, [router]);

  const openRedemption = useCallback(
    (purchaseItemId: string) => {
      // 路由只带 ID，不把业务对象塞进参数（任务书第五节）；
      // `purchaseId` 用于保存成功后准确返回到这个详情页。
      router.push({
        pathname: '/redeem/[purchaseItemId]',
        params: { purchaseItemId, purchaseId },
      });
    },
    [router, purchaseId],
  );

  const openEdit = useCallback(() => {
    // 编辑页挂在根 Stack 上，覆盖 Tab 栏（IA 第 4.3 节第 1 条）。
    // 用 push 而不是 replace：保存或取消后 back 回来的就是这个详情页，
    // 它在重新获得焦点时会重读，展示的是刚保存的内容。
    router.push({ pathname: '/purchase/[purchaseId]/edit', params: { purchaseId } });
  }, [router, purchaseId]);

  const openVoid = useCallback((redemption: PurchaseDetailRedemption) => {
    // 换一条记录才清空原因。同一条记录取消后重新打开，用户写过的字还在
    // （任务书第五节：失败或取消都不丢输入）。
    if (lastVoidTargetId.current !== redemption.id) {
      setVoidReason('');
      lastVoidTargetId.current = redemption.id;
    }
    setVoidError(null);
    setVoidTarget(redemption);
  }, []);

  const cancelVoid = useCallback(() => {
    if (voidingRef.current) {
      return;
    }
    // 取消不写数据库，记录保持有效，已填写的原因原样留着。
    setVoidTarget(null);
    setVoidError(null);
  }, []);

  const confirmVoid = useCallback(async () => {
    const target = voidTarget;
    if (target === null || voidingRef.current) {
      return;
    }
    voidingRef.current = true;
    setVoiding(true);
    setVoidError(null);

    try {
      await voidRedemption(dataAccess, { redemptionId: target.id, reason: voidReason });
      setVoidTarget(null);
      setVoidReason('');
      lastVoidTargetId.current = null;
    } catch (error) {
      // 弹层留在原地，原因保留，用户可以直接重试（任务书第五节）。
      setVoidError(toUserMessage(error, '没能撤销这条核销，请重试。'));
    } finally {
      voidingRef.current = false;
      setVoiding(false);
      // 成功与失败都重读一次：失败常常正是因为页面上的这份数据已经过期。
      reload();
    }
  }, [dataAccess, voidTarget, voidReason, reload]);

  const openDelete = useCallback(async () => {
    if (loadingImpactRef.current || deletingRef.current) {
      return;
    }
    loadingImpactRef.current = true;
    setLoadingImpact(true);
    setDeleteError(null);

    try {
      // 先读最新影响范围再弹确认：确认框里的数字必须来自数据库，
      // 不能拿页面上那份可能已经过期的数组长度去猜（任务书第八节）。
      const impact = await getPurchaseDeletionImpact(dataAccess, purchaseId);
      if (impact === null) {
        setDeleteError('这个套餐已经不存在了，可能已经被删除。');
        reload();
        return;
      }
      setDeleteImpact(impact);
    } catch (error) {
      setDeleteError(toUserMessage(error, '没能读取这个套餐的影响范围，请重试。'));
    } finally {
      loadingImpactRef.current = false;
      setLoadingImpact(false);
    }
  }, [dataAccess, purchaseId, reload]);

  const cancelDelete = useCallback(() => {
    if (deletingRef.current) {
      return;
    }
    setDeleteImpact(null);
    setDeleteError(null);
  }, []);

  const confirmDelete = useCallback(async () => {
    const impact = deleteImpact;
    if (impact === null || deletingRef.current) {
      return;
    }
    deletingRef.current = true;
    setDeleting(true);
    setDeleteError(null);

    try {
      await deletePurchasePermanently(dataAccess, impact.purchaseId);
      setDeleteImpact(null);
      // 用 replace 而不是 back：详情这一层直接从导航栈里被换掉，
      // 返回手势不会再回到一个已经不存在的套餐（任务书第七节）。
      // 记录列表在获得焦点时会重读，被删套餐立刻从三个筛选里消失。
      router.replace('/(tabs)/records');
      // 成功路径不解除闸门：页面正在离开，按钮保持禁用直到卸载。
    } catch (error) {
      // 删除失败留在详情页，把原因说清楚（任务书第七节）。
      setDeleteError(toUserMessage(error, '没能删除这个套餐，请重试。'));
      deletingRef.current = false;
      setDeleting(false);
    }
  }, [dataAccess, deleteImpact, router]);

  const renderRedemption = useCallback(
    ({ item }: { item: PurchaseDetailRedemption }) => (
      <RedemptionRow redemption={item} onVoid={openVoid} />
    ),
    [openVoid],
  );

  if (status === 'loading' && detail === null) {
    return (
      <Screen title="套餐详情" onBack={goBack}>
        <PurchaseCardSkeleton />
      </Screen>
    );
  }

  if (status === 'notFound') {
    return (
      <Screen title="套餐详情" onBack={goBack}>
        <EmptyState
          icon="inbox"
          title="找不到这个套餐"
          description="它可能已经被删除了。返回列表看看其他套餐。"
          actionLabel="返回列表"
          onActionPress={goBack}
        />
      </Screen>
    );
  }

  if (detail === null) {
    return (
      <Screen title="套餐详情" onBack={goBack}>
        <InlineNotice
          tone="warning"
          message="没能读取这个套餐。"
          actionLabel="重试"
          onActionPress={reload}
        />
      </Screen>
    );
  }

  return (
    <Screen title={detail.name} onBack={goBack} scrollable={false}>
      <FlatList
        data={detail.redemptions}
        keyExtractor={(item) => item.id}
        renderItem={renderRedemption}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            {status === 'error' ? (
              <InlineNotice
                tone="warning"
                message="没能刷新这个套餐，下面显示的可能不是最新内容。"
                actionLabel="重试"
                onActionPress={reload}
              />
            ) : null}

            <PurchaseSummaryCard detail={detail} />

            {/*
              编辑入口紧跟在套餐信息下面：要改的正是上面那张卡里的内容。
              用 secondary 描边按钮，与整页底部的 danger 删除按钮拉开层级——
              修改是常规操作，永久删除不是（UI_REFERENCE 第 10 章）。
            */}
            <Button
              label="编辑套餐"
              variant="secondary"
              onPress={openEdit}
              accessibilityLabel={`编辑套餐 ${detail.name}`}
            />

            <SectionHeader title={`项目（${detail.itemCount}）`} />
            <View style={styles.items}>
              {detail.items.map((item) => (
                <PurchaseItemCard key={item.id} item={item} onRedeem={openRedemption} />
              ))}
            </View>

            <SectionHeader title="核销历史" />
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="calendar"
            title="还没有核销记录"
            description="做完一次项目后，在上面的项目里点「核销一次」，这里就会留下记录。"
          />
        }
        ListFooterComponent={
          // 危险操作单独成组，压在整页最下面，用低强调度的描边按钮
          // （UI_REFERENCE 第 10、15 章）。
          <View style={styles.danger}>
            <SectionHeader title="危险操作" />
            {deleteImpact === null && deleteError !== null ? (
              <InlineNotice tone="warning" message={deleteError} />
            ) : null}
            <Button
              label={loadingImpact ? '正在读取影响范围…' : '删除套餐'}
              variant="danger"
              loading={loadingImpact}
              onPress={() => void openDelete()}
              accessibilityLabel={`删除套餐 ${detail.name}，删除后不可恢复`}
            />
            <Text style={styles.dangerHint}>
              删除会连同这个套餐的项目与全部核销记录一起永久清除，无法恢复。机构不会被删除。
            </Text>
          </View>
        }
      />

      <DangerConfirmModal
        visible={voidTarget !== null}
        title="撤销这次核销？"
        description="撤销后这条记录仍会保留在核销历史里，并标注为「已撤销」，对应项目的剩余次数会恢复 1 次。当前版本无法在 App 内恢复已撤销的核销。"
        facts={voidTarget === null ? undefined : describeRedemption(voidTarget)}
        confirmLabel="确认撤销"
        confirmingLabel="正在撤销…"
        confirming={voiding}
        error={voidError}
        onCancel={cancelVoid}
        onConfirm={() => void confirmVoid()}
      >
        <TextField
          label="撤销原因"
          value={voidReason}
          onChangeText={setVoidReason}
          placeholder="例如 记错了日期"
          hint="可以不填。填写后会保存在这条记录上。"
          multiline
          editable={!voiding}
        />
      </DangerConfirmModal>

      <DangerConfirmModal
        visible={deleteImpact !== null}
        title="永久删除这个套餐？"
        description="删除后不可恢复：App 内没有回收站，也没有恢复入口。这些记录将不再进入任何历史统计。机构不会被删除，以后仍可选用。"
        facts={deleteImpact === null ? undefined : describeDeletionImpact(deleteImpact)}
        confirmLabel="永久删除"
        confirmingLabel="正在删除…"
        confirming={deleting}
        error={deleteError}
        onCancel={cancelDelete}
        onConfirm={() => void confirmDelete()}
      />
    </Screen>
  );
}

/** 撤销确认框里的事实清单：动的是哪一条记录（任务书第五节）。 */
function describeRedemption(redemption: PurchaseDetailRedemption): readonly DangerConfirmFact[] {
  const institution = redemption.institutionName ?? '未填写机构';
  return [
    { label: '项目', value: redemption.itemName },
    { label: '原核销日期', value: redemption.redeemedOn },
    {
      label: '机构',
      value: redemption.city === null ? institution : `${institution} · ${redemption.city}`,
    },
  ];
}

/** 删除确认框里的影响范围。数量来自数据库实时统计，不是页面数组的长度。 */
function describeDeletionImpact(impact: PurchaseDeletionImpact): readonly DangerConfirmFact[] {
  return [
    { label: '套餐', value: impact.purchaseName },
    { label: '将删除的项目', value: `${impact.itemCount} 个` },
    // 已撤销的记录同样会被删除，数字里必须含它们，并且说明白。
    { label: '将删除的核销记录', value: `${impact.redemptionCount} 条（含已撤销）` },
  ];
}

/**
 * 套餐层的信息与合计。选填字段没有值时整行不展示（任务书第六节）。
 *
 * 三项合计与其余信息用同一种行排版：它们是同一层级的事实，
 * 单独做成一排缩写数字反而让「总购买 / 已核销 / 总剩余」的完整含义读不出来。
 * 数值全部来自 `getPurchaseDetail` 的派生结果，这里不重新计算。
 */
function PurchaseSummaryCard({ detail }: { detail: PurchaseDetail }) {
  return (
    <Card style={styles.summary}>
      <Row label="机构" value={detail.institutionName ?? '未填写机构'} />
      {detail.city ? <Row label="城市" value={detail.city} /> : null}
      <Row label="购买日期" value={detail.purchaseDate} />
      <Row label="总价" value={formatMinorAsYuan(detail.totalAmountMinor)} />
      {detail.expiresOn ? <Row label="有效期" value={`至 ${detail.expiresOn}`} /> : null}
      <Row label="项目总数" value={`${detail.itemCount} 个`} />
      <Row label="总购买次数" value={`${detail.totalQuantity} 次`} />
      <Row label="已核销次数" value={`${detail.redeemedCount} 次`} />
      <Row label="总剩余次数" value={`${detail.remaining} 次`} emphasized />
      {detail.notes ? <Row label="备注" value={detail.notes} /> : null}
    </Card>
  );
}

/**
 * 摘要卡里的一行。
 *
 * 整行合并成一个读屏节点，这样 VoiceOver 读到的是「总剩余次数 3 次」，
 * 而不是把标签和数字拆成两段（PRD-NFR-004）。
 */
function Row({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label} ${value}`}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, emphasized ? styles.rowValueEmphasized : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  listContent: {
    gap: Layout.cardGap,
    paddingBottom: Spacing.xxxl,
  },
  header: {
    gap: Layout.cardGap,
    paddingBottom: Layout.tightGap,
  },
  items: {
    gap: Layout.cardGap,
  },
  summary: {
    gap: Layout.labelGap,
  },
  danger: {
    gap: Layout.cardGap,
    // 与最后一条核销记录明确拉开距离，避免误以为是那条记录的操作。
    paddingTop: Layout.sectionGap,
  },
  dangerHint: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.lg,
  },
  rowLabel: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  rowValue: {
    ...TextStyles.body,
    color: Colors.textPrimary,
    flexShrink: 1,
    textAlign: 'right',
  },
  rowValueEmphasized: {
    ...TextStyles.bodyStrong,
  },
});
