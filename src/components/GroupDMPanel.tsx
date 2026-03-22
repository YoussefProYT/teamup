
import React, { useEffect, useRef, useState } from 'react'
import { X, Crown, UserPlus, UserMinus, LogOut, Pencil, Camera, Check, Phone, Video } from 'lucide-react'
import { UserAvatar } from './UserAvatar'
import { db, syncChannel, StoredUser, GroupDM } from '../lib/database'
import type { Member, Message, Server } from '../App'

const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
const CLOUDINARY_UPLOAD_PRESET = 'teamup_uploads'

async function uploadToCloudinary(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET)
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, { method: 'POST', body: formData })
  if (!res.ok) throw new Error('Upload failed')
  return (await res.json()).secure_url
}

const MAX_GROUP_MEMBERS = 20

interface GroupDMPanelProps {
  groupDM: GroupDM | null | undefined
  groupDMs: GroupDM[]
  selectedGroupDMId: string
  currentUser: Member
  currentUserId: string
  presenceMap: Record<string, string>
  dmUsersCache: Record<string, Member>
  servers: Server[]
  messages: Message[]
  mobilePanel: 'servers' | 'channels' | 'chat'
  onSendGroupMessage: (contextId: string, content: string, attachments?: any[], voiceMessage?: any) => void
  onEditMessage: (messageId: string, newContent: string) => void
  onDeleteMessage: (messageId: string) => void
  onMemberClick: (member: Member, e: React.MouseEvent) => void
  onOpenMobileMenu: () => void
  onClose: () => void
  onGroupDMsUpdated: () => Promise<void>
  // ✅ voice call props
  onStartGroupCall?: (memberIds: string[], withVideo?: boolean) => void
  connectedVoice?: any
  voiceStates?: any[]
  isMuted?: boolean
  isDeafened?: boolean
  onToggleMute?: () => void
  onToggleDeafen?: () => void
  onLeaveVoice?: () => void
  onToggleScreenShare?: () => void
  onToggleCamera?: () => void
  isScreenSharing?: boolean
  isCameraOn?: boolean
  localCameraStream?: MediaStream | null
  localScreenStream?: MediaStream | null
  remoteStreams?: any[]
  mutedUserIds?: Set<string>
}

const statusColors: Record<string, string> = {
  online: '#a6e3a1', idle: '#f9e2af', dnd: '#f38ba8', offline: '#6c7086',
}

export function GroupDMPanel({
  groupDM, selectedGroupDMId, currentUser, currentUserId, presenceMap,
  dmUsersCache, servers, messages, mobilePanel,
  onSendGroupMessage, onEditMessage, onDeleteMessage, onMemberClick,
  onOpenMobileMenu, onClose, onGroupDMsUpdated,
  onStartGroupCall, connectedVoice, voiceStates = [],
  isMuted = false, isDeafened = false,
  onToggleMute, onToggleDeafen, onLeaveVoice,
  onToggleScreenShare, onToggleCamera,
  isScreenSharing = false, isCameraOn = false,
  localCameraStream, localScreenStream,
  remoteStreams = [], mutedUserIds = new Set(),
}: GroupDMPanelProps) {
  const [members, setMembers] = useState<Member[]>([])
  const [contextMenu, setContextMenu] = useState<{ userId: string; x: number; y: number } | null>(null)
  const [addSearchQuery, setAddSearchQuery] = useState('')
  const [addSearchResults, setAddSearchResults] = useState<StoredUser[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [isUploadingIcon, setIsUploadingIcon] = useState(false)
  const iconInputRef = useRef<HTMLInputElement>(null)

  const isOwner = groupDM?.createdBy === currentUserId
  const contextId = db.getGroupDMChannelId(selectedGroupDMId)
  const isInGroupCall = connectedVoice?.channelId === `group-${selectedGroupDMId}`

  useEffect(() => {
    if (!groupDM) return
    const loadMembers = async () => {
      const loaded: Member[] = []
      for (const id of groupDM.memberIds) {
        const cached = dmUsersCache[id] || servers.flatMap(s => s.members).find(m => m.id === id)
        if (cached) { loaded.push(cached as Member); continue }
        const u = await db.getUser(id)
        if (u) loaded.push({
          id: u.id, username: u.username, discriminator: u.discriminator,
          displayName: u.displayName, avatar: u.avatar, avatarColor: u.avatarColor,
          status: u.status, roles: [], joinedAt: u.joinedAt instanceof Date ? u.joinedAt : new Date(u.joinedAt),
          email: u.email ?? '',
        })
      }
      setMembers(loaded)
    }
    loadMembers()
  }, [groupDM?.memberIds?.join(','), dmUsersCache])

  useEffect(() => {
    if (addSearchQuery.trim().length < 1) { setAddSearchResults([]); return }
    setIsSearching(true)
    db.searchUsers(addSearchQuery, groupDM?.memberIds || [currentUserId])
      .then(r => { setAddSearchResults(r); setIsSearching(false) })
      .catch(() => setIsSearching(false))
  }, [addSearchQuery])

  useEffect(() => {
    const handler = () => setContextMenu(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  const handleSaveName = async () => {
    if (!groupDM || !nameInput.trim()) return
    await db.saveGroupDM({ ...groupDM, name: nameInput.trim() })
    syncChannel.postMessage({ type: 'group_dms_updated' })
    await onGroupDMsUpdated()
    setEditingName(false)
  }

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !groupDM) return
    setIsUploadingIcon(true)
    try {
      const url = await uploadToCloudinary(file)
      await db.saveGroupDM({ ...groupDM, icon: url } as any)
      syncChannel.postMessage({ type: 'group_dms_updated' })
      await onGroupDMsUpdated()
    } catch { alert('Failed to upload image') }
    finally { setIsUploadingIcon(false) }
  }

  const handleKickMember = async (userId: string) => {
    if (!groupDM || !isOwner) return
    await db.saveGroupDM({ ...groupDM, memberIds: groupDM.memberIds.filter(id => id !== userId) })
    syncChannel.postMessage({ type: 'group_dms_updated' })
    await onGroupDMsUpdated()
    setContextMenu(null)
  }

  const handleLeaveGroup = async () => {
    if (!groupDM) return
    const newIds = groupDM.memberIds.filter(id => id !== currentUserId)
    if (newIds.length === 0) {
      await db.deleteGroupDM(groupDM.id)
    } else if (groupDM.createdBy === currentUserId) {
      await db.saveGroupDM({ ...groupDM, memberIds: newIds, createdBy: newIds[0] })
    } else {
      await db.saveGroupDM({ ...groupDM, memberIds: newIds })
    }
    syncChannel.postMessage({ type: 'group_dms_updated' })
    await onGroupDMsUpdated()
    onClose()
  }

  const handleAddMember = async (user: StoredUser) => {
    if (!groupDM) return
    if (groupDM.memberIds.length >= MAX_GROUP_MEMBERS) { alert(`Group is full (max ${MAX_GROUP_MEMBERS})`); return }
    if (groupDM.memberIds.includes(user.id)) return
    await db.saveGroupDM({ ...groupDM, memberIds: [...groupDM.memberIds, user.id] })
    syncChannel.postMessage({ type: 'group_dms_updated' })
    await onGroupDMsUpdated()
    setAddSearchQuery(''); setAddSearchResults([]); setShowAddModal(false)
  }

  if (!groupDM) return null

  const groupIcon = (groupDM as any).icon
  const displayName = groupDM.name || members.map(m => m.displayName || m.username).join(', ')
  const otherMemberIds = groupDM.memberIds.filter(id => id !== currentUserId)

  return (
    <div className={`${mobilePanel === 'chat' ? 'flex' : 'hidden'} md:flex flex-1 min-w-0 min-h-0`}>

      {/* ── Chat + optional voice panel ─────────────────────────────────── */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">

        {/* ✅ Voice call panel لو في group call */}
        {isInGroupCall && connectedVoice && (
          <div className="h-[260px] flex-shrink-0 border-b border-[#11111b]">
            <GroupVoicePanel
              connectedVoice={connectedVoice}
              members={members}
              currentUser={currentUser}
              voiceStates={voiceStates}
              isMuted={isMuted}
              isDeafened={isDeafened}
              onToggleMute={onToggleMute}
              onToggleDeafen={onToggleDeafen}
              onLeaveVoice={onLeaveVoice}
              onToggleScreenShare={onToggleScreenShare}
              onToggleCamera={onToggleCamera}
              isScreenSharing={isScreenSharing}
              isCameraOn={isCameraOn}
            />
          </div>
        )}

        <GroupChatWrapper
          contextId={contextId}
          messages={messages}
          currentUser={currentUser}
          onSendMessage={(content, attachments) => onSendGroupMessage(contextId, content, attachments)}
          onEditMessage={onEditMessage}
          onDeleteMessage={onDeleteMessage}
          onMemberClick={onMemberClick}
          presenceMap={presenceMap}
          displayName={displayName}
          onOpenMobileMenu={onOpenMobileMenu}
          // ✅ voice call buttons في الـ header
          onStartCall={() => onStartGroupCall?.(otherMemberIds, false)}
          onStartVideoCall={() => onStartGroupCall?.(otherMemberIds, true)}
        />
      </div>

      {/* ── Members sidebar ─────────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-64 flex-col bg-[#181825] border-l border-[#11111b] flex-shrink-0">

        {/* Group icon + name */}
        <div className="flex items-center gap-3 px-3 pt-3 pb-3 border-b border-[#11111b]">
          <div className="relative group cursor-pointer flex-shrink-0" onClick={() => iconInputRef.current?.click()}>
            <div className="w-10 h-10 rounded-full overflow-hidden bg-[#cba6f7] flex items-center justify-center text-white text-sm font-bold">
              {groupIcon ? <img src={groupIcon} alt="" className="w-full h-full object-cover" /> : displayName.substring(0, 2).toUpperCase()}
            </div>
            <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              {isUploadingIcon ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Camera className="w-3 h-3 text-white" />}
            </div>
            <input ref={iconInputRef} type="file" accept="image/*" className="hidden" onChange={handleIconUpload} />
          </div>
          <div className="min-w-0 flex-1">
            {editingName ? (
              <div className="flex items-center gap-1">
                <input type="text" value={nameInput} onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false) }}
                  autoFocus className="flex-1 min-w-0 bg-[#11111b] text-[#cdd6f4] text-sm px-2 py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-[#cba6f7]" />
                <button onClick={handleSaveName} className="text-[#a6e3a1] p-0.5 flex-shrink-0"><Check className="w-3.5 h-3.5" /></button>
                <button onClick={() => setEditingName(false)} className="text-[#6c7086] p-0.5 flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <div className="flex items-center gap-1 group/name cursor-pointer" onClick={() => { setNameInput(groupDM.name || ''); setEditingName(true) }}>
                <p className="text-sm font-semibold text-[#cdd6f4] truncate">{displayName}</p>
                <Pencil className="w-3 h-3 text-[#6c7086] opacity-0 group-hover/name:opacity-100 transition-opacity flex-shrink-0" />
              </div>
            )}
            <p className="text-xs text-[#6c7086] mt-0.5">{members.length}/{MAX_GROUP_MEMBERS} members</p>
          </div>
          <button onClick={onClose} className="text-[#6c7086] hover:text-[#cdd6f4] p-1 rounded flex-shrink-0"><X className="w-4 h-4" /></button>
        </div>

        {/* ✅ Voice call buttons */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#11111b]">
          {!isInGroupCall && (
            <>
              <button onClick={() => onStartGroupCall?.(otherMemberIds, false)}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded bg-[#313244] hover:bg-[#a6e3a1]/20 text-[#bac2de] hover:text-[#a6e3a1] text-xs font-medium transition-colors" title="Voice Call">
                <Phone className="w-3.5 h-3.5" /> Voice
              </button>
              <button onClick={() => onStartGroupCall?.(otherMemberIds, true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded bg-[#313244] hover:bg-[#cba6f7]/20 text-[#bac2de] hover:text-[#cba6f7] text-xs font-medium transition-colors" title="Video Call">
                <Video className="w-3.5 h-3.5" /> Video
              </button>
            </>
          )}
          {isInGroupCall && (
            <button onClick={onLeaveVoice}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded bg-[#f38ba8]/20 text-[#f38ba8] text-xs font-medium transition-colors">
              <Phone className="w-3.5 h-3.5" /> Leave Call
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#11111b]">
          {members.length < MAX_GROUP_MEMBERS && (
            <button onClick={() => setShowAddModal(true)}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded bg-[#313244] hover:bg-[#45475a] text-[#bac2de] hover:text-[#cdd6f4] text-xs font-medium transition-colors">
              <UserPlus className="w-3.5 h-3.5" /> Add
            </button>
          )}
          <button onClick={handleLeaveGroup}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded bg-[#f38ba8]/10 hover:bg-[#f38ba8]/20 text-[#f38ba8] text-xs font-medium transition-colors">
            <LogOut className="w-3.5 h-3.5" /> Leave
          </button>
        </div>

        {/* Members list */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5 custom-scrollbar">
          {members.map(member => {
            const liveStatus = (presenceMap[member.id] as any) || member.status
            const isOwnerMember = member.id === groupDM.createdBy
            const isSelf = member.id === currentUserId
            const isInCall = voiceStates.some(vs => vs.userId === member.id && vs.channelId === `group-${selectedGroupDMId}`)
            return (
              <div key={member.id}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-[#313244] transition-colors group relative cursor-pointer"
                onClick={(e) => { e.stopPropagation(); onMemberClick(member, e) }}
                onContextMenu={(e) => { e.preventDefault(); if (isOwner && !isSelf) setContextMenu({ userId: member.id, x: e.clientX, y: e.clientY }) }}>
                <UserAvatar user={{ ...member, status: liveStatus }} size="sm" showStatus />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <p className="text-sm text-[#cdd6f4] truncate font-medium">{member.displayName || member.username}</p>
                    {isOwnerMember && <Crown className="w-3 h-3 text-[#f9e2af] flex-shrink-0" fill="currentColor" />}
                    {isSelf && <span className="text-[9px] text-[#6c7086] flex-shrink-0">(you)</span>}
                  </div>
                  {isInCall
                    ? <p className="text-[10px] text-[#a6e3a1]">● In call</p>
                    : <p className="text-[10px] capitalize" style={{ color: statusColors[liveStatus] || statusColors.offline }}>{liveStatus}</p>
                  }
                </div>
                {isOwner && !isSelf && (
                  <button onClick={(e) => { e.stopPropagation(); handleKickMember(member.id) }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-[#6c7086] hover:text-[#f38ba8] hover:bg-[#f38ba8]/10 transition-all flex-shrink-0">
                    <UserMinus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Add member modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-[#1e1e2e] rounded-xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-4 pt-4 pb-3 border-b border-[#313244] flex items-center justify-between">
              <h3 className="text-[#cdd6f4] font-semibold">Add to Group</h3>
              <button onClick={() => setShowAddModal(false)} className="text-[#6c7086] hover:text-[#cdd6f4]"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-3">
              <input type="text" value={addSearchQuery} onChange={e => setAddSearchQuery(e.target.value)}
                placeholder="Search users..." autoFocus
                className="w-full bg-[#11111b] text-[#cdd6f4] text-sm px-3 py-2 rounded focus:outline-none focus:ring-1 focus:ring-[#cba6f7] placeholder-[#585b70]" />
              <div className="mt-2 max-h-48 overflow-y-auto space-y-0.5">
                {isSearching ? (
                  <p className="text-center text-[#6c7086] text-sm py-3">Searching...</p>
                ) : addSearchResults.length === 0 && addSearchQuery.trim().length > 0 ? (
                  <p className="text-center text-[#6c7086] text-sm py-3">No users found</p>
                ) : addSearchResults.map(user => (
                  <div key={user.id} onClick={() => handleAddMember(user)}
                    className="flex items-center gap-3 px-3 py-2 rounded hover:bg-[#313244] cursor-pointer transition-colors">
                    <UserAvatar user={user} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-[#cdd6f4] font-medium truncate">{user.displayName || user.username}</p>
                      <p className="text-xs text-[#6c7086]">{user.username}#{user.discriminator}</p>
                    </div>
                    <UserPlus className="w-4 h-4 text-[#6c7086] flex-shrink-0" />
                  </div>
                ))}
              </div>
            </div>
            <p className="px-4 pb-3 text-xs text-[#6c7086] text-center">{members.length}/{MAX_GROUP_MEMBERS} members</p>
          </div>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div className="fixed z-50 bg-[#11111b] rounded-lg shadow-xl border border-[#313244] py-1 w-44"
          style={{ top: contextMenu.y, left: contextMenu.x }} onClick={e => e.stopPropagation()}>
          <button onClick={() => handleKickMember(contextMenu.userId)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#f38ba8] hover:bg-[#f38ba8]/10 transition-colors">
            <UserMinus className="w-4 h-4" /> Kick from Group
          </button>
        </div>
      )}
    </div>
  )
}

// ✅ Group Voice Panel - بيظهر فوق الـ chat لما في call
function GroupVoicePanel({ connectedVoice, members, currentUser, voiceStates, isMuted, isDeafened, onToggleMute, onToggleDeafen, onLeaveVoice, onToggleScreenShare, onToggleCamera, isScreenSharing, isCameraOn }: any) {
  const {
    MicIcon, MicOffIcon, HeadphonesIcon, VideoIcon, VideoOffIcon, MonitorIcon, MonitorOffIcon, PhoneOffIcon
  } = require('lucide-react')

  const inCallUsers = members.filter((m: Member) =>
    voiceStates.some((vs: any) => vs.userId === m.id && vs.channelId === connectedVoice.channelId)
  )
  const allInCall = [currentUser, ...inCallUsers.filter((m: Member) => m.id !== currentUser.id)]

  return (
    <div className="h-full bg-[#181825] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#11111b]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#a6e3a1] animate-pulse" />
          <span className="text-xs font-bold text-[#a6e3a1]">Voice Call · {allInCall.length} connected</span>
        </div>
        <button onClick={onLeaveVoice} className="p-1 text-[#6c7086] hover:text-[#f38ba8] transition-colors"><PhoneOffIcon size={14} /></button>
      </div>

      {/* Avatars */}
      <div className="flex-1 flex items-center justify-center gap-8 px-4">
        {allInCall.map((member: Member) => (
          <div key={member.id} className="flex flex-col items-center gap-2">
            <div className="relative">
              <UserAvatar user={member} size="xl" className="w-16 h-16" />
              {member.id === currentUser.id && isMuted && (
                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-[#f38ba8] rounded-full flex items-center justify-center">
                  <MicOffIcon size={10} className="text-white" />
                </div>
              )}
            </div>
            <p className="text-xs text-[#cdd6f4] font-medium truncate max-w-[80px]">{member.displayName || member.username}</p>
            <p className="text-[10px] text-[#6c7086]">{member.id === currentUser.id ? 'You' : 'Connected'}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 pb-3">
        {[
          { onClick: onToggleMute, active: isMuted, color: '#f38ba8', Icon: isMuted ? MicOffIcon : MicIcon, title: isMuted ? 'Unmute' : 'Mute' },
          { onClick: onToggleDeafen, active: isDeafened, color: '#f38ba8', Icon: HeadphonesIcon, title: isDeafened ? 'Undeafen' : 'Deafen' },
          { onClick: onToggleCamera, active: isCameraOn, color: '#cba6f7', Icon: isCameraOn ? VideoOffIcon : VideoIcon, title: isCameraOn ? 'Stop Camera' : 'Camera' },
          { onClick: onToggleScreenShare, active: isScreenSharing, color: '#cba6f7', Icon: isScreenSharing ? MonitorOffIcon : MonitorIcon, title: isScreenSharing ? 'Stop Share' : 'Share Screen' },
        ].map(({ onClick, active, color, Icon, title }, i) => (
          <button key={i} onClick={onClick} title={title}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${active ? `text-white` : 'bg-[#313244] text-[#bac2de] hover:bg-[#45475a]'}`}
            style={active ? { backgroundColor: color } : {}}>
            <Icon size={16} />
          </button>
        ))}
        <button onClick={onLeaveVoice}
          className="w-10 h-10 rounded-full bg-[#f38ba8] hover:bg-[#f38ba8]/80 flex items-center justify-center transition-colors" title="Leave">
          <PhoneOffIcon size={16} className="text-white" />
        </button>
      </div>
    </div>
  )
}

// ── GroupChatWrapper ──────────────────────────────────────────────────────────
function GroupChatWrapper(props: {
  contextId: string; messages: Message[]; currentUser: Member
  onSendMessage: (content: string, attachments?: any[]) => void
  onEditMessage: (id: string, content: string) => void
  onDeleteMessage: (id: string) => void
  onMemberClick: (member: Member, e: React.MouseEvent) => void
  presenceMap: Record<string, string>; displayName: string; onOpenMobileMenu: () => void
  onStartCall?: () => void
  onStartVideoCall?: () => void
}) {
  const [ChatArea, setChatArea] = useState<any>(null)

  useEffect(() => {
    import('./ChatArea').then(m => setChatArea(() => m.ChatArea))
  }, [])

  if (!ChatArea) return null

  return (
    <ChatArea
      channel={{ id: props.contextId, name: props.displayName, type: 'text' }}
      messages={props.messages}
      onSendMessage={(content: string, attachments?: any[], voiceMessage?: any) =>
        props.onSendMessage(content, attachments)
      }
      onEditMessage={props.onEditMessage}
      onDeleteMessage={props.onDeleteMessage}
      currentUser={props.currentUser}
      onMemberClick={props.onMemberClick}
      showMemberList={false}
      onToggleMemberList={() => {}}
      isDM={true}
      presenceMap={props.presenceMap}
      onOpenMobileMenu={props.onOpenMobileMenu}
      contextId={props.contextId}
      onStartCall={props.onStartCall}
    />
  )
}
