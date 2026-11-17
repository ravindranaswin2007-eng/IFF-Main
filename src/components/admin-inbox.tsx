import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { editorApi, editorRequest } from '@/lib/editor-api';
import { inboxKinds, inboxStatuses, type InboxEntry, type InboxPage, type InboxUpdate } from '@/lib/submissions';

const fieldLabels: Record<string, string> = {
  name: 'Name', organisation: 'Organisation', email: 'Work email', topic: 'Topic', message: 'Message',
  designation: 'Designation', linkedin: 'LinkedIn', expertise: 'Expertise', experience: 'Speaking experience',
};

export function AdminInbox({ onError, scope, canDelete }: {
  onError: (error: unknown) => void; scope: 'enquiries' | 'newsletter'; canDelete: boolean;
}) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [inbox, setInbox] = useState<InboxPage>();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState('');
  const filters = new URLSearchParams({ q: query, kind: scope === 'newsletter' ? 'newsletter' : kind, status, scope }).toString();

  useEffect(() => {
    let active = true;
    editorApi<InboxPage>(`inbox?${filters}&page=${page}`)
      .then(data => { if (active) setInbox(data); })
      .catch(error => { if (active) onError(error); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filters, page, refresh, onError]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setQuery(String(data.get('query') ?? '').trim());
    setKind(String(data.get('kind') ?? ''));
    setStatus(String(data.get('status') ?? ''));
    setPage(0);
    refreshInbox();
  }

  function refreshInbox() {
    onError(undefined);
    setLoading(true);
    setRefresh(count => count + 1);
    setNotice('');
  }

  function goToPage(next: number) {
    setPage(next);
    refreshInbox();
  }

  function updateEntry(id: string, updates: InboxUpdate) {
    if (status || query) refreshInbox();
    else setInbox(current => current && {
      ...current, entries: current.entries.map(entry => entry.id === id ? { ...entry, ...updates } : entry),
    });
    setNotice('Submission updated.');
  }

  function deletedEntry() {
    if (inbox?.entries.length === 1 && page > 0 && !inbox.hasNext) setPage(page - 1);
    refreshInbox();
    setNotice('Enquiry deleted.');
  }

  async function exportInbox() {
    onError(undefined);
    setExporting(true);
    try {
      const response = await editorRequest(`inbox.csv?${filters}`);
      const downloadUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = 'iff-submissions.csv';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
    } catch (error) {
      onError(error);
    } finally {
      setExporting(false);
    }
  }

  return <section aria-label="Submissions inbox">
    <form className="inbox-filters" onSubmit={applyFilters}>
      <label>Search submissions<input name="query" type="search" maxLength={120} placeholder="Name, email, organisation or notes" /></label>
      {scope === 'enquiries' && <label>Type<select name="kind" defaultValue="">
        <option value="">All types</option>
        {Object.entries(inboxKinds).filter(([value]) => value !== 'newsletter').map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>}
      <label>Status<select name="status" defaultValue="">
        <option value="">All statuses</option>
        {Object.entries(inboxStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <Button type="submit" disabled={loading}>Apply filters</Button>
    </form>
    <div className="editor-actions inbox-actions">
      <Button variant="outline" onClick={refreshInbox} disabled={loading}>Refresh</Button>
      <Button variant="outline" onClick={exportInbox} disabled={exporting || loading || !inbox?.entries.length}>
        {exporting ? 'Preparing export…' : 'Export filtered CSV'}
      </Button>
    </div>
    {notice && <p className="form-notice" role="status">{notice}</p>}
    <div aria-busy={loading}>
      {loading ? <p>Loading submissions…</p> : <>
        {inbox?.entries.length === 0 && <p>No submissions match these filters.</p>}
        {inbox?.entries.map(entry => <InboxRow key={entry.id} entry={entry} onUpdate={updateEntry} onError={onError}
          {...(canDelete ? { onDelete: deletedEntry } : {})} />)}
        {inbox && (page > 0 || inbox.hasNext) && <div className="editor-actions">
          <Button disabled={page === 0} onClick={() => goToPage(page - 1)}>Previous</Button>
          <span>Page {page + 1}</span>
          <Button disabled={!inbox.hasNext} onClick={() => goToPage(page + 1)}>Next</Button>
        </div>}
      </>}
    </div>
  </section>;
}

function InboxRow({ entry, onUpdate, onError, onDelete }: {
  entry: InboxEntry;
  onUpdate: (id: string, updates: InboxUpdate) => void;
  onError: (error: unknown) => void;
  onDelete?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setSaving(true);
    setError('');
    try {
      const updated = await editorApi<InboxUpdate>(`inbox/${entry.id}`, { ...data, revision: entry.revision });
      onUpdate(entry.id, updated);
    } catch (problem) {
      if (problem instanceof Error && 'status' in problem && problem.status === 401) onError(problem);
      else setError(problem instanceof Error ? problem.message : 'The submission could not be updated.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!onDelete || deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await editorApi(`inbox/${entry.id}`, { revision: entry.revision }, 'DELETE');
      setConfirming(false);
      onDelete();
    } catch (problem) {
      if (problem instanceof Error && 'status' in problem && problem.status === 401) onError(problem);
      else setDeleteError(problem instanceof Error ? problem.message : 'The enquiry could not be deleted.');
    } finally { setDeleting(false); }
  }

  return <details className="editor-inbox-item">
    <summary>
      <strong>{entry.fields['name'] || entry.fields['email']}</strong>
      <span>{inboxKinds[entry.kind]} · {inboxStatuses[entry.status]}{entry.owner && ` · ${entry.owner}`}</span>
      <time dateTime={entry.receivedAt}>{new Date(entry.receivedAt).toLocaleString()}</time>
    </summary>
    <div className="inbox-details">
      <div>
        <dl>{Object.entries(entry.fields).filter(([, value]) => value).map(([field, value]) =>
          <div key={field}><dt>{fieldLabels[field] ?? field}</dt><dd>{value}</dd></div>)}</dl>
        {entry.attachmentName && <a className="text-link" href={`/api/iff/admin/resume/${entry.id}`} download>Download résumé</a>}
      </div>
      <form className="inbox-follow-up" key={entry.revision} onSubmit={save}>
        <label>Follow-up status<select name="status" defaultValue={entry.status}>
          {Object.entries(inboxStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>Owner<input name="owner" maxLength={120} defaultValue={entry.owner} /></label>
        <label>Internal notes<textarea name="notes" rows={4} maxLength={5000} defaultValue={entry.notes} /></label>
        {error && <p className="form-notice form-error" role="alert">{error}</p>}
        <div className="editor-actions">
          <Button type="submit" disabled={saving || deleting}>{saving ? 'Saving…' : 'Save follow-up'}</Button>
          {onDelete && <AlertDialog open={confirming} onOpenChange={open => {
            if (!deleting) { setConfirming(open); setDeleteError(''); }
          }}>
            <AlertDialogTrigger asChild><Button type="button" variant="destructive" disabled={saving || deleting}>Delete enquiry</Button></AlertDialogTrigger>
            <AlertDialogContent className="editor-delete-dialog">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this enquiry?</AlertDialogTitle>
                <AlertDialogDescription>This permanently removes the submission, any attachment and its follow-up notes.</AlertDialogDescription>
              </AlertDialogHeader>
              {deleteError && <p role="alert">{deleteError}</p>}
              <AlertDialogFooter>
                <AlertDialogCancel type="button" disabled={deleting}>Cancel</AlertDialogCancel>
                <Button type="button" variant="destructive" disabled={deleting} onClick={remove}>{deleting ? 'Deleting…' : 'Delete enquiry'}</Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>}
        </div>
      </form>
    </div>
  </details>;
}
