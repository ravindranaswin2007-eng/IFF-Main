import { maxMediaBytes, maxMediaMb } from './upload-limits';

export function editorMediaBody(record: object, form: FormData) {
  const file = form.get('upload');
  if (!(file instanceof File) || !file.name) return record;
  if (!file.size || file.size > maxMediaBytes) throw new Error(`Choose a non-empty file up to ${maxMediaMb} MB.`);
  const body = new FormData();
  body.set('record', JSON.stringify(record));
  body.set('file', file);
  return body;
}

export async function editorRequest(path: string, body?: object, method: 'POST' | 'DELETE' = 'POST') {
  const response = await fetch(`/api/iff/admin/${path}`, body && {
    method, ...(body instanceof FormData ? { body } : {
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw Object.assign(new Error(data.error || 'The editor request failed. Try again.'), { status: response.status });
  }
  return response;
}

export async function editorApi<T>(path: string, body?: object, method?: 'POST' | 'DELETE'): Promise<T> {
  return (await editorRequest(path, body, method)).json() as Promise<T>;
}
