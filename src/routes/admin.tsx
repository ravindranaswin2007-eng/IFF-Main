import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AdminDashboard, AdminFrame, adminSections, type AdminSection } from '@/components/admin-dashboard';
import { AdminPagePhotos } from '@/components/admin-page-photos';
import { AdminLibrary, AdminRecords, AdminSettings, AssetSelect, useLibrary } from '@/components/admin-site-content';
import type { EditorIdentity } from '@/lib/cms';
import { AdminInbox } from '@/components/admin-inbox';
import { editorApi } from '@/lib/editor-api';
import { Button } from '@/components/ui/button';
import { pageHead } from '@/lib/site';
import { publicationTypes, type Publication } from '@/lib/submissions';

export const Route = createFileRoute('/admin')({
  head: () => ({ meta: [...pageHead('CRM', 'Indian Financial Forum inbox and publishing workspace.').meta,
    { name: 'robots', content: 'noindex, nofollow' }] }),
  validateSearch: (search: Record<string, unknown>): { section?: AdminSection; create?: boolean } => {
    const section = search['section'];
    if (typeof section !== 'string' || !Object.hasOwn(adminSections, section)) return {};
    return { section: section as AdminSection, ...(search['create'] === true ? { create: true } : {}) };
  },
  component: Admin,
});

function Admin() {
  const [posts, setPosts] = useState<Publication[] | null>(null);
  const [selection, setSelection] = useState<Publication>();
  const [user, setUser] = useState<EditorIdentity>();
  const { section, create = false } = Route.useSearch();
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const report = useCallback((problem: unknown) => {
    if (problem === undefined) {
      setError('');
      return;
    }
    if (problem instanceof Error && 'status' in problem && problem.status === 401) {
      setUser(undefined);
      setPosts(null);
      setSelection(undefined);
    }
    setError(problem instanceof Error ? problem.message : 'Please try again.');
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([editorApi<EditorIdentity>('session'), editorApi<Publication[]>('publications')]).then(([identity, data]) => {
      if (active) { setUser(identity); setPosts(data); }
    }).catch(problem => {
      if (active && problem.status !== 401) report(problem);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [report]);

  useEffect(() => {
    if (section === 'publications' && create) setSelection(undefined);
  }, [section, create]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError('');
    try {
      await editorApi('login', Object.fromEntries(form));
      const [identity, data] = await Promise.all([editorApi<EditorIdentity>('session'), editorApi<Publication[]>('publications')]);
      setUser(identity);
      setPosts(data);
    } catch (problem) {
      report(problem);
    } finally {
      setPending(false);
    }
  }

  async function logout() {
    try {
      await editorApi('logout', {});
      setUser(undefined);
      setPosts(null);
      setSelection(undefined);
      setNotice('');
      setError('');
    } catch (problem) {
      report(problem);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const status = submitter?.value ?? 'draft';
    const { file, ...data } = Object.fromEntries(new FormData(form));
    if (file) data['url'] = file;
    setPending(true);
    setError('');
    setNotice('');
    try {
      const path = selection ? `publications/${selection.id}` : 'publications';
      const { id } = await editorApi<{ id: string }>(path, { ...data, status });
      const refreshed = await editorApi<Publication[]>('publications');
      setPosts(refreshed);
      setSelection(refreshed.find(post => post.id === id));
      setNotice(status === 'published' ? 'Published to the Knowledge Hub.' : 'Draft saved.');
    } catch (problem) {
      report(problem);
    } finally {
      setPending(false);
    }
  }

  return <AdminFrame section={user ? section : undefined} user={user} onLogout={logout}>
    {error && <div className="form-notice form-error" role="alert">{error}</div>}
    {notice && section === 'publications' && <div className="form-notice" role="status">{notice}</div>}
    {loading ? <p>Loading workspace…</p> : !user || !posts ? <div className="admin-login">
      <h1>Sign in to IFF website admin</h1>
      <form className="application-form editor-login editor-form" onSubmit={login}>
        <label>Email<input type="email" name="email" maxLength={254} autoComplete="username" /></label>
        <label>Password<input type="password" name="password" maxLength={200} autoComplete="current-password" required /></label>
        <p>Leave email blank when using the site administrator password.</p>
        <div className="editor-actions"><Button disabled={pending} type="submit">{pending ? 'Signing in…' : 'Sign in'}</Button></div>
      </form>
    </div> : !section ? <AdminDashboard user={user} /> : <>
      <h1 className="admin-page-title">{adminSections[section]}</h1>
        {section === 'publications' && <div className="editor-grid">
          <aside className="editor-post-list">
            <Button onClick={() => { setSelection(undefined); setNotice(''); setError(''); }}>New publication</Button>
            {posts.map(post => <button type="button" key={post.id} aria-pressed={selection?.id === post.id}
              onClick={() => { setSelection(post); setNotice(''); setError(''); }}>
              <strong>{post.title}</strong><small>{post.type} · {post.status}</small>
            </button>)}
          </aside>
          <form key={selection?.id ?? 'new'} className="application-form editor-form" onSubmit={save}>
            <h2>{selection ? 'Edit publication' : 'New publication'}</h2>
            <label>Type<select name="type" defaultValue={selection?.type}>
              {publicationTypes.map(type => <option key={type}>{type}</option>)}
            </select></label>
            <label>Title<input name="title" maxLength={160} required defaultValue={selection?.title} /></label>
            <label>Summary<textarea name="summary" maxLength={350} rows={2} required defaultValue={selection?.summary} /></label>
            <label>Article text or notes<textarea name="body" maxLength={40000} rows={10} defaultValue={selection?.body} /></label>
            <PublicationAssets url={selection?.url ?? ''} onError={report} />
            <div className="editor-actions">
              <Button type="submit" value="draft" variant="outline" disabled={pending}>
                {selection?.status === 'published' ? 'Unpublish and save draft' : 'Save draft'}
              </Button>
              <Button type="submit" value="published" disabled={pending}>{pending ? 'Saving…' : 'Publish'}</Button>
            </div>
          </form>
        </div>}
      {(section === 'enquiries' || section === 'newsletter') && <AdminInbox key={section} scope={section} onError={report} />}
      {(section === 'events' || section === 'leadership' || section === 'volunteers' || (section === 'users' && user.role === 'admin')) &&
        <AdminRecords key={`${section}:${create}`} collection={section} create={create} onError={report} />}
      {(section === 'photos' || section === 'files') && <AdminLibrary key={`${section}:${create}`} kind={section === 'photos' ? 'photo' : 'file'} create={create} onError={report} />}
      {section === 'pages' && <AdminPagePhotos onError={report} />}
      {section === 'branding' && <AdminSettings onError={report} />}
      {section === 'users' && user.role !== 'admin' && <p>Administrator access is required.</p>}
    </>}
  </AdminFrame>;
}

function PublicationAssets({ url, onError }: { url: string; onError: (error: unknown) => void }) {
  const { data: library } = useLibrary(onError);
  const stored = url.startsWith('/api/iff/media/');
  return <>
    <label>Publication link<input name="url" type="url" maxLength={2000} defaultValue={stored ? '' : url} /></label>
    <label>Or choose a file<AssetSelect items={library?.filter(item => item.type === 'file') ?? []} name="file" value={stored ? url : ''} />
      <small>A selected library file takes precedence over the link.</small>
    </label>
  </>;
}
