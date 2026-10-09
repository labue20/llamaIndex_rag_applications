/**
 * Public free-trial terms (trial length and caps) from GET /plans
 */

import { useEffect, useState } from 'react';
import { apiFetch } from '../../../shared/services/apiClient';

// Shown until (or if) the server answers
const DEFAULT_PLAN_INFO = {
  trial_days: 30,
  trial_max_documents: 10,
  trial_max_questions_per_day: 50,
  free_max_documents: 3,
  free_max_questions_per_day: 10,
  free_conversions_per_day: 20,
  basic_price_monthly: 1.99,
  basic_price_yearly: 19.99,
  basic_max_documents: 25,
  basic_max_questions_per_day: 50,
  pro_price_monthly: 9.99,
  pro_price_yearly: 90,
  pro_fair_use_questions_per_day: 150,
  yearly_billing: false,
  trial_signature_requests_per_month: 3,
  free_signature_requests_per_month: 0,
  basic_signature_requests_per_month: 10,
  pro_signature_requests_per_month: -1,
  online_payments: false,
  guest_max_documents: 1,
  guest_max_questions: 5,
  guest_file_hours: 24,
  guest_conversions_per_hour: 20,
  support_email: '',
};

let cachedPlanInfo = null;

export const resetPlanInfoCache = () => {
  cachedPlanInfo = null;
};

export const usePlanInfo = () => {
  const [planInfo, setPlanInfo] = useState(cachedPlanInfo || DEFAULT_PLAN_INFO);

  useEffect(() => {
    if (cachedPlanInfo) return undefined;
    let cancelled = false;
    apiFetch('/plans')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data && !cancelled) {
          // Anything an older server doesn't send keeps its default
          cachedPlanInfo = { ...DEFAULT_PLAN_INFO, ...data };
          setPlanInfo(cachedPlanInfo);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return planInfo;
};
