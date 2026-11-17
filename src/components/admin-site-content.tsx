import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { editorApi, editorMediaBody } from '@/lib/editor-api';
import { defaultBranding, eventCategories, type Branding, type LibraryAsset, type PagePhotographs } from '@/lib/cms';
import { maxMediaBytes, maxMediaMb } from '@/lib/upload-limits';

type OnError = (error: unknown) => void;
type EditableRecord = Record<string, string | boolean> & { id: string };
type Field = { name: string; label: string; type?: 'text' | 'textarea' | 'date' | 'url' | 'email' | 'password' | 'check' | 'photo'; options?: readonly string[]; optional?: boolean; max?: number };
type Collection = 'events' | 'leadership' | 'volunteers' | 'users';

const peopleFields: Field[] = [
  { name: 'name', label: 'Full name' }, { name: 'role', label: 'Role or designation' },
  { name: 'organisation', label: 'Organisation', optional: true }, { name: 'photo', label: 'Profile photo', type: 'photo' },
  { name: 'visible', label: 'Visible on About Us', type: 'check' },
];
const collectionFields: Record<Collection, Field[]> = {
  events: [
    { name: 'title', label: 'Title' }, { name: 'category', label: 'Category', options: eventCategories },
    { name: 'summary', label: 'Description', type: 'textarea', max: 1800 }, { name: 'date', label: 'Date', type: 'date', optional: true },
    { name: 'location', label: 'Location', optional: true }, { name: 'registration', label: 'Registration URL', type: 'url', optional: true },
    { name: 'photo', label: 'Event photo', type: 'photo' }, { name: 'visible', label: 'Visible on the website', type: 'check' },
    { name: 'featured', label: 'Feature on the Events page', type: 'check' },
  ],
  leadership: peopleFields,
  volunteers: peopleFields,
  users: [
    { name: 'name', label: 'Full name' }, { name: 'email', label: 'Email', type: 'email', max: 254 },
    { name: 'role', label: 'Role', options: ['editor', 'admin'] },
    { name: 'password', label: 'Password (at least 16 characters)', type: 'password', max: 200 },
    { name: 'active', label: 'Can sign in', type: 'check' },
  ],
};
const nouns: Record<Collection, string> = { events: 'event', leadership: 'leader', volunteers: 'volunteer', users: 'user' };

export function useAdminData<T>(path: string, onError: OnError) {
  const [data, setData] = useState<T>();
  useEffect(() => {
    let open = true;
    editorApi<T>(path).then(result => { if (open) setData(result); })
      .catch(error => { if (open) onError(error); });
    return () => { open = false; };
  }, [path, onError]);
  return { data, setData };
}

export function useLibrary(onError: OnError) {
  return useAdminData<LibraryAsset[]>('site/library', onError);
}

export function AssetSelect({ items, value = '', name, empty = 'None' }: { items: LibraryAsset[]; value?: string; name: string; empty?: string }) {
  const [selected, setSelected] = useState(value);
  return <select name={name} value={selected} onChange={event => setSelected(event.target.value)}>
    <option value="">{empty}</option>
    {selected && !items.some(item => item.url === selected) && <option value={selected}>Current selection</option>}
    {items.map(item => <option key={item.id} value={item.url}>{item.label}</option>)}
  </select>;
}

export function RecordUploadInput({ kind, label }: { kind: LibraryAsset['type']; label: string }) {
  return <label>{label}
    <input className="editor-file-input" name="upload" type="file"
      accept={kind === 'photo' ? '.jpg,.jpeg,.png,.webp' : '.pdf,.mp3,.m4a,.wav'} />
    <small>{kind === 'photo' ? 'JPG, PNG or WebP' : 'PDF, MP3, M4A or WAV'} up to {maxMediaMb} MB. Uploads when you save.</small>
  </label>;
}

export function AdminRecords({ collection, create, onError }: { collection: Collection; create: boolean; onError: OnError }) {
  const path = `site/${collection}`;
  const { data, setData } = useAdminData<EditableRecord[]>(path, onError);
  const { data: library, setData: setLibrary } = useLibrary(onError);
  const [selection, setSelection] = useState<string>(create ? 'new' : '');
  const selected = data?.find(item => item.id === selection);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [formVersion, setFormVersion] = useState(0);
  const fields = collectionFields[collection];

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const payload: Record<string, string | boolean> = Object.fromEntries(fields.map(field => [field.name,
      field.type === 'check' ? form.has(field.name) : String(form.get(field.name) ?? ''),
    ]));
    if (selected) payload['id'] = selected.id;
    setPending(true);
    setNotice('');
    onError(undefined);
    try {
      const body = editorMediaBody(payload, form);
      const result = await editorApi<{ id?: string }>(path, body);
      const [records, updatedLibrary] = await Promise.all([
        editorApi<EditableRecord[]>(path), body instanceof FormData ? editorApi<LibraryAsset[]>('site/library') : undefined,
      ]);
      setData(records);
      if (updatedLibrary) setLibrary(updatedLibrary);
      setSelection(result.id ?? selected?.id ?? '');
      setFormVersion(version => version + 1);
      setNotice('Saved.');
    } catch (error) { onError(error); }
    finally { setPending(false); }
  }

  return <div className="editor-grid">
    <aside className="editor-post-list">
      <Button onClick={() => { setSelection('new'); setNotice(''); }} disabled={pending}>New {nouns[collection]}</Button>
      {data?.map(item => <button type="button" key={item.id} aria-pressed={selection === item.id} disabled={pending}
        onClick={() => { setNotice(''); setSelection(item.id); }}>
        <strong>{String(item['title'] ?? item['name'])}</strong>
        <small>{collection === 'users' ? `${item['role']} · ${item['active'] ? 'Active' : 'Disabled'}` : item['visible'] ? 'Visible' : 'Hidden'}</small>
      </button>)}
      {data?.length === 0 && <p>No records yet.</p>}
    </aside>
    {selection ? <form key={`${selection}:${formVersion}`} className="application-form editor-form" onSubmit={save}>
      <h2>{selected ? `Edit ${nouns[collection]}` : `New ${nouns[collection]}`}</h2>
      {fields.map(field => {
        const value = String(selected?.[field.name] ?? '');
        if (field.type === 'check') return <label className="admin-check" key={field.name}>
          <input type="checkbox" name={field.name} defaultChecked={Boolean(selected?.[field.name] ?? field.name !== 'featured')} />{field.label}
        </label>;
        if (field.type === 'photo') return <fieldset className="editor-attachment" key={field.name}>
          <legend>{field.label}</legend>
          <RecordUploadInput kind="photo" label={collection === 'events' ? 'Upload event image' : 'Upload profile photo'} />
          <label>Or select from the photo library
            <AssetSelect items={library?.filter(item => item.type === 'photo') ?? []} value={value} name={field.name} />
          </label>
        </fieldset>;
        return <label key={field.name}>{field.label}
          {field.options ? <select name={field.name} defaultValue={value || field.options[0]}>{field.options.map(option => <option key={option}>{option}</option>)}</select> :
            field.type === 'textarea' ? <textarea name={field.name} rows={5} maxLength={field.max} required defaultValue={value} /> :
            <input name={field.name} defaultValue={value} type={field.type ?? 'text'} maxLength={field.max ?? (field.type === 'url' ? 2000 : 180)}
              required={!field.optional && !(field.type === 'password' && selected)} minLength={field.type === 'password' ? 16 : undefined}
              autoComplete={field.type === 'password' ? 'new-password' : undefined} />}
        </label>;
      })}
      {notice && <p role="status">{notice}</p>}
      <div className="editor-actions"><Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save'}</Button></div>
    </form> : <p>{data ? `Choose a ${nouns[collection]} to edit or create a new one.` : 'Loading records…'}</p>}
  </div>;
}

export function AdminLibrary({ kind, create, onError }: { kind: 'photo' | 'file'; create: boolean; onError: OnError }) {
  const { data, setData } = useLibrary(onError);
  const [showUpload, setShowUpload] = useState(create);
  const [pending, setPending] = useState(false);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = new FormData(form);
    payload.set('kind', kind);
    const file = payload.get('file');
    if (file instanceof File && file.size > maxMediaBytes) {
      onError(new Error(`Choose a file up to ${maxMediaMb} MB.`));
      return;
    }
    setPending(true);
    onError(undefined);
    try {
      await editorApi('site/library', payload);
      setData(await editorApi<LibraryAsset[]>('site/library'));
      form.reset();
      setShowUpload(false);
    } catch (error) { onError(error); }
    finally { setPending(false); }
  }

  const assets = data?.filter(item => item.type === kind);
  return <>
    <div className="editor-actions"><Button onClick={() => setShowUpload(value => !value)}>{showUpload ? 'Close upload' : `Upload ${kind}`}</Button></div>
    {showUpload && <form className="application-form editor-form admin-upload" onSubmit={upload}>
      <p>{kind === 'photo' ? 'Upload approved IFF photography only.' : 'Upload PDFs or audio files intended for the public website.'} Files up to {maxMediaMb} MB.</p>
      <label>Title<input name="label" maxLength={180} required /></label>
      <label>File<input name="file" type="file" accept={kind === 'photo' ? '.jpg,.jpeg,.png,.webp' : '.pdf,.mp3,.m4a,.wav'} required /></label>
      <div className="editor-actions"><Button type="submit" disabled={pending}>{pending ? 'Uploading…' : 'Upload'}</Button></div>
    </form>}
    <div className="admin-library">
      {assets?.map(item => <a href={item.url} target="_blank" rel="noreferrer" key={item.id} className="admin-task">
        {item.type === 'photo' && <img src={item.url} alt="" loading="lazy" />}
        <strong>{item.label}</strong><p>{item.filename}</p>
      </a>)}
    </div>
    {assets?.length === 0 && <p>No files have been uploaded.</p>}
  </>;
}

export type SiteSettings = { branding: Branding; pages: PagePhotographs };

export function AdminSettings({ onError }: { onError: OnError }) {
  const { data, setData } = useAdminData<SiteSettings>('site/settings', onError);
  const { data: library } = useLibrary(onError);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const photos = library?.filter(item => item.type === 'photo') ?? [];
  const brochures = library?.filter(item => item.type === 'file' && item.filename.toLowerCase().endsWith('.pdf')) ?? [];

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setNotice('');
    onError(undefined);
    try {
      await editorApi('site/branding', Object.fromEntries(form));
      setData(await editorApi<SiteSettings>('site/settings'));
      setNotice('Website settings saved.');
    } catch (error) { onError(error); }
    finally { setPending(false); }
  }

  if (!data || !library) return <p>Loading website settings…</p>;
  return <div className="admin-settings">
    <form className="application-form editor-form" onSubmit={save}>
        <label>Header logo<AssetSelect items={photos} value={data.branding.logo} name="logo" empty="Use original IFF logo" /></label>
        <label>Partner names<textarea name="partners" rows={8} maxLength={4000} defaultValue={data.branding.partners ?? defaultBranding.partners} /><small>One name per line.</small></label>
        <label>Partnership brochure<AssetSelect items={brochures} value={data.branding.brochure} name="brochure" /></label>
      {notice && <p role="status">{notice}</p>}
      <div className="editor-actions"><Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save'}</Button></div>
    </form>
  </div>;
}
