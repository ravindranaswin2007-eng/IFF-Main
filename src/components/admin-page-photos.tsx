import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, Clipboard, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAdminData, useLibrary, type SiteSettings } from '@/components/admin-site-content';
import { pagePhotoSlots, type LibraryAsset, type PhotoChoice, type PhotoSlot } from '@/lib/cms';
import { editorApi } from '@/lib/editor-api';
import { photoPlacements, type PhotoPage } from '@/lib/photos';
import { maxMediaBytes, maxMediaMb } from '@/lib/upload-limits';

type PublishResult = { choice: PhotoChoice | null; asset: LibraryAsset | null };
const imageExtensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

export function AdminPagePhotos({ onError }: { onError: (error: unknown) => void }) {
  const { data: settings, setData: setSettings } = useAdminData<SiteSettings>('site/settings', onError);
  const { data: assets, setData: setAssets } = useLibrary(onError);
  const [page, setPage] = useState<PhotoPage>('/');
  const [busy, setBusy] = useState(0);
  const photos = assets?.filter(asset => asset.type === 'photo') ?? [];

  function published(slot: PhotoSlot, { choice, asset }: PublishResult) {
    if (asset) setAssets(current => [asset, ...(current ?? [])]);
    setSettings(current => {
      if (!current) return current;
      const placements = { ...current.pages[page] };
      if (choice) placements[slot] = choice;
      else delete placements[slot];
      return { ...current, pages: { ...current.pages, [page]: placements } };
    });
  }

  return <div className="page-photo-editor">
    <div className="page-photo-toolbar">
      <label>Website page<select value={page} disabled={busy > 0} onChange={event => setPage(event.target.value as PhotoPage)}>
        {Object.entries(pagePhotoSlots).map(([path, label]) => <option value={path} key={path}>{label}</option>)}
      </select></label>
      <a className="page-photo-live" href={page} target="_blank" rel="noreferrer">Open live page <ArrowUpRight size={15} /></a>
    </div>
    <p>Paste or drop a JPG, PNG or WebP up to {maxMediaMb} MB into a placement, or choose a photo from the library.</p>
    {settings && assets ? <div className="page-photo-grid">
      {photoPlacements[page].map(placement => <PagePhotoCard key={`${page}:${placement.slot}`} page={page}
        placement={placement} saved={settings.pages[page]?.[placement.slot]} photos={photos}
        onPublish={result => published(placement.slot, result)} onError={onError}
        onBusy={pending => setBusy(count => count + (pending ? 1 : -1))} />)}
    </div> : <p role="status">Loading page photographs…</p>}
  </div>;
}

function PagePhotoCard({ page, placement, saved, photos, onPublish, onBusy, onError }: {
  page: PhotoPage; placement: (typeof photoPlacements)[PhotoPage][number]; saved: PhotoChoice | undefined;
  photos: LibraryAsset[]; onPublish: (result: PublishResult) => void; onBusy: (busy: boolean) => void;
  onError: (error: unknown) => void;
}) {
  const [src, setSrc] = useState(saved?.src ?? '');
  const [alt, setAlt] = useState(saved?.alt ?? '');
  const [upload, setUpload] = useState<{ file: File; url: string }>();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [problem, setProblem] = useState('');
  const dropZone = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const label = useId();
  const preview = upload?.url ?? (src || placement.src);
  const dirty = Boolean(upload || src !== (saved?.src ?? '') || (src && alt.trim() !== (saved?.alt ?? '')));

  useEffect(() => {
    const url = upload?.url;
    return url ? () => URL.revokeObjectURL(url) : undefined;
  }, [upload?.url]);

  function stage(file: File) {
    setNotice('');
    setProblem('');
    if (!/\.(jpe?g|png|webp)$/i.test(file.name) || !file.size) {
      setProblem('Choose a JPG, PNG or WebP image.');
      return;
    }
    if (file.size > maxMediaBytes) {
      setProblem(`Choose an image up to ${maxMediaMb} MB.`);
      return;
    }
    setSrc('');
    setAlt('');
    setUpload({ file, url: URL.createObjectURL(file) });
  }

  async function pasteFromClipboard() {
    dropZone.current?.focus();
    try {
      const clipboard = await navigator.clipboard.read();
      for (const entry of clipboard) {
        const type = entry.types.find(item => Object.hasOwn(imageExtensions, item));
        if (type) {
          stage(new File([await entry.getType(type)], `clipboard.${imageExtensions[type]}`, { type }));
          return;
        }
      }
      setProblem('Copy the image itself, or choose a file from your device.');
    } catch {
      setProblem('Press Ctrl+V or Command+V here to paste an image.');
    }
  }

  function selectPhoto(next: string) {
    setSrc(next);
    setAlt(next && next === saved?.src ? saved.alt : '');
    setUpload(undefined);
    setProblem('');
    setNotice('');
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !dirty) return;
    setPending(true);
    onBusy(true);
    setProblem('');
    setNotice('');
    const body = new FormData();
    body.set('page', page);
    body.set('slot', placement.slot);
    body.set('src', src);
    body.set('alt', alt);
    if (upload) body.set('file', upload.file);
    try {
      const result = await editorApi<PublishResult>('site/page-photo', body);
      onPublish(result);
      setSrc(result.choice?.src ?? '');
      setAlt(result.choice?.alt ?? '');
      setUpload(undefined);
      setNotice('Published to the live page.');
    } catch (error) {
      if (error instanceof Error && 'status' in error && error.status === 401) onError(error);
      else setProblem(error instanceof Error ? error.message : 'Could not publish the photo. Try again.');
    } finally {
      setPending(false);
      onBusy(false);
    }
  }

  return <form className="page-photo-card" onSubmit={publish} aria-labelledby={label}>
    <header><h2 id={label}>{placement.label}</h2><span>{dirty ? 'Unpublished change' : 'Live'}</span></header>
    <div className="page-photo-preview" tabIndex={0} ref={dropZone} role="group" aria-label={`Paste or drop an image for ${placement.label}`}
      onPaste={event => {
        if (pending) return;
        event.preventDefault();
        const file = event.clipboardData.files[0] ?? Array.from(event.clipboardData.items)
          .find(item => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile();
        if (file) stage(file);
        else setProblem('Copy an image itself, or choose a file from your device.');
      }} onDragOver={event => event.preventDefault()} onDrop={event => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (!pending && file) stage(file);
      }}>
      <img src={preview} alt="" loading="lazy" />
      <div className="page-photo-preview-tools">
        <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={pasteFromClipboard}><Clipboard size={15} /> Paste image</Button>
        <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => fileInput.current?.click()}><Upload size={15} /> Choose file</Button>
      </div>
    </div>
    <input ref={fileInput} type="file" hidden accept=".jpg,.jpeg,.png,.webp" onChange={event => {
      const file = event.currentTarget.files?.[0];
      if (file) stage(file);
      event.currentTarget.value = '';
    }} />
    {upload && <p className="page-photo-filename">{upload.file.name}</p>}
    <label>Photo library<select value={upload ? '' : src} disabled={pending} onChange={event => selectPhoto(event.target.value)}>
      <option value="" disabled={Boolean(upload)}>{upload ? 'New photo selected' : 'Original photo'}</option>
      {src && !photos.some(photo => photo.url === src) && <option value={src}>Current photo</option>}
      {photos.map(photo => <option value={photo.url} key={photo.id}>{photo.label}</option>)}
    </select></label>
    <label>Image description<input value={alt} maxLength={240} placeholder={src || upload ? 'Describe the image for screen readers' : placement.alt}
      disabled={pending || (!src && !upload)} onChange={event => { setAlt(event.target.value); setNotice(''); }} /></label>
    {problem && <p className="page-photo-problem" role="alert">{problem}</p>}
    {notice && <p role="status">{notice}</p>}
    <div className="editor-actions">
      <Button type="submit" disabled={pending || !dirty}>{pending ? 'Publishing…' : 'Publish photo'}</Button>
      <Button type="button" variant="outline" disabled={pending || (!src && !upload)} onClick={() => selectPhoto('')}>Use original</Button>
    </div>
  </form>;
}
