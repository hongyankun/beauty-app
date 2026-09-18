/**
 * 机构管理 service 层的错误类型。
 *
 * 与 `features/purchases/services/errors.ts` 是同一套写法而不是同一个类：
 * 两个 feature 各自持有自己的错误类型，`toUserMessage` 才不会把另一个模块的
 * 内部文案透出来（ARCHITECTURE 第六节：只被一个 feature 用就放在那个 feature 里）。
 *
 * `message` 是**给用户看的中文说明**，页面可以直接展示。
 * SQL、表名、堆栈与原始异常只放进 `originalError`，仅供开发期日志使用，
 * 不得渲染到界面上（任务书第十四节、PRD 第 17.6 节）。
 */
export class InstitutionServiceError extends Error {
  readonly originalError: unknown;

  constructor(message: string, options: { originalError?: unknown } = {}) {
    super(message);
    this.name = 'InstitutionServiceError';
    this.originalError = options.originalError;
  }
}

/**
 * 把任意异常收敛成一句用户能理解的话。
 *
 * 只有 service 明确抛出的业务错误才会把自己的文案透出去；
 * 其余（SQLite 故障、IO 失败等）一律用调用方给的兜底文案，
 * 原始错误只在 `__DEV__` 下打日志，生产不外泄。
 */
export function toUserMessage(error: unknown, fallback: string): string {
  if (error instanceof InstitutionServiceError) {
    return error.message;
  }
  if (__DEV__) {
    console.error('[institutions] 未预期的失败', error);
  }
  return fallback;
}
