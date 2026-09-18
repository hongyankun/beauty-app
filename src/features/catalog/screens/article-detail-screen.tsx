import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, EmptyState, InlineNotice, Screen, SectionHeader } from '@/components/ui';
import { Colors, Layout, Radii, Spacing, TextStyles } from '@/theme';
import { ArticleSourceItem } from '../components/article-source-item';
import { ARTICLES } from '../data';
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

/**
 * 百科文章详情。
 *
 * 正文随 App 打包，无网络也能读；页面只读，没有收藏、分享与评论。
 * 资料来源用系统浏览器打开，不内嵌 WebView。
 */
export function ArticleDetailScreen() {
  const router = useRouter();
  const { entryId } = useLocalSearchParams<{ entryId: string }>();
  const [linkError, setLinkError] = useState<string | null>(null);

  const article = findArticle(ARTICLES, entryId);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/catalog');
    }
  }, [router]);

  const handleSourcePress = useCallback((source: ArticleSource) => {
    setLinkError(null);
    void openSourceLink(source.url).then((opened) => {
      if (!opened) {
        setLinkError(OPEN_SOURCE_FAILURE_MESSAGE);
      }
    });
  }, []);

  if (!article) {
    return (
      <Screen title="百科" onBack={goBack} backLabel="返回百科">
        <EmptyState
          icon="catalog"
          title="找不到这篇内容，它可能已经更新。"
          description="返回百科可以查看当前可读的全部内容。"
          actionLabel="返回百科"
          onActionPress={goBack}
        />
      </Screen>
    );
  }

  return (
    <Screen title={article.title} subtitle={article.summary} onBack={goBack} backLabel="返回百科">
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
