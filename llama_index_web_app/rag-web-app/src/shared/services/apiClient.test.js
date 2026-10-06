import {
  API_BASE_URL,
  apiClient,
  apiFetch,
  readApiError,
  setPlanRequiredHandler,
  setUnauthorizedHandler,
} from './apiClient';
import { jsonResponse, mockFetch } from '../../test-utils/mockFetch';

afterEach(() => {
  setUnauthorizedHandler(null);
  setPlanRequiredHandler(null);
});

test('apiFetch prefixes the API address and sends the session cookie', async () => {
  const fetchMock = mockFetch({ '/plans': { body: { trial_days: 7 } } });
  const response = await apiFetch('/plans', { method: 'GET' });

  expect(await response.json()).toEqual({ trial_days: 7 });
  expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/plans`, { credentials: 'include', method: 'GET' });
});

test('401 calls the unauthorized handler and 402 the plan handler', async () => {
  const onUnauthorized = jest.fn();
  const onPlanRequired = jest.fn();
  setUnauthorizedHandler(onUnauthorized);
  setPlanRequiredHandler(onPlanRequired);
  mockFetch({ '/a': { status: 401 }, '/b': { status: 402 }, '/c': { status: 200 } });

  await apiFetch('/a');
  expect(onUnauthorized).toHaveBeenCalledTimes(1);
  expect(onPlanRequired).not.toHaveBeenCalled();

  await apiFetch('/b');
  expect(onPlanRequired).toHaveBeenCalledTimes(1);

  await apiFetch('/c');
  expect(onUnauthorized).toHaveBeenCalledTimes(1);
  expect(onPlanRequired).toHaveBeenCalledTimes(1);
});

test('apiClient requests also send the cookie and report 401', async () => {
  const onUnauthorized = jest.fn();
  setUnauthorizedHandler(onUnauthorized);
  const fetchMock = mockFetch({ '/getDocuments': { status: 401, body: { error: 'Authentication required' } } });
  jest.spyOn(console, 'error').mockImplementation(() => {});

  await expect(apiClient.get('/getDocuments')).rejects.toThrow('HTTP 401');
  expect(fetchMock.mock.calls[0][1].credentials).toBe('include');
  expect(onUnauthorized).toHaveBeenCalled();
});

test('readApiError returns the server message or a fallback', async () => {
  expect(await readApiError(jsonResponse(429, { error: 'Daily limit reached' }), 'fallback')).toBe('Daily limit reached');
  expect(await readApiError(jsonResponse(500, {}), 'fallback')).toBe('fallback');
  const notJson = { json: () => Promise.reject(new Error('not json')) };
  expect(await readApiError(notJson, 'fallback')).toBe('fallback');
});
