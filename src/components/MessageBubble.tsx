import React, { useEffect, useState, useRef } from 'react';
import { UserAvatar } from './UserAvatar';
import { db } from '../lib/database';
import type { Message, Member } from '../App';
import { useI18n } from '../lib/i18n';
import {
  DownloadIcon, FileTextIcon, FileIcon, ImageIcon, FileAudioIcon, FileVideoIcon,
  PlayIcon, PauseIcon, Pencil, Trash2, Copy, Check, PinIcon, PinOffIcon,
  BookmarkIcon, PlusIcon, SparklesIcon, XIcon, PackageIcon, ChevronRightIcon,
  LayersIcon, LinkIcon, SmileIcon, ExternalLinkIcon, ReplyIcon,
} from 'lucide-react';
import { loadPacks, savePacks, decodePack, type StickerPack, type CustomSticker } from './GifStickerPicker';
import { lookupCustomEmoji, lookupCustomEmojiName, decodeEmojiPack, loadEmojiPacks, saveEmojiPacks, type CustomEmojiPack, type CustomEmoji } from './EmojiPicker';

const CUSTOM_EMOJI_RE = /:custom:([^:]+):([^:]+):/g;
const URL_RE = /https?:\/\/[^\s<>\])"'`,]+/g;
function getFirstUrl(content: string): string | null {
  URL_RE.lastIndex = 0; let match: RegExpExecArray | null;
  while ((match = URL_RE.exec(content)) !== null) {
    let url = match[0]; while (url.length > 0 && /[.,;:!?)}\]>]$/.test(url)) url = url.slice(0, -1);
    const urlStart = match.index; const urlEnd = match.index + url.length;
    CUSTOM_EMOJI_RE.lastIndex = 0; let emojiMatch: RegExpExecArray | null; let overlaps = false;
    while ((emojiMatch = CUSTOM_EMOJI_RE.exec(content)) !== null) { if (emojiMatch.index < urlEnd && urlStart < emojiMatch.index + emojiMatch[0].length) { overlaps = true; break; } }
    if (!overlaps) return url;
  } return null;
}
function renderMessageContent(content: string): React.ReactNode {
  type MatchEntry = { type: 'emoji'; index: number; length: number; packId: string; emojiId: string } | { type: 'url'; index: number; length: number; url: string };
  const matches: MatchEntry[] = []; CUSTOM_EMOJI_RE.lastIndex = 0; let match: RegExpExecArray | null;
  while ((match = CUSTOM_EMOJI_RE.exec(content)) !== null) matches.push({ type: 'emoji', index: match.index, length: match[0].length, packId: match[1], emojiId: match[2] });
  URL_RE.lastIndex = 0;
  while ((match = URL_RE.exec(content)) !== null) { let url = match[0]; while (url.length > 0 && /[.,;:!?)}\]>]$/.test(url)) url = url.slice(0, -1); const urlStart = match.index; const urlEnd = match.index + url.length; const overlaps = matches.some((m) => m.index < urlEnd && urlStart < m.index + m.length); if (!overlaps) matches.push({ type: 'url', index: match.index, length: url.length, url }); }
  matches.sort((a, b) => a.index - b.index); if (matches.length === 0) return content;
  const parts: React.ReactNode[] = []; let lastIndex = 0;
  for (const m of matches) {
    if (m.index > lastIndex) parts.push(content.slice(lastIndex, m.index));
    if (m.type === 'emoji') { const url = lookupCustomEmoji(m.packId, m.emojiId); const name = lookupCustomEmojiName(m.packId, m.emojiId); if (url) parts.push(<img key={`emoji-${m.index}`} src={url} alt={name ? `:${name}:` : ':custom emoji:'} title={name ?? undefined} className="inline-block w-6 h-6 object-contain align-middle mx-0.5" />); else parts.push(content.slice(m.index, m.index + m.length)); }
    else if (m.type === 'url') parts.push(<a key={`url-${m.index}`} href={m.url} target="_blank" rel="noopener noreferrer" className="text-[#89b4fa] hover:underline cursor-pointer" onClick={(e) => e.stopPropagation()}>{m.url}</a>);
    lastIndex = m.index + m.length;
  }
  if (lastIndex < content.length) parts.push(content.slice(lastIndex));
  return <>{parts}</>;
}

function UrlEmbedCard({ url }: { url: string }) {
  let domain = url; try { const parsed = new URL(url); domain = parsed.hostname.replace(/^www\./, ''); } catch {}
  return (
    <div className="mt-1.5 max-w-[420px] bg-[#181825] border border-[#313244] rounded-lg overflow-hidden flex">
      <div className="w-1 bg-[#cba6f7] flex-shrink-0" />
      <div className="px-3 py-2.5 min-w-0 flex-1">
        <p className="text-[#cba6f7] text-xs font-semibold mb-0.5 truncate">{domain}</p>
        <p className="text-[#a6adc8] text-[11px] truncate mb-1.5" title={url}>{url}</p>
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#89b4fa] text-xs font-medium hover:underline" onClick={(e) => e.stopPropagation()}><ExternalLinkIcon className="w-3 h-3" />Open in Browser</a>
      </div>
    </div>
  );
}

// ✅ Image embed with lightbox
function ImageEmbed({ url, name }: { url: string; name: string }) {
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState(false)
  if (error) return null
  return (
    <>
      <div className="mt-1 cursor-pointer inline-block" onClick={() => setExpanded(true)}>
        <img src={url} alt={name} className="max-w-sm max-h-64 rounded-lg object-contain hover:opacity-90 transition-opacity" onError={() => setError(true)} loading="lazy" />
      </div>
      {expanded && (
        <div className="fixed inset-0 z-[999] bg-black/85 flex items-center justify-center" onClick={() => setExpanded(false)}>
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <img src={url} alt={name} className="max-w-full max-h-[90vh] rounded-lg object-contain" />
            <button onClick={() => setExpanded(false)} className="absolute top-2 right-2 w-8 h-8 bg-black/60 rounded-full flex items-center justify-center text-white hover:bg-black/80 transition-colors"><XIcon className="w-4 h-4" /></button>
            <a href={url} download={name} onClick={e => e.stopPropagation()} className="absolute bottom-2 right-2 w-8 h-8 bg-black/60 rounded-full flex items-center justify-center text-white hover:bg-black/80 transition-colors" title="Download"><DownloadIcon className="w-4 h-4" /></a>
          </div>
        </div>
      )}
    </>
  )
}

// ✅ Video embed - thumbnail with click to open
function VideoEmbed({ url, name }: { url: string; name: string }) {
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState(false)
  if (error) return (
    <div className="flex items-center gap-3 bg-[#181825] border border-[#313244] rounded-lg p-3 max-w-sm mt-1">
      <FileVideoIcon className="w-8 h-8 text-[#cba6f7] flex-shrink-0" />
      <div className="flex-1 min-w-0"><p className="text-sm text-[#cdd6f4] truncate">{name}</p><a href={url} download={name} className="text-xs text-[#89b4fa] hover:underline">Download</a></div>
    </div>
  )
  return (
    <>
      <div className="mt-1 max-w-sm rounded-lg overflow-hidden bg-black cursor-pointer relative group/video" onClick={() => setExpanded(true)}>
        <video className="w-full max-h-64 rounded-t-lg" onError={() => setError(true)} preload="metadata">
          <source src={url} />
        </video>
        {/* Play overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover/video:bg-black/50 transition-colors rounded-t-lg">
          <div className="w-14 h-14 rounded-full bg-black/60 flex items-center justify-center">
            <PlayIcon className="w-7 h-7 text-white ml-1" />
          </div>
        </div>
        <div className="flex items-center justify-between px-2 py-1.5 bg-[#181825]">
          <p className="text-xs text-[#6c7086] truncate flex-1 mr-2">{name}</p>
          <a href={url} download={name} onClick={e => e.stopPropagation()} className="text-[#6c7086] hover:text-[#cdd6f4] transition-colors flex-shrink-0" title="Download"><DownloadIcon className="w-3.5 h-3.5" /></a>
        </div>
      </div>
      {expanded && (
        <div className="fixed inset-0 z-[999] bg-black/85 flex items-center justify-center" onClick={() => setExpanded(false)}>
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <video controls autoPlay className="max-w-full max-h-[85vh] rounded-lg" onError={() => setError(true)}>
              <source src={url} />
            </video>
            <button onClick={() => setExpanded(false)} className="absolute top-2 right-2 w-8 h-8 bg-black/60 rounded-full flex items-center justify-center text-white hover:bg-black/80 transition-colors"><XIcon className="w-4 h-4" /></button>
            <a href={url} download={name} onClick={e => e.stopPropagation()} className="absolute bottom-2 right-2 w-8 h-8 bg-black/60 rounded-full flex items-center justify-center text-white hover:bg-black/80 transition-colors" title="Download"><DownloadIcon className="w-4 h-4" /></a>
          </div>
        </div>
      )}
    </>
  )
}

// ✅ Audio embed
function AudioEmbed({ url, name }: { url: string; name: string }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  const toggle = () => { if (!audioRef.current) return; if (isPlaying) audioRef.current.pause(); else audioRef.current.play(); setIsPlaying(!isPlaying) }
  const seek = (e: React.MouseEvent<HTMLDivElement>) => { if (!audioRef.current || !duration) return; const r = e.currentTarget.getBoundingClientRect(); audioRef.current.currentTime = ((e.clientX - r.left) / r.width) * duration }
  if (error) return (
    <div className="flex items-center gap-3 bg-[#181825] border border-[#313244] rounded-lg p-3 max-w-sm mt-1">
      <FileAudioIcon className="w-8 h-8 text-[#cba6f7] flex-shrink-0" />
      <div className="flex-1 min-w-0"><p className="text-sm text-[#cdd6f4] truncate">{name}</p><a href={url} download={name} className="text-xs text-[#89b4fa] hover:underline">Download</a></div>
    </div>
  )
  return (
    <div className="mt-1 flex items-center gap-3 bg-[#181825] border border-[#313244] rounded-xl px-3 py-2.5 max-w-sm">
      <audio ref={audioRef} src={url} onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)} onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)} onEnded={() => { setIsPlaying(false); setCurrentTime(0) }} onError={() => setError(true)} />
      <button onClick={toggle} className="w-9 h-9 rounded-full bg-[#cba6f7] hover:bg-[#b4befe] flex items-center justify-center flex-shrink-0 transition-colors">
        {isPlaying ? <PauseIcon className="w-4 h-4 text-white" /> : <PlayIcon className="w-4 h-4 text-white ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-[#cdd6f4] truncate mb-1.5">{name}</p>
        <div onClick={seek} className="h-1.5 bg-[#45475a] rounded-full cursor-pointer relative">
          <div className="absolute inset-y-0 left-0 bg-[#cba6f7] rounded-full transition-all" style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }} />
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-[#6c7086]"><span>{fmt(currentTime)}</span><span>{fmt(duration)}</span></div>
      </div>
      <a href={url} download={name} className="text-[#6c7086] hover:text-[#cdd6f4] transition-colors flex-shrink-0" title="Download"><DownloadIcon className="w-4 h-4" /></a>
    </div>
  )
}

interface MessageBubbleProps {
  message: Message; isOwnMessage: boolean;
  onAuthorClick: (member: Member, event: React.MouseEvent) => void;
  onEdit: (messageId: string, newContent: string) => void;
  onDelete: (messageId: string) => void;
  serverId?: string; onPin?: (messageId: string) => void; onUnpin?: (messageId: string) => void;
  isPinned?: boolean; canPin?: boolean; currentUserId?: string; contextId?: string;
  onReply?: (message: Message) => void;
}
function formatFileSize(bytes: number) { if (bytes < 1024) return bytes + ' B'; if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'; return (bytes / (1024 * 1024)).toFixed(1) + ' MB'; }
function getFileIcon(type: string) { if (type.startsWith('image/')) return ImageIcon; if (type.startsWith('audio/')) return FileAudioIcon; if (type.startsWith('video/')) return FileVideoIcon; if (type.includes('pdf') || type.includes('document') || type.includes('text')) return FileTextIcon; return FileIcon; }
function parseStickerAttachment(name: string): { isSticker: boolean; pack: StickerPack | null } { if (name === 'sticker') return { isSticker: true, pack: null }; if (name.startsWith('sticker::')) { const pack = decodePack(name.slice('sticker::'.length)); return { isSticker: true, pack }; } return { isSticker: false, pack: null }; }
function isMediaOnlyAttachment(attachment: { name: string; type: string }): { isGif: boolean; isSticker: boolean } { const isGif = attachment.name === 'gif' || attachment.type === 'image/gif'; const { isSticker } = parseStickerAttachment(attachment.name); return { isGif, isSticker }; }

function StickerActionPill({ attachment, currentUserId }: { attachment: { name: string; size: number; url: string; type: string }; currentUserId: string }) {
  const [stickerSaved, setStickerSaved] = useState(false); const [packAdded, setPackAdded] = useState(false); const [urlCopied, setUrlCopied] = useState(false); const [gifSaved, setGifSaved] = useState(false);
  const { isGif } = isMediaOnlyAttachment(attachment); const { pack } = parseStickerAttachment(attachment.name);
  const handleSaveGif = () => { db.saveGif(currentUserId, attachment.url); setGifSaved(true); setTimeout(() => setGifSaved(false), 1500); };
  const handleSaveSticker = () => { const packs = loadPacks(currentUserId); const newSticker: CustomSticker = { id: Date.now().toString(), url: attachment.url, name: 'Saved sticker' }; const updated = packs.length > 0 ? packs.map((p, i) => i === 0 ? { ...p, stickers: [...p.stickers, newSticker] } : p) : [{ id: Date.now().toString(), name: 'My Stickers', stickers: [newSticker] }]; savePacks(updated, currentUserId); setStickerSaved(true); setTimeout(() => setStickerSaved(false), 1500); };
  const handleAddPack = () => { if (!pack) return; const packs = loadPacks(currentUserId); const imported: StickerPack = { ...pack, id: Date.now().toString(), stickers: pack.stickers.map((s) => ({ ...s, id: Date.now().toString() + Math.random() })) }; savePacks([...packs, imported], currentUserId); setPackAdded(true); setTimeout(() => setPackAdded(false), 1500); };
  const handleCopyUrl = () => { const ta = document.createElement('textarea'); ta.value = attachment.url; ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.left = '0'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.focus(); ta.select(); try { document.execCommand('copy'); } catch {} document.body.removeChild(ta); setUrlCopied(true); setTimeout(() => setUrlCopied(false), 1500); };
  return (
    <div className="absolute -top-8 left-0 flex items-center gap-0.5 bg-[#11111b]/90 backdrop-blur-sm border border-[#313244] rounded-full px-1 py-0.5 shadow-lg opacity-0 group-hover/sticker:opacity-100 transition-opacity z-20">
      {isGif ? <button onClick={handleSaveGif} className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-[#313244]" title="Save GIF">{gifSaved ? <Check className="w-3.5 h-3.5 text-[#a6e3a1]" /> : <BookmarkIcon className="w-3.5 h-3.5 text-[#bac2de]" />}</button>
        : <button onClick={handleSaveSticker} className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-[#313244]" title="Save sticker">{stickerSaved ? <Check className="w-3.5 h-3.5 text-[#a6e3a1]" /> : <BookmarkIcon className="w-3.5 h-3.5 text-[#bac2de]" />}</button>}
      {pack && <button onClick={handleAddPack} className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-[#313244]" title={packAdded ? '✓ Pack Added' : `Add pack`}>{packAdded ? <Check className="w-3.5 h-3.5 text-[#a6e3a1]" /> : <LayersIcon className="w-3.5 h-3.5 text-[#bac2de]" />}</button>}
      <button onClick={handleCopyUrl} className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-[#313244]" title="Copy URL">{urlCopied ? <Check className="w-3.5 h-3.5 text-[#a6e3a1]" /> : <LinkIcon className="w-3.5 h-3.5 text-[#bac2de]" />}</button>
    </div>
  );
}

function StickerAttachment({ attachment, currentUserId }: { attachment: { name: string; size: number; url: string; type: string }; currentUserId: string }) {
  const { isGif } = isMediaOnlyAttachment(attachment); const [imgError, setImgError] = useState(false);
  if (imgError) return <div className="w-32 h-32 bg-[#181825] rounded-lg flex items-center justify-center text-[#6c7086] text-xs">Failed to load</div>;
  return (<div className="relative inline-block group/sticker"><img src={attachment.url} alt={isGif ? 'GIF' : 'Sticker'} className={isGif ? 'max-w-full max-h-48 rounded-lg object-contain' : 'max-h-32 rounded-lg object-contain'} onError={() => setImgError(true)} loading="lazy" /><StickerActionPill attachment={attachment} currentUserId={currentUserId} /></div>);
}

function VoiceMessagePlayer({ url, duration }: { url: string; duration: number }) {
  const [isPlaying, setIsPlaying] = useState(false); const [currentTime, setCurrentTime] = useState(0); const audioRef = useRef<HTMLAudioElement>(null);
  const formatTime = (seconds: number) => { const mins = Math.floor(seconds / 60); const secs = Math.floor(seconds % 60); return `${mins}:${secs.toString().padStart(2, '0')}`; };
  const togglePlay = () => { if (audioRef.current) { if (isPlaying) audioRef.current.pause(); else audioRef.current.play(); setIsPlaying(!isPlaying); } };
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => { if (audioRef.current) { const rect = e.currentTarget.getBoundingClientRect(); audioRef.current.currentTime = (e.clientX - rect.left) / rect.width * duration; } };
  const progress = duration > 0 ? currentTime / duration * 100 : 0;
  return (
    <div className="flex items-center gap-3 bg-[#181825] rounded-lg px-3 py-2 min-w-64">
      <audio ref={audioRef} src={url} onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)} onEnded={() => { setIsPlaying(false); setCurrentTime(0); }} />
      <button onClick={togglePlay} className="w-10 h-10 rounded-full bg-[#cba6f7] hover:bg-[#b4befe] flex items-center justify-center flex-shrink-0">{isPlaying ? <PauseIcon className="w-5 h-5 text-white" /> : <PlayIcon className="w-5 h-5 text-white ml-0.5" />}</button>
      <div className="flex-1"><div onClick={handleSeek} className="h-1.5 bg-[#45475a] rounded-full cursor-pointer relative overflow-hidden"><div className="absolute inset-y-0 left-0 bg-[#cba6f7] rounded-full" style={{ width: `${progress}%` }} /></div><div className="flex justify-between mt-1 text-xs text-[#a6adc8]"><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div></div>
    </div>
  );
}

function PackShareCard({ attachment, currentUserId }: { attachment: { name: string; size: number; url: string; type: string }; currentUserId: string }) {
  const [added, setAdded] = useState(false); const [alreadyOwned, setAlreadyOwned] = useState(false);
  const pack: StickerPack | null = (() => { try { const code = attachment.name.slice('pack-share::'.length); return JSON.parse(decodeURIComponent(escape(atob(code)))) as StickerPack; } catch { return null; } })();
  if (!pack) return null;
  const previews = pack.stickers.slice(0, 4); const empties = Array(Math.max(0, 4 - previews.length)).fill(null);
  const handleAdd = () => { const packs = loadPacks(currentUserId); if (packs.some((p) => p.id === pack.id || p.name === pack.name)) { setAlreadyOwned(true); setTimeout(() => setAlreadyOwned(false), 2000); return; } const imported: StickerPack = { ...pack, id: Date.now().toString(), stickers: pack.stickers.map((s) => ({ ...s, id: Date.now().toString() + Math.random() })) }; savePacks([...packs, imported], currentUserId); setAdded(true); };
  return (
    <div className="w-[260px] bg-[#181825] border border-[#313244] rounded-2xl overflow-hidden shadow-lg">
      <div className="px-3 pt-3 pb-2 flex items-center gap-2"><div className="w-7 h-7 rounded-lg bg-[#cba6f7]/20 flex items-center justify-center flex-shrink-0"><PackageIcon className="w-3.5 h-3.5 text-[#cba6f7]" /></div><div className="flex-1 min-w-0"><p className="text-[#cdd6f4] text-sm font-bold truncate">{pack.name}</p><p className="text-[10px] text-[#6c7086]">{pack.stickers.length} stickers</p></div></div>
      <div className="grid grid-cols-4 gap-1 px-3 pb-3">{previews.map((s) => <div key={s.id} className="aspect-square bg-[#11111b] rounded-lg overflow-hidden flex items-center justify-center"><img src={s.url} alt={s.name} className="w-full h-full object-contain p-0.5" /></div>)}{empties.map((_, i) => <div key={`e-${i}`} className="aspect-square bg-[#11111b] rounded-lg opacity-20" />)}</div>
      <div className="px-3 pb-3"><button onClick={handleAdd} disabled={added} className={`w-full py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 ${added ? 'bg-[#a6e3a1]/20 text-[#a6e3a1] cursor-default' : alreadyOwned ? 'bg-[#f9e2af]/20 text-[#f9e2af] cursor-default' : 'bg-[#cba6f7] hover:bg-[#b4befe] text-white'}`}>{added ? <><Check className="w-4 h-4" />Added!</> : alreadyOwned ? <><Check className="w-4 h-4" />Already owned</> : <><PlusIcon className="w-4 h-4" />Add to My Stickers</>}</button></div>
    </div>
  );
}

function EmojiPackShareCard({ attachment, currentUserId }: { attachment: { name: string; size: number; url: string; type: string }; currentUserId: string }) {
  const [added, setAdded] = useState(false); const [alreadyOwned, setAlreadyOwned] = useState(false);
  const pack: CustomEmojiPack | null = (() => { try { return decodeEmojiPack(attachment.name.slice('emoji-pack::'.length)); } catch { return null; } })();
  if (!pack) return null;
  const previews = pack.emojis.slice(0, 8);
  const handleAdd = () => { const existingPacks = loadEmojiPacks(currentUserId); if (existingPacks.some((p) => p.name === pack.name)) { setAlreadyOwned(true); setTimeout(() => setAlreadyOwned(false), 2000); return; } const imported: CustomEmojiPack = { ...pack, id: Date.now().toString(), emojis: pack.emojis.map((e) => ({ ...e, id: Date.now().toString() + Math.random() })) }; saveEmojiPacks([...existingPacks, imported], currentUserId); setAdded(true); };
  return (
    <div className="w-[280px] bg-[#181825] border border-[#313244] rounded-2xl overflow-hidden shadow-lg">
      <div className="px-3.5 pt-3.5 pb-2 flex items-center gap-2.5"><div className="w-8 h-8 rounded-lg bg-[#89b4fa]/20 flex items-center justify-center flex-shrink-0"><SmileIcon className="w-4 h-4 text-[#89b4fa]" /></div><div className="flex-1 min-w-0"><p className="text-[#cdd6f4] text-sm font-bold truncate">{pack.name}</p><p className="text-[10px] text-[#6c7086]">{pack.emojis.length} emojis</p></div></div>
      <div className="px-3.5 pb-3 overflow-x-auto"><div className="flex gap-1.5">{previews.map((emoji) => <div key={emoji.id} className="w-10 h-10 flex-shrink-0 bg-[#11111b] rounded-lg flex items-center justify-center p-1"><img src={emoji.url} alt={emoji.name} className="w-full h-full object-contain" title={`:${emoji.name}:`} /></div>)}{pack.emojis.length > 8 && <div className="w-10 h-10 flex-shrink-0 bg-[#11111b] rounded-lg flex items-center justify-center"><span className="text-[10px] text-[#6c7086] font-semibold">+{pack.emojis.length - 8}</span></div>}</div></div>
      <div className="px-3.5 pb-3.5"><button onClick={handleAdd} disabled={added} className={`w-full py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 ${added ? 'bg-[#a6e3a1]/20 text-[#a6e3a1] cursor-default' : alreadyOwned ? 'bg-[#f9e2af]/20 text-[#f9e2af] cursor-default' : 'bg-[#89b4fa] hover:bg-[#89b4fa]/80 text-white'}`}>{added ? <><Check className="w-4 h-4" />Added!</> : alreadyOwned ? <><Check className="w-4 h-4" />Already owned</> : <><PlusIcon className="w-4 h-4" />Add Emoji Pack</>}</button></div>
    </div>
  );
}

// ✅ FileAttachment - images/video/audio كـ embeds
function FileAttachment({ attachment, currentUserId }: { attachment: { name: string; size: number; url: string; type: string }; currentUserId: string }) {
  const { isGif, isSticker } = isMediaOnlyAttachment(attachment)
  const isPackShare = attachment.type === 'application/pack-share' || attachment.name.startsWith('pack-share::')
  const isEmojiPackShare = attachment.type === 'application/emoji-pack-share' || attachment.name.startsWith('emoji-pack::')
  const isImage = attachment.type.startsWith('image/') && !isGif
  const isVideo = attachment.type.startsWith('video/')
  const isAudio = attachment.type.startsWith('audio/')

  if (isEmojiPackShare) return <EmojiPackShareCard attachment={attachment} currentUserId={currentUserId} />
  if (isPackShare) return <PackShareCard attachment={attachment} currentUserId={currentUserId} />
  if (isGif || isSticker) return <StickerAttachment attachment={attachment} currentUserId={currentUserId} />

  // ✅ Image: lightbox embed
  if (isImage) return (
    <div>
      <ImageEmbed url={attachment.url} name={attachment.name} />
      <div className="flex items-center gap-2 mt-1">
        <p className="text-xs text-[#6c7086] truncate max-w-[200px]">{attachment.name}</p>
        <span className="text-xs text-[#45475a]">·</span>
        <p className="text-xs text-[#45475a]">{formatFileSize(attachment.size)}</p>
        <a href={attachment.url} download={attachment.name} className="text-[#6c7086] hover:text-[#cdd6f4] transition-colors" title="Download"><DownloadIcon className="w-3.5 h-3.5" /></a>
      </div>
    </div>
  )

  // ✅ Video: inline player
  if (isVideo) return <VideoEmbed url={attachment.url} name={attachment.name} />

  // ✅ Audio: inline player
  if (isAudio) return <AudioEmbed url={attachment.url} name={attachment.name} />

  // Generic file
  const IconComponent = getFileIcon(attachment.type)
  return (
    <div className="bg-[#181825] border border-[#11111b] rounded-lg overflow-hidden max-w-sm">
      <div className="flex items-center gap-3 p-3">
        <div className="w-10 h-10 rounded bg-[#cba6f7] flex items-center justify-center flex-shrink-0"><IconComponent className="w-5 h-5 text-white" /></div>
        <div className="flex-1 min-w-0"><p className="text-[#89b4fa] hover:underline cursor-pointer truncate text-sm font-medium">{attachment.name}</p><p className="text-xs text-[#a6adc8]">{formatFileSize(attachment.size)}</p></div>
        <a href={attachment.url} download={attachment.name} className="text-[#bac2de] hover:text-[#cdd6f4] p-2" title="Download"><DownloadIcon className="w-5 h-5" /></a>
      </div>
    </div>
  )
}

export function MessageBubble({ message, isOwnMessage, onAuthorClick, onEdit, onDelete, serverId, onPin, onUnpin, isPinned, canPin, currentUserId = '', contextId = '', onReply }: MessageBubbleProps) {
  const { t } = useI18n()
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content)
  const [isCopied, setIsCopied] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [reactions, setReactions] = useState<Record<string, { emoji: string; userIds: string[]; userAvatars?: Record<string, string> }>>(message.reactions || {})
  const [serverProfile, setServerProfile] = useState<{ nickname?: string; avatar?: string } | undefined>(undefined)
  const [liveAvatar, setLiveAvatar] = useState<string | undefined>(message.author.avatar ?? undefined)

  useEffect(() => {
    if (!contextId) { setReactions(message.reactions || {}); return; }
    let unsub: (() => void) | null = null;
    try { unsub = db.subscribeToReactions(message.id, (r) => setReactions(r)) } catch { setReactions(message.reactions || {}); }
    return () => { try { unsub?.() } catch {} }
  }, [message.id, contextId])

  useEffect(() => { if (!serverId) return; db.getServerProfile(serverId, message.author.id).then(setServerProfile).catch(() => {}); }, [serverId, message.author.id])
  useEffect(() => { if (message.author.avatar) { setLiveAvatar(message.author.avatar); return; } db.getUser(message.author.id).then((user) => { if (user?.avatar) setLiveAvatar(user.avatar); }).catch(() => {}); }, [message.author.id, message.author.avatar])

  const displayName = serverProfile?.nickname || message.author.displayName
  const serverAvatar = serverProfile?.avatar || liveAvatar
  const formatTime = (date: Date) => new Date(date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })

  const handleReaction = async (emoji: string) => {
    setShowEmojiPicker(false); if (!contextId) return;
    const currentUserData = await db.getUser(currentUserId); const currentUserAvatar = currentUserData?.avatar || undefined;
    setReactions(prev => {
      const updated = { ...prev };
      if (!updated[emoji]) updated[emoji] = { emoji, userIds: [], userAvatars: {} };
      const idx = updated[emoji].userIds.indexOf(currentUserId);
      if (idx === -1) { updated[emoji] = { ...updated[emoji], userIds: [...updated[emoji].userIds, currentUserId], userAvatars: { ...updated[emoji].userAvatars, ...(currentUserAvatar ? { [currentUserId]: currentUserAvatar } : {}) } }; }
      else { const newIds = updated[emoji].userIds.filter(id => id !== currentUserId); if (newIds.length === 0) { const n = { ...updated }; delete n[emoji]; return n; } const newAvatars = { ...updated[emoji].userAvatars }; delete newAvatars[currentUserId]; updated[emoji] = { ...updated[emoji], userIds: newIds, userAvatars: newAvatars }; }
      return updated;
    });
    await db.addReaction(contextId, message.id, emoji, currentUserId, currentUserAvatar);
  }

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(message.content); }
    catch { const ta = document.createElement('textarea'); ta.value = message.content; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); }
    setIsCopied(true); setTimeout(() => setIsCopied(false), 2000);
  }

  const handleSaveEdit = () => { if (editContent.trim() && editContent !== message.content) onEdit(message.id, editContent); setIsEditing(false); }
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); } else if (e.key === 'Escape') { setIsEditing(false); setEditContent(message.content); } }

  const renderedContent = message.content ? renderMessageContent(message.content) : null
  const firstUrl = message.content ? getFirstUrl(message.content) : null
  const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥']

  return (
    <div className="flex gap-4 hover:bg-[#313244] px-2 py-1 rounded group relative">
      <div className="cursor-pointer flex-shrink-0" onClick={(e) => onAuthorClick(message.author, e)}>
        <UserAvatar user={message.author} size="md" serverAvatar={serverAvatar} />
      </div>
      <div className="flex-1 min-w-0">
        {message.replyTo && (
          <div className="flex items-center gap-2 mb-1 text-xs text-[#6c7086]">
            <div className="w-4 h-4 border-l-2 border-t-2 border-[#45475a] rounded-tl ml-2 flex-shrink-0" />
            {message.replyTo.authorAvatar ? <img src={message.replyTo.authorAvatar} className="w-4 h-4 rounded-full object-cover" alt="" /> : <div className="w-4 h-4 rounded-full bg-[#cba6f7] flex-shrink-0" />}
            <span className="text-[#cba6f7] font-medium">{message.replyTo.authorName}</span>
            <span className="truncate max-w-[200px]">{message.replyTo.content.slice(0, 80)}</span>
          </div>
        )}
        <div className="flex items-baseline gap-2">
          <span className="font-medium text-[#cdd6f4] hover:underline cursor-pointer" onClick={(e) => onAuthorClick(message.author, e)}>{displayName}</span>
          <span className="text-xs text-[#6c7086]">{formatTime(message.timestamp)}</span>
          {isPinned && <span className="text-[10px] text-[#cba6f7] flex items-center gap-0.5"><PinIcon className="w-3 h-3" />{t('message.pinned')}</span>}
        </div>
        {isEditing ? (
          <div className="mt-1">
            <input type="text" value={editContent} onChange={(e) => setEditContent(e.target.value)} onKeyDown={handleKeyDown} className="w-full bg-[#1e1e2e] text-[#cdd6f4] p-2 rounded border border-[#11111b] focus:outline-none focus:border-[#cba6f7]" autoFocus />
            <div className="text-xs text-[#a6adc8] mt-1">{t('message.escapeCancel')} • {t('message.enterSave')}</div>
          </div>
        ) : renderedContent && (
          <><p className="text-[#cdd6f4] break-words" style={{ fontSize: 'inherit' }}>{renderedContent}</p>{firstUrl && <UrlEmbedCard url={firstUrl} />}</>
        )}
        {message.voiceMessage && <div className="mt-2"><VoiceMessagePlayer url={message.voiceMessage.url} duration={message.voiceMessage.duration} /></div>}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2 space-y-2">
            {message.attachments.map((attachment, index) => <FileAttachment key={index} attachment={attachment} currentUserId={currentUserId} />)}
          </div>
        )}
        {Object.keys(reactions).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {Object.values(reactions).map((r) => {
              const hasReacted = r.userIds.includes(currentUserId); const avatarList = Object.values(r.userAvatars || {}).slice(0, 3)
              return (<button key={r.emoji} onClick={() => handleReaction(r.emoji)} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-sm border transition-colors ${hasReacted ? 'bg-[#cba6f7]/20 border-[#cba6f7] text-[#cba6f7]' : 'bg-[#313244] border-[#45475a] text-[#cdd6f4] hover:border-[#cba6f7]'}`}><span>{r.emoji}</span><div className="flex -space-x-1">{avatarList.map((av, i) => <img key={i} src={av} className="w-4 h-4 rounded-full border border-[#181825] object-cover" alt="" />)}</div><span className="text-xs font-medium">{r.userIds.length}</span></button>)
            })}
            <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="flex items-center justify-center w-7 h-6 rounded-full bg-[#313244] border border-[#45475a] text-[#6c7086] hover:text-[#cdd6f4] hover:border-[#cba6f7] transition-colors text-sm">+</button>
          </div>
        )}
      </div>
      <div className="absolute top-[-16px] right-4 bg-[#11111b] border border-[#181825] rounded shadow-sm p-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        {QUICK_EMOJIS.map(emoji => <button key={emoji} onClick={() => handleReaction(emoji)} className="p-1 hover:bg-[#313244] rounded text-base leading-none" title={`React ${emoji}`}>{emoji}</button>)}
        <div className="w-px h-4 bg-[#313244] mx-0.5" />
        {onReply && <button onClick={() => onReply(message)} className="p-1.5 hover:bg-[#313244] rounded text-[#bac2de] hover:text-[#cdd6f4]" title="Reply"><ReplyIcon size={14} /></button>}
        {canPin && <button onClick={() => isPinned ? onUnpin?.(message.id) : onPin?.(message.id)} className="p-1.5 hover:bg-[#313244] rounded text-[#bac2de] hover:text-[#cba6f7]" title={isPinned ? t('message.unpin') : t('message.pin')}>{isPinned ? <PinOffIcon size={14} /> : <PinIcon size={14} />}</button>}
        {isOwnMessage && <><button onClick={() => setIsEditing(true)} className="p-1.5 hover:bg-[#313244] rounded text-[#bac2de] hover:text-[#cdd6f4]" title={t('message.edit')}><Pencil size={14} /></button><button onClick={() => onDelete(message.id)} className="p-1.5 hover:bg-[#313244] rounded text-[#bac2de] hover:text-[#f38ba8]" title={t('message.delete')}><Trash2 size={14} /></button></>}
        <button onClick={handleCopy} className="p-1.5 hover:bg-[#313244] rounded text-[#bac2de] hover:text-[#a6e3a1]" title={isCopied ? t('message.copied') : t('message.copyText')}>{isCopied ? <Check size={14} /> : <Copy size={14} />}</button>
      </div>
      {showEmojiPicker && (
        <div className="absolute bottom-0 left-12 z-50 bg-[#11111b] border border-[#313244] rounded-xl shadow-2xl p-2">
          <div className="flex flex-wrap gap-1 max-w-[200px]">
            {['👍','👎','❤️','😂','😮','😢','😡','🔥','🎉','✅','💯','🙏','👀','💪','🤔','😍'].map(emoji => <button key={emoji} onClick={() => handleReaction(emoji)} className="w-8 h-8 flex items-center justify-center hover:bg-[#313244] rounded text-lg transition-colors">{emoji}</button>)}
          </div>
        </div>
      )}
    </div>
  )
}
