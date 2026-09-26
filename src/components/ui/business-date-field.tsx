import ExpoDatePicker from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BorderWidth, Colors, Layout, Radii, Shadows, Spacing, TextStyles } from '@/theme';
import {
  businessDateToLocalDate,
  businessDateToUtcDate,
  compareBusinessDates,
  formatBusinessDateLabel,
  isBusinessDate,
  joinBusinessDate,
  todayBusinessDate,
  utcDateToBusinessDate,
} from '@/utils/business-date';
import {
  buildMonthGrid,
  CALENDAR_WEEKDAY_LABELS,
  initialCalendarMonth,
  isDateWithinBounds,
  isSameCalendarMonth,
  monthNavigationTarget,
  monthOfBusinessDate,
  yearNavigationTarget,
  type CalendarBounds,
  type CalendarMonth,
} from '@/utils/calendar-month';
import { Button } from './button';
import { Icon } from './icon';
import { TextField } from './text-field';

export type BusinessDateFieldProps = {
  /** 可见标签，同时是读屏标签与弹层标题的一部分 */
  label: string;
  /** 业务日期 `YYYY-MM-DD`；空字符串表示未设置 */
  value: string;
  /** 只会收到合法的 `YYYY-MM-DD`，或清除时的空字符串 */
  onChange: (value: string) => void;
  /** 必填字段不提供清除入口 */
  required?: boolean;
  /** 选填且已有值时，在字段下方提供「清除日期」 */
  clearable?: boolean;
  disabled?: boolean;
  /** 校验失败原因。同时改描边颜色与显示文字，不只变红（PRD-NFR-005） */
  error?: string;
  helperText?: string;
  /** 可选的最早日期，`YYYY-MM-DD`；不合法时忽略。只是交互提示，保存时的校验不变 */
  minimumDate?: string;
  maximumDate?: string;
  accessibilityHint?: string;
};

/**
 * 业务日期字段：整块可点，打开系统日期选择器，写回的永远是 `YYYY-MM-DD`。
 *
 * 草稿里仍是字符串，所以脏检查与校验逻辑一行不改。选择器只接收与回传 `Date`，
 * 两者之间一律经过 `@/utils/business-date` 的换算函数，不直接读写 `Date` 的时区。
 *
 * - iOS：`Modal` 内是自绘的月历（见 `MonthCalendar`），不用系统内嵌日历——SwiftUI 日历的
 *   顶部年月由系统绘制，不能换成自己的翻年翻月按钮，点它还会切到 JS 无法感知的年月滚轮。
 *   点日期只改临时选择，点「使用这个日期」才写回；「取消选择」、系统返回与关闭弹层都不改草稿。
 *   颜色全部取自主题 token，不读系统外观，所以手机开深色模式时弹层仍是浅色卡片、深色文字。
 * - Android：点击时挂载系统对话框（`presentation="dialog"`），确认写回后卸载，
 *   取消只关闭。Material 3 对话框按 UTC 日历工作，因此初始值用 UTC 中午、回传读 UTC 年月日。
 * - Web：`@expo/ui` 的日期选择器在 Web 上不渲染任何内容，这里退回文本输入，
 *   由原有的草稿校验把关，不另写一套规则。
 */
export function BusinessDateField({
  label,
  value,
  onChange,
  required = false,
  clearable = false,
  disabled = false,
  error,
  helperText,
  minimumDate,
  maximumDate,
  accessibilityHint = '双击选择日期',
}: BusinessDateFieldProps) {
  const [open, setOpen] = useState(false);
  // iOS 月历的两份状态刻意分开：翻年翻月只改 visibleMonth，点日期格子只改 pendingDate。
  // pendingDate 只有点「使用这个日期」才写回草稿。
  const [visibleMonth, setVisibleMonth] = useState<CalendarMonth | null>(null);
  const [pendingDate, setPendingDate] = useState<string | null>(null);

  if (Platform.OS === 'web') {
    return (
      <TextField
        label={label}
        required={required}
        value={value}
        onChangeText={onChange}
        placeholder="YYYY-MM-DD"
        hint={helperText ? `按 YYYY-MM-DD 填写，${helperText}` : '按 YYYY-MM-DD 填写'}
        keyboardType="numbers-and-punctuation"
        error={error}
        editable={!disabled}
      />
    );
  }

  const hasValue = value !== '';
  const minBusiness = minimumDate !== undefined && isBusinessDate(minimumDate) ? minimumDate : null;
  const maxBusiness = maximumDate !== undefined && isBusinessDate(maximumDate) ? maximumDate : null;
  // 选择器的边界按本地日历解释（iOS 与 Android 的可选范围都是如此），所以用本地中午。
  const minDate = minBusiness === null ? undefined : (businessDateToLocalDate(minBusiness) ?? undefined);
  const maxDate = maxBusiness === null ? undefined : (businessDateToLocalDate(maxBusiness) ?? undefined);
  const bounds: CalendarBounds = { min: minBusiness, max: maxBusiness };

  /** 打开时停在哪一天：已有值就停在原值；没有值停在今天，但不早于最早日期。 */
  function initialBusinessDate(): string {
    if (isBusinessDate(value)) {
      return value;
    }
    const today = todayBusinessDate();
    if (minBusiness !== null && compareBusinessDates(today, minBusiness) < 0) {
      return minBusiness;
    }
    if (maxBusiness !== null && compareBusinessDates(today, maxBusiness) > 0) {
      return maxBusiness;
    }
    return today;
  }

  function openPicker() {
    if (disabled) {
      return;
    }
    if (Platform.OS === 'ios') {
      // 已有值：停在它所在的月并选中它。没有值：停在今天所在的月，但**不**替用户选中今天
      // ——否则空字段点一下确认就会写进一个用户没挑过的日期。
      const selected = isBusinessDate(value) ? value : null;
      setPendingDate(selected);
      setVisibleMonth(initialCalendarMonth(selected, todayBusinessDate(), bounds));
    }
    setOpen(true);
  }

  function closePicker() {
    setOpen(false);
    setPendingDate(null);
    setVisibleMonth(null);
  }

  // 只有选中的日期就在眼前这个月里、且在可选范围内，才允许写回：
  // 用户确认的必须是自己此刻看得见的那一格。
  const pendingMonth = pendingDate === null ? null : monthOfBusinessDate(pendingDate);
  const canConfirm =
    pendingDate !== null &&
    pendingMonth !== null &&
    visibleMonth !== null &&
    isSameCalendarMonth(pendingMonth, visibleMonth) &&
    isDateWithinBounds(pendingDate, bounds);
  const pendingLabel = canConfirm && pendingDate !== null ? formatBusinessDateLabel(pendingDate) : null;
  let confirmDisabledReason: string | undefined;
  if (pendingDate === null) {
    confirmDisabledReason = '请先点选一个日期';
  } else if (!canConfirm) {
    // 已选日期不在眼前这个月，或（编辑时原值）超出了当前可选范围。
    confirmDisabledReason =
      pendingMonth !== null && visibleMonth !== null && isSameCalendarMonth(pendingMonth, visibleMonth)
        ? '选中的日期不在可选范围内'
        : '选中的日期不在这个月';
  }

  function confirmIos() {
    if (!canConfirm || pendingDate === null) {
      return;
    }
    const next = pendingDate;
    closePicker();
    onChange(next);
  }

  const displayText = hasValue ? formatBusinessDateLabel(value) : '请选择日期';
  const spokenValue = hasValue ? formatBusinessDateLabel(value) : '未设置';
  const requirementText = required ? '（必填）' : '（选填）';
  const borderColor = error ? Colors.coral : open ? Colors.mintStrong : Colors.borderLight;

  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        <Text style={styles.requirement}>{requirementText}</Text>
      </Text>

      <Pressable
        onPress={openPicker}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}，${required ? '必填' : '选填'}，${spokenValue}`}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled, expanded: open }}
        style={({ pressed }) => [
          styles.trigger,
          { borderColor },
          pressed && !disabled ? styles.triggerPressed : null,
          disabled ? styles.triggerDisabled : null,
        ]}>
        <Text style={[styles.value, hasValue ? null : styles.placeholder]}>{displayText}</Text>
        <Icon name="calendar" size={20} color={Colors.textSecondary} />
      </Pressable>

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {helperText ? <Text style={styles.hint}>{helperText}</Text> : null}

      {clearable && !required && hasValue && !disabled ? (
        <View style={styles.clearRow}>
          <Button
            label="清除日期"
            variant="text"
            onPress={() => onChange('')}
            accessibilityLabel={`清除${label}`}
          />
        </View>
      ) : null}

      {open && Platform.OS === 'android' ? (
        <ExpoDatePicker
          presentation="dialog"
          mode="date"
          value={businessDateToUtcDate(initialBusinessDate()) ?? new Date()}
          minimumDate={minDate}
          maximumDate={maxDate}
          accentColor={Colors.mintStrong}
          positiveButton={{ label: '确定' }}
          negativeButton={{ label: '取消' }}
          onValueChange={(_event, date) => {
            const next = utcDateToBusinessDate(date);
            closePicker();
            if (next !== null) {
              onChange(next);
            }
          }}
          onDismiss={closePicker}
        />
      ) : null}

      {Platform.OS === 'ios' ? (
        <Modal
          visible={open}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={closePicker}>
          <View style={styles.backdrop}>
            <View style={[StyleSheet.absoluteFill, styles.scrim]} pointerEvents="none" />
            <View style={styles.dialog} accessibilityViewIsModal>
              {/* 大字体下内容可能超过一屏，整块交给 ScrollView，年月、格子与按钮都不会被裁掉。 */}
              <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <Text style={styles.title} accessibilityRole="header">
                  {`选择${label}`}
                </Text>
                {visibleMonth === null ? null : (
                  <MonthCalendar
                    visibleMonth={visibleMonth}
                    onVisibleMonthChange={setVisibleMonth}
                    pendingDate={pendingDate}
                    onSelectDate={setPendingDate}
                    today={todayBusinessDate()}
                    bounds={bounds}
                  />
                )}
                {/* 弹层压在表单之上，表单底部已有一个实心主按钮，这里不再放第二个。 */}
                <View style={styles.actions}>
                  <Button
                    label="使用这个日期"
                    variant="secondary"
                    onPress={confirmIos}
                    disabled={!canConfirm}
                    disabledReason={confirmDisabledReason}
                    accessibilityLabel={
                      pendingLabel === null ? undefined : `使用${pendingLabel}作为${label}`
                    }
                  />
                  <Button
                    label="取消选择"
                    variant="text"
                    onPress={closePicker}
                    accessibilityLabel={`取消选择，${label}保持不变`}
                  />
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

type MonthCalendarProps = {
  visibleMonth: CalendarMonth;
  onVisibleMonthChange: (next: CalendarMonth) => void;
  pendingDate: string | null;
  onSelectDate: (value: string) => void;
  today: string;
  bounds: CalendarBounds;
};

/**
 * iOS 弹层里的月历：`[«] 2026年 [»]    [‹] 9月 [›]` + 星期表头 + 固定 6×7 格子。
 *
 * 翻年翻月只调 `onVisibleMonthChange`，点格子只调 `onSelectDate`，两条路互不触碰，
 * 所以翻到别的月份不会改掉已选日期，翻回来高亮还在。年月标题只是文字，不可点。
 */
function MonthCalendar({
  visibleMonth,
  onVisibleMonthChange,
  pendingDate,
  onSelectDate,
  today,
  bounds,
}: MonthCalendarProps) {
  const { year, month } = visibleMonth;
  const previousYear = yearNavigationTarget(visibleMonth, -1, bounds);
  const nextYear = yearNavigationTarget(visibleMonth, 1, bounds);
  const previousMonth = monthNavigationTarget(visibleMonth, -1, bounds);
  const nextMonth = monthNavigationTarget(visibleMonth, 1, bounds);
  const cells = buildMonthGrid(year, month);
  const rows = [0, 1, 2, 3, 4, 5].map((row) => cells.slice(row * 7, row * 7 + 7));

  return (
    <View style={styles.calendar}>
      <View style={styles.calendarHeader}>
        <View style={styles.navGroup}>
          <NavButton
            direction="back"
            double
            label="上一年"
            target={previousYear}
            onPress={onVisibleMonthChange}
          />
          <Text style={styles.navTitle}>{`${year}年`}</Text>
          <NavButton
            direction="forward"
            double
            label="下一年"
            target={nextYear}
            onPress={onVisibleMonthChange}
          />
        </View>
        <View style={styles.navGroup}>
          <NavButton
            direction="back"
            label="上个月"
            target={previousMonth}
            onPress={onVisibleMonthChange}
          />
          <Text style={styles.navTitle}>{`${month}月`}</Text>
          <NavButton
            direction="forward"
            label="下个月"
            target={nextMonth}
            onPress={onVisibleMonthChange}
          />
        </View>
      </View>

      <View style={styles.weekRow} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {CALENDAR_WEEKDAY_LABELS.map((weekday) => (
          <Text
            key={weekday}
            style={styles.weekday}
            numberOfLines={1}
            adjustsFontSizeToFit>
            {weekday}
          </Text>
        ))}
      </View>

      {rows.map((row, rowIndex) => (
        <View key={`row-${rowIndex}`} style={styles.weekRow}>
          {row.map((day, columnIndex) => {
            const key = `cell-${rowIndex}-${columnIndex}`;
            const date = day === null ? null : joinBusinessDate(year, month, day);
            if (day === null || date === null) {
              return <View key={key} style={styles.dayCell} />;
            }
            const selectable = isDateWithinBounds(date, bounds);
            const selected = date === pendingDate;
            const isToday = date === today;
            const spoken = [
              formatBusinessDateLabel(date),
              isToday ? '今天' : null,
              selected ? '已选择' : null,
              selectable ? null : '不可选择',
            ]
              .filter((part) => part !== null)
              .join('，');
            return (
              <Pressable
                key={key}
                onPress={() => onSelectDate(date)}
                disabled={!selectable}
                accessibilityRole="button"
                accessibilityLabel={spoken}
                accessibilityState={{ selected, disabled: !selectable }}
                style={styles.dayCell}>
                {({ pressed }) => (
                  <View
                    style={[
                      styles.dayMark,
                      isToday && !selected ? styles.dayMarkToday : null,
                      selected ? styles.dayMarkSelected : null,
                      pressed && !selected ? styles.dayMarkPressed : null,
                    ]}>
                    <Text
                      style={[
                        styles.dayText,
                        isToday ? styles.dayTextToday : null,
                        selected ? styles.dayTextSelected : null,
                        selectable ? null : styles.dayTextDisabled,
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit>
                      {day}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

type NavButtonProps = {
  direction: 'back' | 'forward';
  /** 双箭头表示翻年，单箭头表示翻月 */
  double?: boolean;
  label: string;
  /** 翻过去会停在哪个月；null 表示那个方向已无可选日期或超出年份范围，按钮禁用 */
  target: CalendarMonth | null;
  onPress: (next: CalendarMonth) => void;
};

function NavButton({ direction, double = false, label, target, onPress }: NavButtonProps) {
  const disabled = target === null;
  const iconName = direction === 'back' ? 'chevronLeft' : 'chevronRight';
  const color = disabled ? Colors.textSecondary : Colors.mintStrong;
  return (
    <Pressable
      onPress={() => {
        if (target !== null) {
          onPress(target);
        }
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.navButton,
        pressed && !disabled ? styles.navButtonPressed : null,
        disabled ? styles.navButtonDisabled : null,
      ]}>
      <View style={styles.navIcons}>
        <Icon name={iconName} size={18} color={color} />
        {double ? <Icon name={iconName} size={18} color={color} style={styles.navIconOverlap} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Layout.labelGap,
  },
  label: {
    ...TextStyles.label,
    color: Colors.textPrimary,
  },
  requirement: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  trigger: {
    minHeight: Layout.minTouchSize,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.iconGap,
    backgroundColor: Colors.surface,
    borderRadius: Radii.input,
    borderWidth: BorderWidth.hairline,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  triggerPressed: {
    borderColor: Colors.mintStrong,
  },
  triggerDisabled: {
    opacity: 0.5,
  },
  value: {
    ...TextStyles.body,
    color: Colors.textPrimary,
    flex: 1,
  },
  placeholder: {
    color: Colors.textSecondary,
  },
  error: {
    ...TextStyles.caption,
    color: Colors.coral,
  },
  hint: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  clearRow: {
    alignItems: 'flex-start',
  },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Layout.pageHorizontal,
  },
  scrim: {
    backgroundColor: Colors.textPrimary,
    opacity: 0.32,
  },
  dialog: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.sheet,
    borderWidth: BorderWidth.hairline,
    borderColor: Colors.borderLight,
    padding: Layout.cardPadding,
    gap: Layout.cardGap,
    maxHeight: '90%',
    ...Shadows.overlay,
  },
  content: {
    gap: Layout.cardGap,
  },
  title: {
    ...TextStyles.sectionTitle,
    color: Colors.textPrimary,
  },
  actions: {
    gap: Layout.tightGap,
  },
  calendar: {
    gap: Layout.tightGap,
  },
  calendarHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    rowGap: Layout.tightGap,
  },
  navGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  navTitle: {
    ...TextStyles.sectionTitle,
    color: Colors.textPrimary,
    textAlign: 'center',
    flexShrink: 1,
  },
  navButton: {
    minWidth: Layout.minTouchSize,
    minHeight: Layout.minTouchSize,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.input,
  },
  navButtonPressed: {
    backgroundColor: Colors.mintLight,
  },
  navButtonDisabled: {
    opacity: 0.4,
  },
  navIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navIconOverlap: {
    marginLeft: -Spacing.sm,
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekday: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
    flex: 1,
    textAlign: 'center',
  },
  dayCell: {
    flex: 1,
    minHeight: Layout.minTouchSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayMark: {
    width: '92%',
    maxWidth: 40,
    aspectRatio: 1,
    borderRadius: Radii.sheet,
    borderWidth: BorderWidth.hairline,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayMarkToday: {
    borderColor: Colors.mintStrong,
  },
  dayMarkSelected: {
    backgroundColor: Colors.mintStrong,
    borderColor: Colors.mintStrong,
  },
  dayMarkPressed: {
    backgroundColor: Colors.mintLight,
  },
  dayText: {
    ...TextStyles.body,
    color: Colors.textPrimary,
  },
  dayTextToday: {
    ...TextStyles.bodyStrong,
    color: Colors.mintStrong,
  },
  dayTextSelected: {
    ...TextStyles.bodyStrong,
    color: Colors.surface,
  },
  dayTextDisabled: {
    color: Colors.textSecondary,
    opacity: 0.5,
  },
});
