import { useEffect, useState } from 'react';

import { useDataAccess } from '@/hooks/use-data-access';
import {
  listWishlistInstitutionOptions,
  type WishlistInstitutionOption,
} from '../services/list-institution-options';

/**
 * 读取心愿表单的机构候选项。
 *
 * 读取失败不阻断表单：机构是选填字段，拿不到列表时用户仍然可以把心愿存下来，
 * 不该因为这个列表加载失败就卡住整次录入。
 *
 * `linkedInstitutionId` 是这条心愿**打开时**原本关联的机构，用于在它已归档时
 * 仍把它带进候选（任务书第六节第 4 条）。新增流程传 null。
 */
export function useWishlistInstitutionOptions(
  linkedInstitutionId: string | null,
): readonly WishlistInstitutionOption[] {
  const dataAccess = useDataAccess();
  const [options, setOptions] = useState<readonly WishlistInstitutionOption[]>([]);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const rows = await listWishlistInstitutionOptions(dataAccess, linkedInstitutionId);
        if (active) {
          setOptions(rows);
        }
      } catch (error) {
        if (__DEV__) {
          console.error('[wishlist] 读取机构列表失败', error);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [dataAccess, linkedInstitutionId]);

  return options;
}
