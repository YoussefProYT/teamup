import React, { useEffect, useState, useRef } from 'react'
import {
  HashIcon, BellIcon, PinIcon, UsersIcon, SearchIcon, InboxIcon,
  PaperclipIcon, StickerIcon, SmileIcon, SendIcon, MicIcon, SquareIcon,
  XIcon, FileIcon, AtSignIcon, PhoneIcon, VideoIcon, ChevronUpIcon, ArrowDownIcon,
} from 'lucide-react'
import { MessageBubble } from './MessageBubble'
import { WumpusEmptyState } from './WumpusEmptyState'
import { EmojiPicker } from './EmojiPicker'
import { PinnedMessages } from './PinnedMessages'
import { SearchPanel } from './SearchPanel'
import { InboxPanel } from './InboxPanel'
import { GifStickerPicker, type StickerPack } from './GifStickerPicker'
import { encodeEmojiPack, type CustomEmojiPack } from './EmojiPicker'
import { UserAvatar } from './UserAvatar'
import { db, syncChannel } from '../lib/database'
import type { Channel, Message, Member } from '../App'
import { motion, AnimatePresence } from 'framer-motion'
import { useI18n } from '../lib/i18n'

interface ChatAreaProps {
  channel: Channel | null
  messages: Message[]
  onSendMessage: (content: string, attachments?: { name: string; size: number; url: string; type: string }[], voiceMessage?: { url: string; duration: number }) => void
  onEditMessage: (messageId: string, newContent: string) => void
  onDeleteMessage: (messageId: string) => void
  currentUser: Member
  onMemberClick: (member: Member, event: React.MouseEvent) => void
  showMemberList: boolean
  onToggleMemberList: () => void
  isDM?: boolean
  serverId?: string
  serverMembers?: Member[]
  onStartCall?: (withVideo?: boolean) => void
  dmUserId?: string
  dmUser?: Member
  presenceMap?: Record<string, string>
  onOpenMobileMenu?: () => void
  contextId?: string
  members?: Member[] // Added for mentions
}

export function ChatArea({
  channel, messages, onSendMessage, onEditMessage, onDeleteMessage,
  currentUser, onMemberClick, showMemberList, onToggleMemberList,
  isDM = false, serverId, serverMembers, onStartCall, dmUserId, dmUser, presenceMap = {}, onOpenMobileMenu, contextId: contextIdProp,
  members = [], // Added
}: ChatAreaProps) {
  const { t } = useI18n()
  const [messageInput, setMessageInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const textInputRef = useRef<HTMLInputElement>(null)
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showGifStickerPicker, setShowGifStickerPicker] = useState(false)
  const [showPinnedMessages, setShowPinnedMessages] = useState(false)
  const [showSearchPanel, setShowSearchPanel] = useState(false)
  const [showInboxPanel, setShowInboxPanel] = useState(false)
  const [pinnedRefresh, setPinnedRefresh] = useState(0)
  const [pendingRequestCount, setPendingRequestCount] = useState(0)
  const [isBlockedState, setIsBlockedState] = useState(false)
  const [blockedByMe, setBlockedByMe] = useState(false)
  const [blockedByThem, setBlockedByThem] = useState(false)
  const [privacyBlocked, setPrivacyBlocked] = useState(false)
  const [canPin, setCanPin] = useState(false)
  const [dmUserStatus, setDmUserStatus] = useState<{ status: string } | null>(null)
  const [pinnedMessageIds, setPinnedMessageIds] = useState<Set<string>>(new Set())
  const [showMentionDropdown, setShowMentionDropdown] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionStart, setMentionStart] = useState(-1)

  useEffect(() => {
    if (!isDM || !dmUserId || !currentUser) {
      setIsBlockedState(false); setBlockedByMe(false); setBlockedByThem(false); setPrivacyBlocked(false)
      return
    }
    const checkBlocked = async () => {
      const myBlocked = await db.getBlockedUsers(currentUser.id)
      const theirBlocked = await db.getBlockedUsers(dmUserId)
      const byMe = myBlocked.includes(dmUserId)
      const byThem = theirBlocked.includes(currentUser.id)
      setBlockedByMe(byMe); setBlockedByThem(byThem)
      const canMsg = await db.canMessage(currentUser.id, dmUserId)
      const privacyBlock = !canMsg.allowed && !byMe && !byThem
      setPrivacyBlocked(privacyBlock)
      setIsBlockedState(byMe || byThem || !canMsg.allowed)
    }
    checkBlocked()
    const handleSync = (event: MessageEvent) => {
      if (event.data.type === 'friends_updated' || event.data.type === 'privacy_updated') checkBlocked()
    }
    syncChannel.addEventListener('message', handleSync)
    return () => syncChannel.removeEventListener('message', handleSync)
  }, [isDM, dmUserId, currentUser])

  useEffect(() => {
    if (isDM) { setCanPin(true); return }
    if (!serverId) { setCanPin(false); return }
    const checkCanPin = async () => {
      const roles = await db.getMemberRoles(serverId, currentUser.id)
      const isAdmin = roles.some((r) => r.permissions.administrator || r.permissions.manageChannels)
      setCanPin(isAdmin)
    }
    checkCanPin()
  }, [isDM, serverId, currentUser.id])

  useEffect(() => {
    if (!isDM || !dmUserId) return
    // ✅ استخدم presenceMap مباشرة - real-time بدل db.getUsers
    const status = presenceMap[dmUserId] || 'offline'
    setDmUserStatus({ status })
  }, [isDM, dmUserId, presenceMap])

  useEffect(() => {
    const contextId = isDM && channel ? (channel.id === 'dm' ? '' : channel.id) : channel?.id || ''
    if (!contextId) return
    db.getPinnedMessages(contextId).then((pins) => {
      setPinnedMessageIds(new Set(pins.map((p) => p.messageId)))
    })
  }, [channel?.id, pinnedRefresh])

  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const prevMessageCountRef = useRef(messages.length)

  const handleScroll = () => {
    const el = messagesContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const pinned = distanceFromBottom < 100
    setIsPinnedToBottom(pinned)
    if (pinned) setUnreadCount(0)
    setShowScrollTop(el.scrollTop > 500)
  }

  useEffect(() => {
    const newCount = messages.length
    const prev = prevMessageCountRef.current
    const added = newCount - prev
    prevMessageCountRef.current = newCount
    if (added <= 0) return
    if (isPinnedToBottom) { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); setUnreadCount(0) }
    else setUnreadCount((c) => c + added)
  }, [messages, isPinnedToBottom])

  useEffect(() => {
    setIsPinnedToBottom(true); setUnreadCount(0); setShowScrollTop(false)
    prevMessageCountRef.current = messages.length
    setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior }) }, 0)
  }, [channel?.id])

  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); setUnreadCount(0); setIsPinnedToBottom(true) }
  const scrollToTop = () => { messagesContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' }) }

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => { return () => { if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current) } }, [])

  useEffect(() => {
    const refresh = async () => {
      const all = await db.getFriendRequests(currentUser.id)
      setPendingRequestCount(all.filter((r) => r.status === 'pending').length)
    }
    refresh()
    const handler = (event: MessageEvent) => {
      if (event.data.type === 'friends_updated' || event.data.type === 'users_updated') refresh()
    }
    syncChannel.addEventListener('message', handler)
    return () => syncChannel.removeEventListener('message', handler)
  }, [currentUser.id])

  // ── handleSend: base64 بدل blob URLs ──────────────────────────────────────
  const handleSend = async () => {
    if (messageInput.trim() || attachedFiles.length > 0) {
      const attachments = await Promise.all(
        attachedFiles.map((file) => new Promise<{ name: string; size: number; url: string; type: string }>((resolve) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve({ name: file.name, size: file.size, url: reader.result as string, type: file.type })
          reader.readAsDataURL(file)
        }))
      )
      onSendMessage(messageInput.trim(), attachments.length > 0 ? attachments : undefined)
      setMessageInput(''); setAttachedFiles([])
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => { const files = Array.from(e.target.files || []); setAttachedFiles((prev) => [...prev, ...files]); if (fileInputRef.current) fileInputRef.current.value = '' }
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDraggingOver(true) }
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDraggingOver(false) }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDraggingOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) { setAttachedFiles(prev => [...prev, ...files]); return }
    const text = e.dataTransfer.getData('text/plain')
    if (text) setMessageInput(prev => prev + text)
  }
  useEffect(() => {
    const preventBrowserDrop = (e: DragEvent) => e.preventDefault()
    window.addEventListener('dragover', preventBrowserDrop)
    window.addEventListener('drop', preventBrowserDrop)
    const onPaste = (e: ClipboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase()
      if (tag === 'input' && document.activeElement !== textInputRef.current) return
      if (tag === 'textarea' && document.activeElement !== textInputRef.current) return
      const items = Array.from(e.clipboardData?.items || [])
      const fileItems = items.filter(i => i.kind === 'file')
      if (fileItems.length === 0) return
      e.preventDefault()
      const files = fileItems.map(i => i.getAsFile()).filter(Boolean) as File[]
      if (files.length > 0) { setAttachedFiles(prev => [...prev, ...files]); setTimeout(() => textInputRef.current?.focus(), 50) }
    }
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('dragover', preventBrowserDrop)
      window.removeEventListener('drop', preventBrowserDrop)
      window.removeEventListener('paste', onPaste)
    }
  }, [])
  const removeAttachedFile = (index: number) => { setAttachedFiles((prev) => prev.filter((_, i) => i !== index)) }
  const formatFileSize = (bytes: number) => { if (bytes < 1024) return bytes + ' B'; if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'; return (bytes / (1024 * 1024)).toFixed(1) + ' MB' }
  const formatDuration = (seconds: number) => { const mins = Math.floor(seconds / 60); const secs = seconds % 60; return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}` }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = mediaRecorder; audioChunksRef.current = []
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mediaRecorder.onstop = () => { stream.getTracks().forEach((track) => track.stop()) }
      mediaRecorder.start(); setIsRecording(true); setRecordingDuration(0)
      recordingIntervalRef.current = setInterval(() => { setRecordingDuration((prev) => prev + 1) }, 1000)
    } catch (err) { console.error('Failed to start recording:', err) }
  }

  // ── stopRecording: base64 بدل blob URL ────────────────────────────────────
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      const duration = recordingDuration
      mediaRecorderRef.current.stop()
      if (recordingIntervalRef.current) { clearInterval(recordingIntervalRef.current); recordingIntervalRef.current = null }
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const reader = new FileReader()
        reader.onloadend = () => { onSendMessage('', undefined, { url: reader.result as string, duration }) }
        reader.readAsDataURL(audioBlob)
        setIsRecording(false); setRecordingDuration(0); audioChunksRef.current = []
      }
    }
  }

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      if (recordingIntervalRef.current) { clearInterval(recordingIntervalRef.current); recordingIntervalRef.current = null }
      setIsRecording(false); setRecordingDuration(0); audioChunksRef.current = []
    }
  }

  const handleContainerClick = (e: React.MouseEvent) => { if ((e.target as HTMLElement).closest('button')) return; textInputRef.current?.focus() }
  const handleEmojiSelect = (emoji: string) => { setMessageInput((prev) => prev + emoji); setShowEmojiPicker(false); textInputRef.current?.focus() }
  const handleGifSelect = (url: string) => { onSendMessage('', [{ name: 'gif', size: 0, url, type: 'image/gif' }]); setShowGifStickerPicker(false) }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setMessageInput(value)

    const atIndex = value.lastIndexOf('@')
    if (atIndex !== -1 && (atIndex === 0 || value[atIndex - 1] === ' ')) {
      const query = value.slice(atIndex + 1)
      setMentionQuery(query)
      setMentionStart(atIndex)
      setShowMentionDropdown(true)
    } else {
      setShowMentionDropdown(false)
      setMentionQuery('')
      setMentionStart(-1)
    }
  }

  const handleStickerSelect = (url: string, pack?: StickerPack) => {
    const name = pack ? `sticker::${btoa(unescape(encodeURIComponent(JSON.stringify({ id: pack.id, name: pack.name, stickers: pack.stickers }))))}` : 'sticker'
    onSendMessage('', [{ name, size: 0, url, type: 'image/png' }]); setShowGifStickerPicker(false)
  }

  const handleSendPack = (pack: StickerPack) => {
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(pack))))
    onSendMessage('', [{ name: `pack-share::${encoded}`, size: 0, url: pack.stickers[0]?.url || '', type: 'application/pack-share' }]); setShowGifStickerPicker(false)
  }

  const handleSendEmojiPack = (pack: CustomEmojiPack) => {
    const encoded = encodeEmojiPack(pack)
    onSendMessage('', [{ name: `emoji-pack::${encoded}`, size: 0, url: pack.emojis[0]?.url || '', type: 'application/emoji-pack-share' }]); setShowEmojiPicker(false)
  }

  const contextId = isDM && channel ? (channel.id === 'dm' ? '' : channel.id) : channel?.id || ''

  const handlePinMessage = async (messageId: string) => {
    if (contextId) { await db.pinMessage(contextId, messageId, currentUser.id); setPinnedRefresh((p) => p + 1) }
  }

  const handleUnpinMessage = async (messageId: string) => {
    if (contextId) { await db.unpinMessage(contextId, messageId); setPinnedRefresh((p) => p + 1) }
  }

  if (!channel) {
    return <div className="flex-1 flex items-center justify-center bg-[#1e1e2e]"><WumpusEmptyState type="no-channel" /></div>
  }

  const statusColors: Record<string, string> = { online: '#a6e3a1', idle: '#f9e2af', dnd: '#f38ba8', offline: '#6c7086' }
  const statusLabels: Record<string, string> = { online: t('chat.online'), idle: t('chat.idle'), dnd: t('chat.dnd'), offline: t('chat.offline') }

  return (
    <div
    className={`flex-1 flex flex-col bg-[#1e1e2e] min-h-0 overflow-hidden relative ${isDraggingOver ? 'ring-2 ring-inset ring-[#cba6f7]' : ''}`}
    onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
  >
    {isDraggingOver && (
      <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none bg-[#1e1e2e]/60 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3 text-[#cba6f7] bg-[#181825] border-2 border-dashed border-[#cba6f7] px-10 py-8 rounded-2xl">
          <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
          <p className="text-lg font-bold">Drop to upload</p>
          <p className="text-sm text-[#a6adc8]">Images, videos, files...</p>
        </div>
      </div>
    )}
      <div className="h-12 px-4 flex items-center justify-between border-b border-[#11111b] shadow-sm">
        <div className="flex items-center gap-2 min-w-0">
          {onOpenMobileMenu && (
            <button onClick={onOpenMobileMenu} className="md:hidden text-[#bac2de] hover:text-[#cdd6f4] mr-2 flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" /></svg>
            </button>
          )}
          {isDM ? (
            <>
              <AtSignIcon className="w-5 h-5 text-[#a6adc8] flex-shrink-0" />
              <span className="font-semibold text-[#cdd6f4] truncate">{channel.name}</span>
              {dmUserStatus && (
                <div className="flex items-center gap-1.5 ml-1">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: statusColors[dmUserStatus.status] || statusColors.offline }} />
                  <span className="text-xs text-[#6c7086]">{statusLabels[dmUserStatus.status] || 'Offline'}</span>
                </div>
              )}
            </>
          ) : (
            <>
              <HashIcon className="w-5 h-5 text-[#a6adc8] flex-shrink-0" />
              <span className="font-semibold text-[#cdd6f4] truncate">{channel.name}</span>
              {channel.description && (
                <><div className="w-px h-6 bg-[#45475a] mx-2 flex-shrink-0 hidden sm:block" /><span className="text-sm text-[#a6adc8] truncate max-w-md hidden sm:block">{channel.description}</span></>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          {isDM && !isBlockedState && (
            <>
              <button className="text-[#bac2de] hover:text-[#cdd6f4] transition-colors" title={t('chat.startVoiceCall')} onClick={() => onStartCall?.(false)}><PhoneIcon className="w-5 h-5" /></button>
              <button className="text-[#bac2de] hover:text-[#cdd6f4] transition-colors" title={t('chat.startVideoCall')} onClick={() => onStartCall?.(true)}><VideoIcon className="w-5 h-5" /></button>
            </>
          )}
          {isDM && (
            <div className="relative">
              <button onClick={() => { setShowPinnedMessages(!showPinnedMessages); setShowSearchPanel(false); setShowInboxPanel(false) }} className={`transition-colors ${showPinnedMessages ? 'text-[#cdd6f4]' : 'text-[#bac2de] hover:text-[#cdd6f4]'}`}><PinIcon className="w-5 h-5" /></button>
              {showPinnedMessages && contextId && <div className="absolute top-full right-0 mt-2 z-50"><PinnedMessages contextId={contextId} messages={messages} currentUser={currentUser} onClose={() => setShowPinnedMessages(false)} onUnpin={handleUnpinMessage} canPin={canPin} /></div>}
            </div>
          )}
          {!isDM && (
            <>
              <button className="text-[#bac2de] hover:text-[#cdd6f4] transition-colors"><HashIcon className="w-5 h-5" /></button>
              <button className="text-[#bac2de] hover:text-[#cdd6f4] transition-colors"><BellIcon className="w-5 h-5" /></button>
              <div className="relative">
                <button onClick={() => { setShowPinnedMessages(!showPinnedMessages); setShowSearchPanel(false); setShowInboxPanel(false) }} className={`transition-colors ${showPinnedMessages ? 'text-[#cdd6f4]' : 'text-[#bac2de] hover:text-[#cdd6f4]'}`}><PinIcon className="w-5 h-5" /></button>
                {showPinnedMessages && contextId && <div className="absolute top-full right-0 mt-2 z-50"><PinnedMessages contextId={contextId} messages={messages} currentUser={currentUser} onClose={() => setShowPinnedMessages(false)} onUnpin={handleUnpinMessage} canPin={canPin} /></div>}
              </div>
              <button onClick={onToggleMemberList} className={`transition-colors ${showMemberList ? 'text-[#cdd6f4]' : 'text-[#bac2de] hover:text-[#cdd6f4]'}`}><UsersIcon className="w-5 h-5" /></button>
            </>
          )}
          <div className="relative">
            <button onClick={() => { setShowSearchPanel(!showSearchPanel); setShowPinnedMessages(false); setShowInboxPanel(false) }} className={`transition-colors ${showSearchPanel ? 'text-[#cdd6f4]' : 'text-[#bac2de] hover:text-[#cdd6f4]'}`}><SearchIcon className="w-5 h-5" /></button>
            {showSearchPanel && <div className="absolute top-full right-0 mt-2 z-50"><SearchPanel messages={messages} members={serverMembers} onClose={() => setShowSearchPanel(false)} onMemberClick={onMemberClick} channelName={channel.name} isDM={isDM} /></div>}
          </div>
          <div className="relative">
            <button onClick={() => { setShowInboxPanel(!showInboxPanel); setShowPinnedMessages(false); setShowSearchPanel(false) }} className={`relative transition-colors ${showInboxPanel ? 'text-[#cdd6f4]' : 'text-[#bac2de] hover:text-[#cdd6f4]'}`}>
              <InboxIcon className="w-5 h-5" />
              {pendingRequestCount > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-[#f38ba8] text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">{pendingRequestCount > 99 ? '99+' : pendingRequestCount}</span>}
            </button>
            {showInboxPanel && <div className="absolute top-full right-0 mt-2 z-50"><InboxPanel currentUser={currentUser} onClose={() => setShowInboxPanel(false)} /></div>}
          </div>
        </div>
      </div>

      <div ref={messagesContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 relative min-h-0" style={{ fontSize: 'var(--chat-font-size, 16px)' }}>
        <AnimatePresence>
          {showScrollTop && (
            <motion.button key="scroll-top" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }} onClick={scrollToTop} className="sticky top-2 float-right mr-0 z-20 w-8 h-8 rounded-full bg-[#313244] hover:bg-[#45475a] border border-[#45475a] text-[#bac2de] hover:text-[#cdd6f4] flex items-center justify-center shadow-lg transition-colors" title="Scroll to top">
              <ChevronUpIcon className="w-4 h-4" />
            </motion.button>
          )}
        </AnimatePresence>

        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 bg-[#cba6f7] rounded-full flex items-center justify-center mb-4">
              {isDM ? <AtSignIcon className="w-8 h-8 text-white" /> : <HashIcon className="w-8 h-8 text-white" />}
            </div>
            <h2 className="text-2xl font-bold text-[#cdd6f4] mb-2">{isDM ? `${t('chat.welcomeDM')}${channel.name}.` : `${t('chat.welcomeChannel')}${channel.name}!`}</h2>
            <p className="text-[#a6adc8]">{isDM ? `${t('chat.sayHello')}${channel.name}!` : `${t('chat.startOfChannel')}${channel.name}${t('chat.channel')}`}</p>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id} message={message} isOwnMessage={message.author.id === currentUser.id}
              onAuthorClick={onMemberClick} onEdit={onEditMessage} onDelete={onDeleteMessage}
              serverId={serverId} onPin={handlePinMessage} onUnpin={handleUnpinMessage}
              isPinned={pinnedMessageIds.has(message.id)}
              canPin={canPin} currentUserId={currentUser.id}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <AnimatePresence>
        {unreadCount > 0 && (
          <motion.button key="new-messages" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.2 }} onClick={scrollToBottom} className="absolute bottom-[140px] right-6 z-30 flex items-center gap-1.5 bg-[#cba6f7] hover:bg-[#b4befe] text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg shadow-[#cba6f7]/30 transition-colors">
            <ArrowDownIcon className="w-3.5 h-3.5" />
            {unreadCount} new {unreadCount === 1 ? 'message' : 'messages'}
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {attachedFiles.length > 0 && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-4 bg-[#181825] border-t border-[#11111b]">
            <div className="py-2 flex flex-wrap gap-2">
              {attachedFiles.map((file, index) => (
                <div key={index} className="flex items-center gap-2 bg-[#1e1e2e] rounded px-3 py-2 text-sm">
                  <FileIcon className="w-4 h-4 text-[#bac2de]" />
                  <span className="text-[#cdd6f4] max-w-32 truncate">{file.name}</span>
                  <span className="text-[#6c7086]">({formatFileSize(file.size)})</span>
                  <button onClick={() => removeAttachedFile(index)} className="text-[#bac2de] hover:text-red-400 transition-colors"><XIcon className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-4 pb-6 relative">
        {showEmojiPicker && <div className="absolute bottom-full right-4 mb-2 z-50"><EmojiPicker onEmojiSelect={handleEmojiSelect} onClose={() => setShowEmojiPicker(false)} currentUserId={currentUser.id} onSendPack={handleSendEmojiPack} /></div>}
        {showGifStickerPicker && <div className="absolute bottom-full right-4 mb-2 z-50"><GifStickerPicker currentUserId={currentUser.id} onSelectGif={handleGifSelect} onSelectSticker={handleStickerSelect} onSendPack={handleSendPack} onClose={() => setShowGifStickerPicker(false)} /></div>}
        {showMentionDropdown && (
          <div className="absolute bottom-full left-4 mb-2 z-50 bg-[#181825] border border-[#11111b] rounded-lg shadow-lg max-h-48 overflow-y-auto w-64">
            {members.filter(m => m.username.toLowerCase().includes(mentionQuery.toLowerCase()) || m.displayName?.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 10).map(member => (
              <button key={member.id} onClick={() => {
                const before = messageInput.slice(0, mentionStart)
                const after = messageInput.slice(mentionStart + mentionQuery.length + 1)
                setMessageInput(`${before}@${member.username}${after}`)
                setShowMentionDropdown(false)
                textInputRef.current?.focus()
              }} className="w-full px-3 py-2 text-left hover:bg-[#292b3d] flex items-center gap-2">
                <UserAvatar user={member} size="sm" />
                <span className="text-[#cdd6f4] text-sm">{member.displayName || member.username}</span>
              </button>
            ))}
          </div>
        )}

        {isBlockedState ? (
          <div className="bg-[#313244] rounded-lg px-4 py-3 flex items-center justify-center">
            <span className="text-[#f38ba8] text-sm font-medium">
              {blockedByMe ? 'You have blocked this user.' : blockedByThem ? 'This user has blocked you.' : privacyBlocked ? 'This user has restricted who can send them messages.' : 'You cannot message this user.'}
            </span>
          </div>
        ) : (
          <div className="bg-[#313244] rounded-lg cursor-text" onClick={handleContainerClick}>
            {isRecording ? (
              <div className="flex items-center gap-4 px-4 py-3">
                <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="w-3 h-3 bg-red-500 rounded-full" />
                <span className="text-red-400 font-medium">{t('chat.recording')}</span>
                <span className="text-[#cdd6f4] font-mono">{formatDuration(recordingDuration)}</span>
                <div className="flex-1" />
                <button onClick={cancelRecording} className="text-[#bac2de] hover:text-red-400 transition-colors p-2" title="Cancel"><XIcon className="w-5 h-5" /></button>
                <button onClick={stopRecording} className="bg-red-500 hover:bg-red-600 text-white rounded-full p-2 transition-colors" title="Stop and Send"><SquareIcon className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-4">
                <button onClick={() => fileInputRef.current?.click()} className="text-[#bac2de] hover:text-[#cdd6f4] transition-colors p-2" title={t('chat.attachFiles')}><PaperclipIcon className="w-5 h-5" /></button>
                <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} className="hidden" />
                <input ref={textInputRef} type="text" value={messageInput} onChange={handleInputChange} onKeyPress={handleKeyPress}
                  placeholder={`${t('chat.messagePlaceholder')} ${isDM ? '@' + channel.name : '#' + channel.name}`}
                  className="flex-1 bg-transparent text-[#cdd6f4] placeholder-[#6c7086] py-3 focus:outline-none" />
                <div className="flex items-center gap-1">
                  <button onClick={() => { setShowGifStickerPicker(!showGifStickerPicker); setShowEmojiPicker(false) }} className={`transition-colors p-2 ${showGifStickerPicker ? 'text-[#cba6f7]' : 'text-[#bac2de] hover:text-[#cdd6f4]'}`} title="GIF & Stickers"><StickerIcon className="w-5 h-5" /></button>
                  <button onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowGifStickerPicker(false) }} className={`transition-colors p-2 ${showEmojiPicker ? 'text-[#cba6f7]' : 'text-[#bac2de] hover:text-[#cdd6f4]'}`} title={t('chat.emoji')}><SmileIcon className="w-5 h-5" /></button>
                  <button onClick={startRecording} className="text-[#bac2de] hover:text-[#cdd6f4] transition-colors p-2" title={t('chat.recordVoice')}><MicIcon className="w-5 h-5" /></button>
                  {(messageInput.trim() || attachedFiles.length > 0) && <button onClick={handleSend} className="text-[#cba6f7] hover:text-[#b4befe] transition-colors p-2"><SendIcon className="w-5 h-5" /></button>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
