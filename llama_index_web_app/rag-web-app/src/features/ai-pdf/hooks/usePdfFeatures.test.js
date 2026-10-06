import { act, renderHook } from '@testing-library/react';
import { usePdfChat } from './usePdfFeatures';
import { mockFetch } from '../../../test-utils/mockFetch';

test('sends the question and adds both messages, with any note', async () => {
  const fetchMock = mockFetch({
    '/chat': {
      body: { response: 'It is a tax transcript.', document_name: 'transcript.pdf', note: 'Indexing in progress' },
    },
  });
  const { result } = renderHook(() => usePdfChat());

  await act(async () => {
    await result.current.sendMessage('  What is this?  ', 'doc-1');
  });

  const [, options] = fetchMock.mock.calls[0];
  expect(JSON.parse(options.body)).toEqual({ message: 'What is this?', documentId: 'doc-1' });
  expect(options.credentials).toBe('include');

  const [question, answer] = result.current.messages;
  expect(question).toMatchObject({ type: 'user', content: 'What is this?' });
  expect(answer).toMatchObject({ type: 'assistant', content: 'It is a tax transcript.', note: 'Indexing in progress' });
  expect(result.current.isLoading).toBe(false);
  expect(result.current.error).toBeNull();
});

test('shows the server message on failure and removes the unanswered question', async () => {
  mockFetch({
    '/chat': { status: 429, body: { error: "You've used today's 50 trial questions.", code: 'trial_question_limit' } },
  });
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const { result } = renderHook(() => usePdfChat());

  await act(async () => {
    await result.current.sendMessage('Another question', 'doc-1');
  });

  expect(result.current.error).toBe("You've used today's 50 trial questions.");
  expect(result.current.messages).toEqual([]);
});

test('rejects empty questions and missing documents without calling the server', async () => {
  const fetchMock = mockFetch({});
  const { result } = renderHook(() => usePdfChat());

  await expect(result.current.sendMessage('   ', 'doc-1')).rejects.toThrow('Message cannot be empty');
  await expect(result.current.sendMessage('hi', '')).rejects.toThrow('No PDF selected');
  expect(fetchMock).not.toHaveBeenCalled();
});

test('clearChat empties the conversation', async () => {
  mockFetch({ '/chat': { body: { response: 'ok' } } });
  const { result } = renderHook(() => usePdfChat());
  await act(async () => {
    await result.current.sendMessage('hi', 'doc-1');
  });
  act(() => result.current.clearChat());
  expect(result.current.messages).toEqual([]);
});
