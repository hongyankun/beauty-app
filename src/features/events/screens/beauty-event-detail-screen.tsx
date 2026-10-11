import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button, Card, EmptyState, InlineNotice, Screen, SectionHeader, TextField } from '@/components/ui';
import { DangerConfirmModal, type DangerConfirmFact } from '@/features/purchases/components/danger-confirm-modal';
import { PurchaseCardSkeleton } from '@/features/purchases/components/purchase-card-skeleton';
import { isRedeemedAfterExpiry } from '@/features/purchases/redemption-draft';
import { toUserMessage } from '@/features/purchases/services/errors';
import { voidRedemption } from '@/features/purchases/services/void-redemption';
import { useDataAccess } from '@/hooks/use-data-access';
import { BorderWidth, Colors, Layout, Radii, Spacing, TextStyles } from '@/theme';
import { formatTimestampAsLocalMinute } from '@/utils/timestamp';
import { ChoiceModal, type ChoiceOption } from '../components/choice-modal';
import { useBeautyEventDetail } from '../hooks/use-beauty-event-detail';
import {
  correctUsageSource,
  listCorrectionCandidates,
  type UsageSourceTarget,
} from '../services/correct-usage-source';
import {
  deleteBeautyEvent,
  getBeautyEventDeletionImpact,
  type BeautyEventDeletionImpact,
} from '../services/delete-beauty-event';
import type { BeautyEventDetail, BeautyEventDetailUsage } from '../services/get-beauty-event-detail';
import type { UsageSourceCandidate } from '../services/list-usage-source-candidates';

/**
 * 变美记录详情（BT-0023 裁决 3：操作闭环所需的最小详情）。
 *
 * 展示这次到店的日期、机构、地点快照、备注与全部使用记录（含已撤销），并提供四个操作：
 * 编辑这次记录（日期、机构、备注）、撤销单条、修正单条的来源、删除整条记录。
 * 使用人、项目与每条的备注保存后不能直接修改（裁决 4）。完整的变美历史与最终展示属于 BT-0024。
 *
 * 页面上没有实心主按钮：编辑与修正是普通次要操作，撤销与删除是危险操作，用描边。
 */

type CorrectionState = {
  readonly usage: BeautyEventDetailUsage;
  readonly candidates: readonly UsageSourceCandidate[];
};

const EXTERNAL_KEY = '__external__';
const UNLINKED_KEY = '__unlinked__';

export function BeautyEventDetailScreen() {
  const router = useRouter();
  const dataAccess = useDataAccess();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { status, detail, reload } = useBeautyEventDetail(eventId);

  const [voidTarget, setVoidTarget] = useState<BeautyEventDetailUsage | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);

  const [correction, setCorrection] = useState<CorrectionState | null>(null);
  /** 修正来源时是否也列出单次购买，默认只看套餐（PRD 第 5B.8 节）。 */
  const [showSingles, setShowSingles] = useState(false);
  const [loadingCorrection, setLoadingCorrection] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const [deleteImpact, setDeleteImpact] = useState<BeautyEventDeletionImpact | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // 各操作的提交闸门：同一帧内的第二次点击就能被挡住。
  const busy = useRef(false);
  /** 异步操作返回时页面可能已经离开；离开后不再更新任何状态。 */
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/records');
    }
  }, [router]);

  const openEdit = useCallback(() => {
    router.push({ pathname: '/event/[eventId]/edit', params: { eventId } });
  }, [router, eventId]);

  const openPurchase = useCallback(
    (purchaseId: string) => {
      router.push(`/(tabs)/records/${purchaseId}`);
    },
    [router],
  );

  // ---------- 撤销 ----------
  const openVoid = useCallback((usage: BeautyEventDetailUsage) => {
    setVoidError(null);
    setVoidReason('');
    setVoidTarget(usage);
  }, []);

  const confirmVoid = useCallback(async () => {
    const target = voidTarget;
    if (target === null || busy.current) {
      return;
    }
    busy.current = true;
    setVoiding(true);
    setVoidError(null);
    try {
      await voidRedemption(dataAccess, { redemptionId: target.id, reason: voidReason });
      if (mounted.current) {
        setVoidTarget(null);
      }
    } catch (error) {
      const message = toUserMessage(error, '没能撤销这一条，请重试。');
      if (mounted.current) {
        setVoidError(message);
      }
    } finally {
      busy.current = false;
      if (mounted.current) {
        setVoiding(false);
        reload();
      }
    }
  }, [dataAccess, voidTarget, voidReason, reload]);

  // ---------- 修正来源 ----------
  const openCorrection = useCallback(
    async (usage: BeautyEventDetailUsage) => {
      if (busy.current) {
        return;
      }
      busy.current = true;
      setLoadingCorrection(usage.id);
      setPageError(null);
      try {
        const candidates = await listCorrectionCandidates(dataAccess, usage.id);
        if (mounted.current) {
          setCorrectionError(null);
          setShowSingles(false);
          setCorrection({ usage, candidates });
        }
      } catch (error) {
        const message = toUserMessage(error, '没能读取可关联的套餐，请重试。');
        if (mounted.current) {
          setPageError(message);
          reload();
        }
      } finally {
        busy.current = false;
        if (mounted.current) {
          setLoadingCorrection(null);
        }
      }
    },
    [dataAccess, reload],
  );

  const submitCorrection = useCallback(
    async (target: UsageSourceTarget, confirmedAfterExpiry: boolean) => {
      const current = correction;
      if (current === null || busy.current) {
        return;
      }
      busy.current = true;
      setCorrecting(true);
      setCorrectionError(null);
      try {
        await correctUsageSource(dataAccess, { usageId: current.usage.id, target, confirmedAfterExpiry });
        if (mounted.current) {
          setCorrection(null);
        }
      } catch (error) {
        const message = toUserMessage(error, '没能修改来源，请重试。');
        if (mounted.current) {
          setCorrectionError(message);
        }
      } finally {
        busy.current = false;
        if (mounted.current) {
          setCorrecting(false);
          reload();
        }
      }
    },
    [correction, dataAccess, reload],
  );

  const confirmCorrection = useCallback(
    (key: string) => {
      if (correction === null || detail === null) {
        return;
      }
      if (key === EXTERNAL_KEY || key === UNLINKED_KEY) {
        void submitCorrection({ kind: key === EXTERNAL_KEY ? 'external' : 'unlinked' }, false);
        return;
      }
      const candidate = correction.candidates.find((c) => c.purchaseItemId === key);
      if (candidate === undefined) {
        return;
      }
      const target: UsageSourceTarget = { kind: 'purchase_item', purchaseItemId: candidate.purchaseItemId };
      // ADR-017：日期晚于有效期时先确认，确认后才带着确认标记提交。
      if (isRedeemedAfterExpiry(detail.occurredOn, candidate.expiresOn)) {
        Alert.alert(
          '这次记录的日期已超过套餐有效期，是否仍要关联？',
          `「${candidate.purchaseName}」有效期至 ${candidate.expiresOn ?? ''}，这次记录的日期为 ${detail.occurredOn}。`,
          [
            { text: '返回检查', style: 'cancel' },
            { text: '仍然关联', onPress: () => void submitCorrection(target, true) },
          ],
        );
        return;
      }
      void submitCorrection(target, false);
    },
    [correction, detail, submitCorrection],
  );

  // ---------- 删除整条记录 ----------
  const openDelete = useCallback(async () => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setLoadingImpact(true);
    setDeleteError(null);
    try {
      const impact = await getBeautyEventDeletionImpact(dataAccess, eventId);
      if (mounted.current) {
        setDeleteImpact(impact);
      }
    } catch (error) {
      const message = toUserMessage(error, '没能读取这条记录的影响范围，请重试。');
      if (mounted.current) {
        setPageError(message);
        reload();
      }
    } finally {
      busy.current = false;
      if (mounted.current) {
        setLoadingImpact(false);
      }
    }
  }, [dataAccess, eventId, reload]);

  const confirmDelete = useCallback(async () => {
    const impact = deleteImpact;
    if (impact === null || busy.current) {
      return;
    }
    busy.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteBeautyEvent(dataAccess, { eventId, confirmedImpact: impact });
      if (!mounted.current) {
        return;
      }
      setDeleteImpact(null);
      // 弹掉详情这一层，回到进入它的页面；返回手势不会再回到一条已经不存在的记录。
      // 成功路径不解除闸门：页面正在离开。
      goBack();
    } catch (error) {
      const message = toUserMessage(error, '没能删除这条记录，请重试。');
      busy.current = false;
      if (mounted.current) {
        setDeleteError(message);
        setDeleting(false);
        reload();
      }
    }
  }, [dataAccess, deleteImpact, eventId, goBack, reload]);

  if (status === 'loading' && detail === null) {
    return (
      <Screen title="变美记录" onBack={goBack}>
        <PurchaseCardSkeleton accessibilityLabel="正在载入变美记录" />
      </Screen>
    );
  }

  if (status === 'notFound') {
    return (
      <Screen title="变美记录" onBack={goBack}>
        <EmptyState
          icon="inbox"
          title="找不到这条变美记录"
          description="它可能已经被删除了。"
          actionLabel="返回"
          onActionPress={goBack}
        />
      </Screen>
    );
  }

  if (detail === null) {
    return (
      <Screen title="变美记录" onBack={goBack}>
        <InlineNotice tone="warning" message="没能读取这条变美记录。" actionLabel="重试" onActionPress={reload} />
      </Screen>
    );
  }

  const correctionSingles =
    correction === null ? 0 : correction.candidates.filter((c) => c.purchaseKind === 'single').length;
  const correctionOptions: ChoiceOption[] =
    correction === null
      ? []
      : [
          ...correction.candidates
            .filter((candidate) => candidate.purchaseKind === 'package' || showSingles)
            .map((candidate) => ({
            key: candidate.purchaseItemId,
            title: candidate.purchaseName,
            detail: [
              `项目「${candidate.itemName}」`,
              `剩余 ${candidate.remaining} 次`,
              candidate.expiresOn === null ? null : `有效期至 ${candidate.expiresOn}`,
            ]
              .filter((part): part is string => part !== null)
              .join(' · '),
            tag: candidate.purchaseKind === 'single' ? '单次' : undefined,
          })),
          ...(correction.usage.sourceKind === 'external'
            ? []
            : [{ key: EXTERNAL_KEY, title: '外部来源', detail: '不扣自己套餐的次数' }]),
          ...(correction.usage.sourceKind === 'unlinked'
            ? []
            : [{ key: UNLINKED_KEY, title: '暂不关联', detail: '不关联任何来源' }]),
        ];

  return (
    <Screen title="变美记录" subtitle={detail.occurredOn} onBack={goBack}>
      {status === 'error' ? (
        <InlineNotice
          tone="warning"
          message="没能刷新这条记录，下面显示的可能不是最新内容。"
          actionLabel="重试"
          onActionPress={reload}
        />
      ) : null}
      {pageError ? <InlineNotice tone="warning" message={pageError} /> : null}

      <EventSummaryCard detail={detail} />
      <Button label="编辑这次记录" onPress={openEdit} accessibilityLabel="编辑这次记录的日期、机构与备注" />

      <SectionHeader title={`项目（${detail.usages.length}）`} />
      <Text style={styles.hint}>
        使用人、项目与每一条的备注保存后不能直接修改；记错了请撤销那一条，再重新记录一次。
      </Text>
      {detail.usages.map((usage) => (
        <UsageCard
          key={usage.id}
          usage={usage}
          loadingCorrection={loadingCorrection === usage.id}
          onVoid={openVoid}
          onCorrect={(target) => void openCorrection(target)}
          onOpenPurchase={openPurchase}
        />
      ))}

      <View style={styles.danger}>
        <SectionHeader title="危险操作" />
        <Button
          label={loadingImpact ? '正在读取影响范围…' : '删除这次记录'}
          variant="danger"
          loading={loadingImpact}
          onPress={() => void openDelete()}
          accessibilityLabel="删除这次记录，删除后不可恢复"
        />
        <Text style={styles.hint}>
          删除会永久清除这次记录和其中的每一条使用记录（含已撤销），无法恢复。套餐、机构与使用人不会被删除。
        </Text>
      </View>

      <DangerConfirmModal
        visible={voidTarget !== null}
        title="撤销这一条？"
        description="撤销后这条记录仍会保留并标注为「已撤销」；如果它关联了套餐，对应项目的剩余次数会恢复 1 次。同一次记录里的其他项目不受影响。当前版本无法在 App 内恢复已撤销的记录。"
        facts={voidTarget === null ? undefined : describeUsage(voidTarget)}
        confirmLabel="确认撤销"
        confirmingLabel="正在撤销…"
        confirming={voiding}
        error={voidError}
        onCancel={() => {
          if (!voiding) {
            setVoidTarget(null);
          }
        }}
        onConfirm={() => void confirmVoid()}
      >
        <TextField
          label="撤销原因"
          value={voidReason}
          onChangeText={setVoidReason}
          placeholder="例如 记错了项目"
          hint="可以不填。填写后会保存在这条记录上。"
          multiline
          editable={!voiding}
        />
      </DangerConfirmModal>

      <ChoiceModal
        visible={correction !== null}
        title="修改这一条的来源"
        subtitle="只改「这一次从哪里扣」，不改做了什么项目。只列出同一个项目、仍有剩余次数的套餐。"
        options={correctionOptions}
        initialKey={null}
        confirmLabel="改成这个来源"
        confirmingLabel="正在修改…"
        confirming={correcting}
        error={correctionError}
        emptyText="没有其他可选的来源。"
        toggle={
          correctionSingles === 0
            ? undefined
            : {
                label: showSingles ? '只看套餐' : `也显示单次购买（${correctionSingles}）`,
                onPress: () => setShowSingles((previous) => !previous),
              }
        }
        onCancel={() => setCorrection(null)}
        onConfirm={confirmCorrection}
      />

      <DangerConfirmModal
        visible={deleteImpact !== null}
        title="永久删除这次记录？"
        description="这次记录和其中的每一条使用记录都会被永久删除，App 内没有回收站，也没有恢复入口。套餐、机构与使用人不会被删除。"
        facts={
          deleteImpact === null
            ? undefined
            : [
                { label: '将删除的使用记录', value: `${deleteImpact.usageCount} 条（含已撤销）` },
                { label: '会退回套餐的次数', value: `${deleteImpact.returnedCount} 次` },
              ]
        }
        confirmLabel="永久删除"
        confirmingLabel="正在删除…"
        confirming={deleting}
        error={deleteError}
        onCancel={() => {
          if (!deleting) {
            setDeleteImpact(null);
          }
        }}
        onConfirm={() => void confirmDelete()}
      />
    </Screen>
  );
}

function describeUsage(usage: BeautyEventDetailUsage): readonly DangerConfirmFact[] {
  return [
    { label: '项目', value: usage.serviceName },
    { label: '来源', value: usage.sourceLabel },
    { label: '使用人', value: usage.personName },
  ];
}

function EventSummaryCard({ detail }: { detail: BeautyEventDetail }) {
  return (
    <Card style={styles.summary}>
      <Row label="日期" value={detail.occurredOn} />
      <Row label="机构" value={detail.institutionName ?? '未填写机构'} />
      {detail.locationLabel === null ? null : <Row label="地点" value={detail.locationLabel} />}
      {detail.notes === null ? null : <Row label="备注" value={detail.notes} />}
      <Row label="项目" value={`${detail.usages.length} 条，其中有效 ${detail.activeCount} 条`} />
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label} ${value}`}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

type UsageCardProps = {
  usage: BeautyEventDetailUsage;
  loadingCorrection: boolean;
  onVoid: (usage: BeautyEventDetailUsage) => void;
  onCorrect: (usage: BeautyEventDetailUsage) => void;
  onOpenPurchase: (purchaseId: string) => void;
};

/**
 * 一条使用记录。已撤销的保留可见并以文字标注「已撤销」，不只靠颜色（PRD-NFR-005）；
 * 已撤销的记录没有撤销与修正来源的入口（DATA_MODEL_V4 第 5.5 节）。
 */
function UsageCard({ usage, loadingCorrection, onVoid, onCorrect, onOpenPurchase }: UsageCardProps) {
  const voidedAt = usage.voidedAt === null ? null : formatTimestampAsLocalMinute(usage.voidedAt);
  const purchaseId = usage.purchaseId;
  const label = [
    usage.serviceName,
    usage.statusLabel,
    usage.categoryLabel,
    usage.sourceLabel,
    `使用人 ${usage.personName}`,
    usage.notes,
    voidedAt === null ? null : `撤销于 ${voidedAt}`,
    usage.voidReason === null ? null : `撤销原因 ${usage.voidReason}`,
  ]
    .filter((part): part is string => part !== null)
    .join('，');

  return (
    <Card style={styles.usage}>
      <View accessible accessibilityLabel={label} style={styles.usageBody}>
        <View style={styles.usageHeader}>
          <Text style={[styles.usageName, usage.isVoided ? styles.muted : null]}>{usage.serviceName}</Text>
          <View style={[styles.tag, usage.isVoided ? styles.tagVoid : styles.tagActive]}>
            <Text style={styles.tagLabel}>{usage.statusLabel}</Text>
          </View>
        </View>
        <Text style={styles.meta}>{usage.categoryLabel}</Text>
        <Text style={styles.meta}>来源：{usage.sourceLabel}</Text>
        <Text style={styles.meta}>使用人：{usage.personName}</Text>
        {usage.notes === null ? null : <Text style={styles.meta}>{usage.notes}</Text>}
        {voidedAt === null ? null : <Text style={styles.meta}>撤销于 {voidedAt}</Text>}
        {usage.voidReason === null ? null : <Text style={styles.meta}>撤销原因：{usage.voidReason}</Text>}
      </View>

      {usage.isVoided ? null : (
        <View style={styles.actions}>
          <Button
            label={loadingCorrection ? '正在读取…' : '修改来源'}
            variant="text"
            loading={loadingCorrection}
            onPress={() => onCorrect(usage)}
            accessibilityLabel={`修改来源，${usage.serviceName}`}
          />
          <Button
            label="撤销这一条"
            variant="danger"
            onPress={() => onVoid(usage)}
            accessibilityLabel={`撤销这一条，${usage.serviceName}`}
          />
        </View>
      )}
      {purchaseId === null ? null : (
        <Button
          label="查看套餐"
          variant="text"
          onPress={() => onOpenPurchase(purchaseId)}
          accessibilityLabel={`查看套餐，${usage.sourceLabel}`}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  hint: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  summary: {
    gap: Layout.labelGap,
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
  usage: {
    gap: Layout.cardGap,
  },
  usageBody: {
    gap: Layout.tightGap,
  },
  usageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Layout.iconGap,
  },
  usageName: {
    ...TextStyles.bodyStrong,
    color: Colors.textPrimary,
    flex: 1,
  },
  muted: {
    color: Colors.textSecondary,
  },
  tag: {
    flexShrink: 0,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radii.tag,
    borderWidth: BorderWidth.hairline,
  },
  tagActive: {
    backgroundColor: Colors.mintLight,
    borderColor: Colors.mintLight,
  },
  tagVoid: {
    backgroundColor: Colors.backgroundWarm,
    borderColor: Colors.borderLight,
  },
  tagLabel: {
    ...TextStyles.caption,
    color: Colors.textPrimary,
  },
  meta: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  actions: {
    gap: Layout.tightGap,
  },
  danger: {
    gap: Layout.cardGap,
    paddingTop: Layout.sectionGap,
  },
});
