/**
 * Public free-trial terms (trial length and caps) from GET /plans
 */

import { useEffect, useState } from 'react';
import { apiFetch } from '../../../shared/services/apiClient';

// Shown until (or if) the server answers
const DEFAULT_PLAN_INFO = {
  trial_days: 7,
  trial_max_documents: 10,
  trial_max_questions_per_day: 50,
};

let cachedPlanInfo = null;

export const usePlanInfo = () => {
  const [planInfo, setPlanInfo] = useState(cachedPlanInfo || DEFAULT_PLAN_INFO);

  useEffect(() => {
    if (cachedPlanInfo) return undefined;
    let cancelled = false;
    apiFetch('/plans')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data && !cancelled) {
          cachedPlanInfo = data;
          setPlanInfo(data);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return planInfo;
};
