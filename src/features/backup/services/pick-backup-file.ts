import * as DocumentPicker from 'expo-document-picker';

import { BackupError } from './backup-error';
import { exceedsBackupSizeLimit } from './backup-file-limits';

/**
 * 备份文件的 MIME 提示。
 *
 * 只是**提示**，不是保证。不同系统、不同网盘 provider 对同一个 `.json`
 * 给出的 MIME 五花八门（`application/json`、`text/plain`、`public.json`，
 * 也有干脆不给的），严格按 MIME 过滤会让用户在文件列表里看到自己的备份变灰、
 * 点不动。所以这里放宽到「所有文件」兜底，真正的判断全部交给结构校验：
 * 扩展名与 MIME 都不作为信任依据（任务书第四节）。
 */
const BACKUP_PICKER_TYPES = ['application/json', '*/*'];

/** 用户选中的那个文件。只带 URI 与系统声称的体积，不往上传绝对路径以外的东西。 */
export type PickedBackupFile = {
  /** 供 `expo-file-system` 读取。**只在服务层内部流转，不进界面、不进日志。** */
  readonly uri: string;
  /** 选择器声称的字节数。不是每个来源都给，也不保证准，因此可能为 null。 */
  readonly reportedSize: number | null;
};

export type PickBackupFileResult =
  | { readonly status: 'picked'; readonly file: PickedBackupFile }
  /** 用户自己关掉了选择器。这是正常操作，不是错误，界面不该报错（任务书第 3.3 节）。 */
  | { readonly status: 'canceled' };

/**
 * 调起系统文件选择器，拿回**用户主动选中的那一个**文件。
 *
 * 两条硬性边界：
 *
 * 1. **只读用户点中的那一个。** 不扫描目录、不按名字猜测、不去翻上次的路径。
 *    App 自己没有这些文件的访问权，也不该有（任务书第四节）。
 * 2. **绝不显示或记录绝对路径。** 路径里通常带着设备名、账号名与 iCloud 容器 ID，
 *    属于不该出现在界面与日志里的信息。失败时只说「没能打开文件选择器」。
 *
 * 体积在这里先按选择器给的 `size` 挡一道。这道只是提前量：`size` 可能缺失、
 * 也可能不准，读完之后还会按真实内容再量一次（见 `parseBackupDocument`）。
 * 两道都在 `JSON.parse` 与任何事务之前。
 */
export async function pickBackupFile(): Promise<PickBackupFileResult> {
  let result: DocumentPicker.DocumentPickerResult;
  try {
    result = await DocumentPicker.getDocumentAsync({
      type: BACKUP_PICKER_TYPES,
      // 拷到缓存目录，这样无论用户是从「文件」、iCloud 还是第三方网盘选的，
      // 我们都能立刻读到内容。这份副本读完就删（见 `openBackupFile`）。
      copyToCacheDirectory: true,
      multiple: false,
    });
  } catch (error) {
    if (__DEV__) {
      // 只记一句话，不把 `error` 打出来：选择器抛出的错误里常常带着
      // 用户选中文件的绝对路径（含设备名、账号名与 iCloud 容器 ID），
      // 那是不该进日志的东西（任务书第四、六节）。原始错误仍挂在
      // `BackupError.cause` 上，需要时可在调试器里展开。
      console.error('[backup] 调起文件选择器失败');
    }
    throw new BackupError('pick', error);
  }

  if (result.canceled) {
    return { status: 'canceled' };
  }

  const asset = result.assets[0];
  if (asset === undefined) {
    // 系统说没取消却什么都没给。既然拿不到文件，对用户而言和取消是一回事。
    return { status: 'canceled' };
  }

  const reportedSize = typeof asset.size === 'number' ? asset.size : null;
  if (exceedsBackupSizeLimit(reportedSize)) {
    if (__DEV__) {
      console.error('[backup] 选中的文件超出体积上限');
    }
    throw new BackupError('oversize');
  }

  return { status: 'picked', file: { uri: asset.uri, reportedSize } };
}
