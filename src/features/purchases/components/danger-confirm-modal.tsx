import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Button, InlineNotice } from '@/components/ui';
import { BorderWidth, Colors, Layout, Radii, Shadows, Spacing, TextStyles } from '@/theme';

export type DangerConfirmFact = {
  readonly label: string;
  readonly value: string;
};

export type DangerConfirmModalProps = {
  visible: boolean;
  title: string;
  /** 会发生什么、影响到哪些数据、能不能撤回，一段说完 */
  description: string;
  /** 标题下的事实清单，例如项目名称、原核销日期、将删除的记录条数 */
  facts?: readonly DangerConfirmFact[];
  confirmLabel: string;
  /** 进行中的按钮文案，例如「正在撤销…」 */
  confirmingLabel: string;
  cancelLabel?: string;
  confirming: boolean;
  /** 上一次失败的原因；用户能看懂的一句话，不含 SQL 与堆栈 */
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  /** 额外的输入区，例如撤销原因 */
  children?: ReactNode;
};

/**
 * 危险操作的二次确认弹层。
 *
 * 用 React Native 自带的 `Modal`，不引入第三方弹层库（ADR-011）：
 * 它在 iOS 与 Android 上都是真正的原生浮层，读屏焦点会被限制在弹层内部。
 *
 * 三条刻意的取舍：
 * 1. **点击遮罩不关闭**。撤销原因是可以慢慢写的，误触遮罩把输入丢掉
 *    比多点一次「取消」糟糕得多。出口只有取消按钮与系统返回。
 * 2. **弹层内没有实心主按钮**。危险操作用 `danger`（白底 + coral 描边），
 *    取消用 `secondary`，两个都不是实心，不会出现两个主操作抢视线
 *    （UI_REFERENCE 第 10 章）。
 * 3. **按钮竖排**。横排在系统字体放大后必然截断按钮文案，
 *    而这两句文案正是用户判断「我按下去会发生什么」的依据（PRD-NFR-006）。
 *
 * 进行中时按钮禁用、取消禁用、系统返回不生效：写库过程中不留可中断的缺口。
 */
export function DangerConfirmModal({
  visible,
  title,
  description,
  facts,
  confirmLabel,
  confirmingLabel,
  cancelLabel = '取消',
  confirming,
  error,
  onCancel,
  onConfirm,
  children,
}: DangerConfirmModalProps) {
  /** 进行中时不响应 Android 实体返回键与系统关闭手势。 */
  const handleRequestClose = () => {
    if (!confirming) {
      onCancel();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleRequestClose}
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* 遮罩单独一层且不可点击：它只负责压暗背景。
            颜色取自 textPrimary + 透明度，不新引入色值。 */}
        <View style={[StyleSheet.absoluteFill, styles.scrim]} pointerEvents="none" />

        <View style={styles.dialog} accessibilityViewIsModal>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* 标题与说明合成一个读屏节点：打开弹层后第一句话就把
                「要做什么、后果是什么」讲完，而不是先念一个孤立的标题。 */}
            <View
              accessible
              accessibilityRole="header"
              accessibilityLabel={`${title}。${description}`}
              style={styles.heading}
            >
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.description}>{description}</Text>
            </View>

            {facts && facts.length > 0 ? (
              <View style={styles.facts}>
                {facts.map((fact) => (
                  <View
                    key={fact.label}
                    style={styles.factRow}
                    accessible
                    accessibilityLabel={`${fact.label} ${fact.value}`}
                  >
                    <Text style={styles.factLabel}>{fact.label}</Text>
                    <Text style={styles.factValue}>{fact.value}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {children}

            {error ? <InlineNotice tone="warning" message={error} /> : null}
          </ScrollView>

          <View style={styles.actions}>
            <Button
              label={confirming ? confirmingLabel : confirmLabel}
              variant="danger"
              loading={confirming}
              onPress={onConfirm}
              accessibilityLabel={confirming ? confirmingLabel : `${confirmLabel}，${title}`}
            />
            <Button
              label={cancelLabel}
              variant="secondary"
              disabled={confirming}
              disabledReason={confirming ? '正在处理，请稍候' : undefined}
              onPress={onCancel}
              accessibilityLabel={`${cancelLabel}，不做任何改动`}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Layout.pageHorizontal,
  },
  scrim: {
    backgroundColor: Colors.textPrimary,
    opacity: 0.32,
  },
  dialog: {
    // 大面积浮层用 20 圆角（UI_REFERENCE 第 6.1 章）。
    backgroundColor: Colors.surface,
    borderRadius: Radii.sheet,
    borderWidth: BorderWidth.hairline,
    borderColor: Colors.borderLight,
    padding: Layout.cardPadding,
    gap: Layout.cardGap,
    // 内容再长也不会顶穿屏幕，超出部分交给上面的 ScrollView。
    maxHeight: '80%',
    ...Shadows.overlay,
  },
  content: {
    gap: Layout.cardGap,
    paddingBottom: Spacing.xs,
  },
  heading: {
    gap: Layout.labelGap,
  },
  title: {
    ...TextStyles.sectionTitle,
    color: Colors.textPrimary,
  },
  description: {
    ...TextStyles.body,
    color: Colors.textSecondary,
  },
  facts: {
    gap: Layout.labelGap,
  },
  factRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.lg,
  },
  factLabel: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  factValue: {
    ...TextStyles.body,
    color: Colors.textPrimary,
    flexShrink: 1,
    textAlign: 'right',
  },
  actions: {
    gap: Layout.labelGap,
  },
});
