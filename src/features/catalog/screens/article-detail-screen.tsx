import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card, EmptyState, InlineNotice, Screen, SectionHeader } from '@/components/ui';
import { Colors, Layout, Radii, Spacing, TextStyles } from '@/theme';
import { ArticleSourceItem } from '../components/article-source-item';
import { ARTICLES } from '../data';
import { useArticleFavorite, type ArticleFavoriteController } from '../hooks/use-article-favorite';
import { findArticle } from '../services/get-article';
import { OPEN_SOURCE_FAILURE_MESSAGE, openSourceLink } from '../services/open-source-link';
import { CATEGORY_NAMES, type ArticleSource, type ReviewStatus } from '../types';

/**
 * 审核状态的用户可见说明。
 *
 * 只描述「资料来源核验到什么程度」，不使用「权威认证」「医生已审核」这类
 * 容易被误读为医学背书的说法。专业审核责任人尚未确定（PRD 第 20.1 节 Q-04），
 * 因此本轮不会出现 `expertReviewed`。
 */
const REVIEW_STATUS_TEXT: Readonly<Record<ReviewStatus, string>> = {
  draft: '内容正在整理，尚未完成资料核验',
  sourceChecked: '资料来源已核验，尚待专业人员复核',
  expertReviewed: '资料来源已核验，并经专业人员复核',
};

type ArticleDetailScreenProps = {
  /** 返回控件的文案与读屏标签。由路由按所在导航栈提供，只影响文字，不影响返回行为。 */
  backLabel?: string;
  /** 栈内没有上一页时（例如深链直接打开）的兜底去向。 */
  fallbackHref?: Href;
};

/**
 * 百科文章详情。
 *
 * 正文随 App 打包，无网络也能读；资料来源用系统浏览器打开，不内嵌 WebView。
 * 页面对正文只读，两个动作（收藏、加入心愿单）都由用户主动发起，
 * 不改变正文、免责声明、限制、就医提示与资料来源的任何一个字。
 *
 * 同一个实现被两个薄路由复用：百科 Tab 的 `/(tabs)/catalog/[entryId]` 与
 * 心愿单 Tab 的 `/(tabs)/wishlist/article/[entryId]`。详情压在进入它的那个 Tab
 * 自己的栈上，所以返回只有一条路径，页面按钮、iOS 侧滑与 Android 返回键一致
 * （IA 第 4 节规划要点）。这里**没有**按来源分叉的返回逻辑。
 */
export function ArticleDetailScreen({
  backLabel = '返回百科',
  fallbackHref = '/(tabs)/catalog',
}: ArticleDetailScreenProps = {}) {
  const router = useRouter();
  const { entryId } = useLocalSearchParams<{ entryId: string }>();
  const [linkError, setLinkError] = useState<string | null>(null);

  const article = findArticle(ARTICLES, entryId);
  const favorite = useArticleFavorite(article?.slug ?? null);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(fallbackHref);
    }
  }, [fallbackHref, router]);

  const handleSourcePress = useCallback((source: ArticleSource) => {
    setLinkError(null);
    void openSourceLink(source.url).then((opened) => {
      if (!opened) {
        setLinkError(OPEN_SOURCE_FAILURE_MESSAGE);
      }
    });
  }, []);

  const addToWishlist = useCallback(() => {
    if (!article) {
      return;
    }
    // 只是带着文章 slug 打开新增心愿表单，本身不写任何数据：
    // 要不要存下来由用户在表单里决定（任务书第 7.2 节）。
    router.push({ pathname: '/wishlist/new', params: { articleSlug: article.slug } });
  }, [article, router]);

  if (!article) {
    return (
      <Screen title="百科" onBack={goBack} backLabel={backLabel}>
        <EmptyState
          icon="catalog"
          title="找不到这篇内容，它可能已经更新。"
          description="返回后可以继续浏览当前可读的百科内容。"
          actionLabel={backLabel}
          onActionPress={goBack}
        />
      </Screen>
    );
  }

  return (
    <Screen
      title={article.title}
      subtitle={article.summary}
      onBack={goBack}
      backLabel={backLabel}
    >
      <View style={styles.categoryRow}>
        <Text style={styles.category} accessibilityLabel={`分类：${CATEGORY_NAMES[article.category]}`}>
          {CATEGORY_NAMES[article.category]}
        </Text>
      </View>

      {/* 中立提示条：每篇文章都必须出现，位置固定在正文之前（任务书第十一节）。 */}
      <InlineNotice
        tone="neutral"
        message="本文仅用于一般信息整理，不能替代医生面诊、诊断或治疗建议。"
      />

      {/*
        两个动作彼此独立：收藏只是「以后还想看」，加入心愿单是「以后也许想做」。
        收藏不是加入心愿单的前置条件，加入心愿单也不会顺手收藏。
        都是次要按钮：这一页的主角是正文，不是让人赶紧做点什么。
      */}
      <View style={styles.actions}>
        <Button
          label={favoriteButtonLabel(favorite)}
          icon={favorite.ready && favorite.isFavorite ? 'check' : 'bookmark'}
          variant="secondary"
          // 状态由文字说清楚，颜色与图标只是辅助（PRD-NFR-005）。
          selected={favorite.ready ? favorite.isFavorite : undefined}
          loading={favorite.pending || !favorite.ready}
          onPress={favorite.toggle}
        />
        <Button label="加入心愿单" icon="wishlist" variant="secondary" onPress={addToWishlist} />
        {favorite.errorMessage ? (
          <InlineNotice tone="warning" message={favorite.errorMessage} />
        ) : null}
      </View>

      {article.sections.map((section) => (
        <View key={section.heading} style={styles.section}>
          <SectionHeader title={section.heading} />
          {section.paragraphs.map((paragraph) => (
            <Text key={paragraph} style={styles.paragraph}>
              {paragraph}
            </Text>
          ))}
        </View>
      ))}

      <View style={styles.section}>
        <SectionHeader title="需要知道的限制" />
        <Card style={styles.listCard}>
          {article.limitations.map((limitation) => (
            <BulletLine key={limitation} text={limitation} />
          ))}
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader title="什么时候应及时联系专业人员" />
        <Card style={styles.listCard}>
          {article.seekHelp.map((item) => (
            <BulletLine key={item} text={item} />
          ))}
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader title="资料来源" />
        {linkError ? <InlineNotice tone="warning" message={linkError} /> : null}
        <Card style={styles.sourceCard}>
          {article.sources.map((source, index) => (
            <ArticleSourceItem
              key={source.id}
              source={source}
              onPress={handleSourcePress}
              isLast={index === article.sources.length - 1}
            />
          ))}
        </Card>
        <Text style={styles.review}>
          {REVIEW_STATUS_TEXT[article.reviewStatus]} · 内容复核于 {article.reviewedOn}
        </Text>
      </View>
    </Screen>
  );
}

/**
 * 收藏按钮的文案。
 *
 * 四种状态各有一句话：状态永远由文字说出来，不靠图标或颜色单独表达
 * （任务书第 7.1 节、PRD-NFR-005）。进行中的说明也写在文案里，
 * 不只给一个转圈（docs/UI_REFERENCE.md 第 10 章）。
 */
function favoriteButtonLabel(favorite: ArticleFavoriteController): string {
  if (favorite.pending) {
    return favorite.isFavorite ? '正在取消收藏…' : '正在收藏…';
  }
  if (!favorite.ready) {
    return '读取收藏状态…';
  }
  return favorite.isFavorite ? '已收藏' : '收藏文章';
}

/** 项目符号行：符号本身只是排版，语义由文字承担，因此对读屏隐藏。 */
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
  categoryRow: {
    flexDirection: 'row',
    // 与页面标题之间已有 Screen 的 sectionGap，这里只负责让标签按内容宽度收缩。
    marginTop: -Layout.tightGap,
  },
  category: {
    ...TextStyles.caption,
    color: Colors.mintStrong,
    backgroundColor: Colors.mintLight,
    borderRadius: Radii.tag,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Layout.tightGap,
    overflow: 'hidden',
  },
  section: {
    gap: Layout.labelGap,
  },
  actions: {
    // 纵向排列而不是并排：并排时「正在取消收藏…」在最大字号下会被截断
    // （按钮文案只占一行，PRD-NFR-006）。
    gap: Layout.labelGap,
  },
  paragraph: {
    ...TextStyles.body,
    color: Colors.textPrimary,
    lineHeight: 24,
  },
  listCard: {
    gap: Layout.labelGap,
  },
  sourceCard: {
    paddingVertical: 0,
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
  review: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
});
