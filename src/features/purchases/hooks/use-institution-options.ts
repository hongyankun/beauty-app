import { useEffect, useState } from 'react';

import { DEFAULT_PROFILE_ID, type InstitutionOption } from '@/db';
import { useDataAccess } from '@/hooks/use-data-access';

/**
 * 读取可复用的机构列表，供机构选择器使用（ADR-014、PRD-INST-002）。
 *
 * 读取失败不阻断表单：机构是选填字段，拿不到已有机构时用户仍然可以
 * 直接输入一个新机构名称把套餐存下来，不该因为这个列表加载失败就卡住整个录入。
 */
export function useInstitutionOptions(): readonly InstitutionOption[] {
  const dataAccess = useDataAccess();
  const [options, setOptions] = useState<readonly InstitutionOption[]>([]);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const rows = await dataAccess.institutions.listSelectable(DEFAULT_PROFILE_ID);
        if (active) {
          setOptions(rows);
        }
      } catch (error) {
        if (__DEV__) {
          console.error('[purchases] 读取机构列表失败', error);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [dataAccess]);

  return options;
}
