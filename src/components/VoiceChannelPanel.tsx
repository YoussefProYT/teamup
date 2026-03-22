import React, { useEffect, useState, useRef } from 'react'
import {
  MicIcon, MicOffIcon, HeadphonesIcon, MonitorIcon, VideoIcon,
  VideoOffIcon, PhoneOffIcon, PhoneIcon, MonitorOffIcon, XIcon,
  SlidersHorizontalIcon, ChevronDownIcon, SettingsIcon,
} from 'lucide-react'
import { UserAvatar } from './UserAvatar'
import { db, syncChannel } from '../lib/database'
import type { VoiceState } from '../lib/database'
import type { Member, Channel } from '../App'
import type { RemoteStream } from '../lib/livekitVoiceManager'
import { useI18n } from '../lib/i18n'

interface VoiceChannelPanelProps {
  channel: Channel
  serverName: string
  currentUser: Member
  connectedUsers: Member[]
  isMuted: boolean
  isDeafened: boolean
  onToggleMute: () => void
  onToggleDeafen: () => void
  onDisconnect: () => void
  onMemberClick?: (member: Member, e: React.MouseEvent) => void
  onToggleScreenShare?: () => void
  onToggleCamera?: () => void
  onMuteUser?: (userId: string) => void
  onUnmuteUser?: (userId: string) => void
  isScreenSharing?: boolean
  isCameraOn?: boolean
  localCameraStream?: MediaStream | null
  localScreenStream?: MediaStream | null
  remoteStreams?: RemoteStream[]
  mutedUserIds?: Set<string>
  isDMCall?: boolean
  pendingUsers?: Member[]
  isIncomingCall?: boolean
  isObserving?: boolean
  onAcceptCall?: () => void
  onDeclineCall?: () => void
  onJoinCall?: () => void
  onOpenMobileMenu?: () => void
}

type StreamQuality = '360p' | '480p' | '720p' | '1080p' | '1440p'

function VideoTile({ stream, label, isMuted: tileMuted }: { stream: MediaStream; label: string; isMuted?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => { if (videoRef.current && stream) videoRef.current.srcObject = stream }, [stream])
  return (
    <div className="relative bg-[#11111b] rounded-2xl overflow-hidden aspect-video ring-1 ring-white/5">
      <video ref={videoRef} autoPlay playsInline muted={tileMuted} className="w-full h-full object-cover" />
      <div className="absolute bottom-3 left-3 bg-black/50 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-full font-medium">
        {label}
      </div>
    </div>
  )
}

// ── Circular control button ───────────────────────────────────────────────────
function CtrlBtn({
  onClick, active, activeColor = 'bg-[#f38ba8]', icon: Icon, title, size = 'md',
}: {
  onClick?: () => void; active?: boolean; activeColor?: string
  icon: React.ElementType; title?: string; size?: 'sm' | 'md' | 'lg'
}) {
  const dim = size === 'lg' ? 'w-16 h-16' : size === 'sm' ? 'w-9 h-9' : 'w-12 h-12'
  const ico = size === 'lg' ? 'w-7 h-7' : size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'
  return (
    <button onClick={onClick} title={title}
      className={`${dim} rounded-full flex items-center justify-center transition-all duration-200 focus:outline-none
        ${active ? `${activeColor} text-white shadow-lg` : 'bg-white/10 hover:bg-white/20 text-white/80 hover:text-white backdrop-blur-sm'}`}>
      <Icon className={ico} />
    </button>
  )
}

export function VoiceChannelPanel({
  channel, serverName, currentUser, connectedUsers,
  isMuted, isDeafened, onToggleMute, onToggleDeafen, onDisconnect,
  onMemberClick, onToggleScreenShare, onToggleCamera, onMuteUser, onUnmuteUser,
  isScreenSharing = false, isCameraOn = false,
  localCameraStream, localScreenStream, remoteStreams = [], mutedUserIds = new Set(),
  isDMCall = false, pendingUsers = [], isIncomingCall = false, isObserving = false,
  onAcceptCall, onDeclineCall, onJoinCall, onOpenMobileMenu,
}: VoiceChannelPanelProps) {
  const { t } = useI18n()
  const [streamQuality, setStreamQuality] = useState<StreamQuality>('720p')
  const [showQualityDropdown, setShowQualityDropdown] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [inputVolume, setInputVolume] = useState(80)
  const [outputVolume, setOutputVolume] = useState(100)
  const [callDeclined, setCallDeclined] = useState(false)
  const callDeclinedProcessedRef = useRef(false)
  const [speakingUserIds, setSpeakingUserIds] = useState<Set<string>>(new Set())
  const [dbVoiceStates, setDbVoiceStates] = useState<VoiceState[]>([])

  useEffect(() => {
    if (!isDMCall || isIncomingCall || isObserving) return
    const rejectionKey = `dc_call_rejected_${channel.id}`
    const checkRejection = () => {
      try {
        const rejected = localStorage.getItem(rejectionKey)
        if (rejected === 'true' && !callDeclinedProcessedRef.current) {
          callDeclinedProcessedRef.current = true
          localStorage.removeItem(rejectionKey)
          setCallDeclined(true)
          setTimeout(() => onDisconnect(), 2000)
        }
      } catch {}
    }
    checkRejection()
    const handleSync = (event: MessageEvent) => {
      if (event.data.type === 'call_rejected' && event.data.channelId === channel.id) checkRejection()
    }
    syncChannel.addEventListener('message', handleSync)
    const pollInterval = setInterval(checkRejection, 500)
    return () => { syncChannel.removeEventListener('message', handleSync); clearInterval(pollInterval); callDeclinedProcessedRef.current = false }
  }, [channel.id, isDMCall, isIncomingCall, isObserving, onDisconnect])

  useEffect(() => {
    const updateStates = async () => {
      const voiceStates = await db.getVoiceStates()
      const speaking = new Set<string>()
      voiceStates.forEach((vs) => { if (vs.isSpeaking && vs.channelId === channel.id) speaking.add(vs.userId) })
      setSpeakingUserIds(speaking)
      setDbVoiceStates(voiceStates.filter((vs) => vs.channelId === channel.id))
    }
    updateStates()
    const handleSync = (event: MessageEvent) => {
      if (event.data.type === 'speaking_updated' || event.data.type === 'voice_updated') updateStates()
    }
    syncChannel.addEventListener('message', handleSync)
    const pollInterval = setInterval(updateStates, 300)
    return () => { syncChannel.removeEventListener('message', handleSync); clearInterval(pollInterval) }
  }, [channel.id])

  // Manage audio elements for remote streams
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map())

  useEffect(() => {
    console.log('[VoiceChannelPanel] Remote streams changed, count:', remoteStreams.length)
    
    // Create or update audio elements for each remote stream
    remoteStreams.forEach(rs => {
      console.log('[VoiceChannelPanel] Processing stream for user:', rs.userId, 'audio tracks:', rs.stream.getAudioTracks().length)
      
      let audioEl = audioElementsRef.current.get(rs.userId)
      
      if (!audioEl) {
        // Create new audio element
        audioEl = document.createElement('audio')
        audioEl.id = `audio-${rs.userId}`
        document.body.appendChild(audioEl)
        audioElementsRef.current.set(rs.userId, audioEl)
        console.log('[VoiceChannelPanel] Created audio element for user:', rs.userId)
      }

      // Set the stream
      if (audioEl.srcObject !== rs.stream) {
        audioEl.srcObject = rs.stream
        const audioTracks = rs.stream.getAudioTracks()
        console.log('[VoiceChannelPanel] Set srcObject for user:', rs.userId, {
          audioTracks: audioTracks.length,
          trackEnabled: audioTracks.length > 0 ? audioTracks[0].enabled : 'N/A',
          trackState: audioTracks.length > 0 ? audioTracks[0].readyState : 'N/A'
        })
      }

      // Set volume
      const volume = isDeafened ? 0 : (outputVolume / 100)
      audioEl.volume = volume
      
      // Ensure autoplay
      audioEl.autoplay = true
      audioEl.playsInline = true
      
      // Try to play
      const playPromise = audioEl.play()
      if (playPromise) {
        playPromise.then(() => {
          console.log('[VoiceChannelPanel] Audio playing for user:', rs.userId)
        }).catch(e => {
          console.warn('[VoiceChannelPanel] Could not autoplay for', rs.userId, ':', e.message)
          // On user interaction, try again
          const playOnInteraction = () => {
            audioEl?.play().then(() => {
              console.log('[VoiceChannelPanel] Played audio for', rs.userId, 'after user click')
            }).catch(err => console.error('[VoiceChannelPanel] Failed to play:', err))
            document.removeEventListener('click', playOnInteraction)
          }
          document.addEventListener('click', playOnInteraction, { once: false })
        })
      }
    })

    // Clean up removed streams
    const activeIds = new Set(remoteStreams.map(rs => rs.userId))
    const idsToRemove: string[] = []
    
    audioElementsRef.current.forEach((audioEl, userId) => {
      if (!activeIds.has(userId)) {
        audioEl.pause()
        audioEl.srcObject = null
        audioEl.remove()
        idsToRemove.push(userId)
        console.log('[VoiceChannelPanel] Removed audio element for user:', userId)
      }
    })

    idsToRemove.forEach(id => audioElementsRef.current.delete(id))
  }, [remoteStreams, isDeafened, outputVolume])

  const qualityOptions = [
    { value: '360p' as StreamQuality, label: '360p', desc: 'Low quality' },
    { value: '480p' as StreamQuality, label: '480p', desc: 'Standard quality' },
    { value: '720p' as StreamQuality, label: '720p', desc: 'HD quality' },
    { value: '1080p' as StreamQuality, label: '1080p', desc: 'Full HD' },
    { value: '1440p' as StreamQuality, label: '1440p', desc: 'Highest quality' },
  ]

  const hasAnyVideo = isCameraOn || isScreenSharing || remoteStreams.some((s) => s.hasVideo)

  // ── Avatar tile for audio-only users ─────────────────────────────────────
  const AvatarTile = ({ user, isGrid = false }: { user: Member; isGrid?: boolean }) => {
    const dbState = dbVoiceStates.find((vs) => vs.userId === user.id)
    const isUserMuted = user.id === currentUser.id ? isMuted : dbState?.isMuted || mutedUserIds.has(user.id)
    const isUserDeafened = user.id === currentUser.id ? isDeafened : dbState?.isDeafened || false
    const isSpeaking = speakingUserIds.has(user.id)
    const showRing = isSpeaking && !isUserMuted && !isUserDeafened && !isDeafened

    if (isGrid) {
      return (
        <div className="relative bg-[#181825] rounded-2xl aspect-video flex flex-col items-center justify-center gap-3 ring-1 ring-white/5">
          <div className={`relative rounded-full transition-all duration-200 ${showRing ? 'ring-4 ring-[#a6e3a1]/60 ring-offset-2 ring-offset-[#181825]' : ''}`}>
            <UserAvatar user={user} size="xl" className="w-16 h-16 text-2xl" />
            {isUserDeafened && (
              <div className="absolute -bottom-1 -right-1 bg-[#f38ba8] rounded-full p-1 border-2 border-[#181825]">
                <HeadphonesIcon className="w-3 h-3 text-white" />
              </div>
            )}
            {!isUserDeafened && isUserMuted && (
              <div className="absolute -bottom-1 -right-1 bg-[#f38ba8] rounded-full p-1 border-2 border-[#181825]">
                <MicOffIcon className="w-3 h-3 text-white" />
              </div>
            )}
          </div>
          <span className="text-white/90 font-medium text-sm">{user.displayName}</span>
        </div>
      )
    }

    return (
      <div className="flex flex-col items-center gap-3 cursor-pointer group" onClick={(e) => onMemberClick?.(user, e)}>
        {/* Outer glow ring */}
        <div className={`relative p-1 rounded-full transition-all duration-300 ${showRing ? 'shadow-[0_0_0_3px_rgba(166,227,161,0.5),0_0_20px_rgba(166,227,161,0.25)]' : ''}`}>
          {/* Animated ring */}
          {showRing && (
            <span className="absolute inset-0 rounded-full animate-ping bg-[#a6e3a1]/20" style={{ animationDuration: '1.5s' }} />
          )}
          <div className="relative w-24 h-24">
            <UserAvatar user={user} size="xl" className="w-24 h-24 text-4xl rounded-full" />
            {/* Status badge */}
            {isUserDeafened ? (
              <div className="absolute -bottom-0.5 -right-0.5 bg-[#f38ba8] rounded-full p-1.5 border-[3px] border-[#11111b] shadow-lg">
                <HeadphonesIcon className="w-3.5 h-3.5 text-white" />
              </div>
            ) : isUserMuted ? (
              <div className="absolute -bottom-0.5 -right-0.5 bg-[#f38ba8] rounded-full p-1.5 border-[3px] border-[#11111b] shadow-lg">
                <MicOffIcon className="w-3.5 h-3.5 text-white" />
              </div>
            ) : (
              <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-[#a6e3a1] rounded-full border-[3px] border-[#11111b]" />
            )}
          </div>
        </div>
        <div className="text-center">
          <p className="text-white font-semibold text-base leading-tight">{user.displayName}</p>
          <p className="text-white/40 text-xs mt-0.5">
            {isUserDeafened ? 'Deafened' : isUserMuted ? 'Muted' : showRing ? 'Speaking' : 'Connected'}
          </p>
        </div>
      </div>
    )
  }

  const titleText = callDeclined ? 'Call Ended'
    : isIncomingCall ? 'Incoming Call'
    : isObserving ? 'Call in Progress'
    : isDMCall ? 'Voice Call'
    : channel.name

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#11111b] relative overflow-hidden">

      {/* Ambient background glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-[#cba6f7]/6 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-[#89b4fa]/6 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <div className="relative z-10 h-12 px-4 flex items-center justify-between border-b border-white/5 bg-[#181825]/80 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-2.5 px-2 py-1.5 rounded cursor-pointer group relative">
          {onOpenMobileMenu && (
            <button onClick={onOpenMobileMenu} className="md:hidden text-white/50 hover:text-white mr-1 flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" />
              </svg>
            </button>
          )}
          {/* Live indicator */}
          {!isIncomingCall && !callDeclined && (
            <span className="flex items-center gap-1.5 flex-shrink-0">
              <span className="w-2 h-2 rounded-full bg-[#a6e3a1] animate-pulse" />
              <span className="text-[#a6e3a1] text-xs font-bold uppercase tracking-widest">Live</span>
            </span>
          )}
          <div className="w-px h-4 bg-white/10 hidden sm:block flex-shrink-0" />
          <span className="text-white font-semibold truncate">{titleText}</span>
          {!isIncomingCall && !callDeclined && (
            <span className="text-white/30 text-sm hidden sm:block flex-shrink-0">
              · {connectedUsers.length} {connectedUsers.length === 1 ? 'person' : 'people'}
            </span>
          )}
        </div>
        <button onClick={() => setShowSettings(!showSettings)}
          className={`p-2 rounded-lg transition-colors ${showSettings ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white hover:bg-white/10'}`}>
          <SlidersHorizontalIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Main area */}
      <div className="relative z-10 flex-1 overflow-y-auto custom-scrollbar">
        <div className="min-h-full flex flex-col items-center justify-center p-6 md:p-10">

          {/* Video grid */}
          {hasAnyVideo ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
              {isCameraOn && localCameraStream && (
                <VideoTile stream={localCameraStream} label={`${currentUser.displayName} (You)`} isMuted />
              )}
              {isScreenSharing && localScreenStream && (
                <VideoTile stream={localScreenStream} label="Your Screen" isMuted />
              )}
              {remoteStreams.filter(s => s.hasVideo).map(rs => {
                const member = connectedUsers.find(u => u.id === rs.userId)
                return <VideoTile key={rs.userId} stream={rs.stream} label={member?.displayName || 'User'} />
              })}
              {connectedUsers.filter(user => {
                if (user.id === currentUser.id && isCameraOn) return false
                if (remoteStreams.some(rs => rs.userId === user.id && rs.hasVideo)) return false
                return true
              }).map(user => <AvatarTile key={`av-${user.id}`} user={user} isGrid />)}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-10 md:gap-16 w-full">
              {connectedUsers.map(user => <AvatarTile key={user.id} user={user} />)}

              {/* Pending (ringing) users */}
              {isDMCall && pendingUsers.map(user => (
                <div key={`pending-${user.id}`} className="flex flex-col items-center gap-3">
                  <div className="relative p-1 rounded-full">
                    {!callDeclined && (
                      <>
                        {[0, 0.6, 1.2].map((delay, i) => (
                          <span key={i} className="absolute inset-0 rounded-full border-2 border-[#89b4fa]/40 animate-ping"
                            style={{ animationDelay: `${delay}s`, animationDuration: '2s' }} />
                        ))}
                      </>
                    )}
                    <div className={`relative w-24 h-24 ${callDeclined ? 'opacity-30 grayscale' : 'opacity-60'}`}>
                      <UserAvatar user={user} size="xl" className="w-24 h-24 text-4xl rounded-full" />
                    </div>
                    {callDeclined && (
                      <div className="absolute inset-0 flex items-center justify-center animate-in fade-in zoom-in duration-300">
                        <div className="w-11 h-11 rounded-full bg-[#f38ba8] flex items-center justify-center shadow-xl shadow-[#f38ba8]/30">
                          <XIcon className="w-6 h-6 text-white" strokeWidth={2.5} />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="text-center">
                    <p className="text-white font-semibold text-base">{user.displayName}</p>
                    <p className={`text-xs mt-0.5 ${callDeclined ? 'text-[#f38ba8]' : 'text-[#89b4fa]'}`}>
                      {callDeclined ? 'Declined' : (
                        <span className="flex items-center justify-center gap-1">
                          Calling<span className="calling-dots" />
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div className="mx-4 mb-6 bg-white/5 backdrop-blur-sm rounded-2xl p-5 border border-white/8 animate-in fade-in slide-in-from-top-2 duration-200">
            <h3 className="text-white/60 text-xs font-bold uppercase tracking-widest mb-5 flex items-center gap-2">
              <SettingsIcon className="w-3.5 h-3.5" /> Audio Settings
            </h3>
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-white/50 text-xs font-semibold uppercase tracking-wide">Input Volume</label>
                  <span className="text-[#cba6f7] text-xs font-mono">{inputVolume}%</span>
                </div>
                <input type="range" min="0" max="100" value={inputVolume} onChange={e => setInputVolume(Number(e.target.value))}
                  className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-[#cba6f7]" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-white/50 text-xs font-semibold uppercase tracking-wide">Output Volume</label>
                  <span className="text-[#cba6f7] text-xs font-mono">{outputVolume}%</span>
                </div>
                <input type="range" min="0" max="100" value={outputVolume} onChange={e => setOutputVolume(Number(e.target.value))}
                  className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-[#cba6f7]" />
              </div>
              <div className="pt-2 border-t border-white/8">
                <div className="relative">
                  <button onClick={() => setShowQualityDropdown(!showQualityDropdown)}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-white/8 hover:bg-white/12 rounded-xl text-sm text-white/70 hover:text-white transition-colors">
                    <div className="flex items-center gap-2">
                      <MonitorIcon className="w-4 h-4" />
                      <span>Stream Quality: <span className="text-[#cba6f7] font-medium">{streamQuality}</span></span>
                    </div>
                    <ChevronDownIcon className={`w-4 h-4 transition-transform ${showQualityDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  {showQualityDropdown && (
                    <div className="absolute bottom-full left-0 mb-2 w-full bg-[#181825] rounded-xl shadow-2xl border border-white/8 overflow-hidden z-20">
                      {qualityOptions.map(opt => (
                        <button key={opt.value} onClick={() => { setStreamQuality(opt.value); setShowQualityDropdown(false) }}
                          className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-sm transition-colors ${streamQuality === opt.value ? 'bg-[#cba6f7]/15 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}>
                          <div>
                            <span className="font-medium">{opt.label}</span>
                            <span className="text-white/30 text-xs ml-2">{opt.desc}</span>
                          </div>
                          {streamQuality === opt.value && <div className="w-2 h-2 rounded-full bg-[#cba6f7]" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Control bar */}
      <div className="relative z-10 bg-[#181825]/90 backdrop-blur-md border-t border-white/5 px-4 py-4 flex-shrink-0">
        {callDeclined ? (
          <div className="flex items-center justify-center">
            <span className="text-white/40 text-sm">Disconnecting...</span>
          </div>
        ) : isIncomingCall ? (
          /* Incoming call: Accept / Decline */
          <div className="flex items-center justify-center gap-6">
            <div className="flex flex-col items-center gap-1.5">
              <button onClick={onDeclineCall}
                className="w-14 h-14 rounded-full bg-[#f38ba8] hover:bg-[#f38ba8]/80 text-white flex items-center justify-center transition-all hover:scale-105 shadow-lg shadow-[#f38ba8]/25">
                <PhoneOffIcon className="w-6 h-6" />
              </button>
              <span className="text-white/40 text-xs">Decline</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <button onClick={onAcceptCall}
                className="w-14 h-14 rounded-full bg-[#a6e3a1] hover:bg-[#a6e3a1]/80 text-white flex items-center justify-center transition-all hover:scale-105 shadow-lg shadow-[#a6e3a1]/25">
                <PhoneIcon className="w-6 h-6" />
              </button>
              <span className="text-white/40 text-xs">Accept</span>
            </div>
          </div>
        ) : isObserving ? (
          <div className="flex items-center justify-center">
            <button onClick={onJoinCall}
              className="h-11 px-8 rounded-full bg-[#a6e3a1] hover:bg-[#a6e3a1]/80 text-white font-semibold flex items-center gap-2 transition-all hover:scale-105 shadow-lg shadow-[#a6e3a1]/20">
              <PhoneIcon className="w-5 h-5" /> Join Call
            </button>
          </div>
        ) : (
          /* Normal call controls */
          <div className="flex items-center justify-center gap-2 md:gap-3 flex-wrap">
            {/* Mute */}
            <div className="flex flex-col items-center gap-1">
              <CtrlBtn onClick={onToggleMute} active={isMuted} activeColor="bg-[#f38ba8]"
                icon={isMuted ? MicOffIcon : MicIcon} title={isMuted ? 'Unmute' : 'Mute'} />
              <span className="text-white/30 text-[10px] hidden sm:block">{isMuted ? 'Unmute' : 'Mute'}</span>
            </div>
            {/* Deafen */}
            <div className="flex flex-col items-center gap-1">
              <div className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer
                ${isDeafened ? 'bg-[#f38ba8] shadow-lg text-white' : 'bg-white/10 hover:bg-white/20 text-white/80 hover:text-white backdrop-blur-sm'}`}
                onClick={onToggleDeafen}>
                <HeadphonesIcon className="w-5 h-5" />
                {isDeafened && <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-0.5 bg-white rotate-45 rounded" />}
              </div>
              <span className="text-white/30 text-[10px] hidden sm:block">{isDeafened ? 'Undeafen' : 'Deafen'}</span>
            </div>
            {/* Camera */}
            <div className="flex flex-col items-center gap-1">
              <CtrlBtn onClick={onToggleCamera} active={isCameraOn} activeColor="bg-[#a6e3a1]"
                icon={isCameraOn ? VideoOffIcon : VideoIcon} title={isCameraOn ? 'Stop Camera' : 'Camera'} />
              <span className="text-white/30 text-[10px] hidden sm:block">Camera</span>
            </div>
            {/* Screen share */}
            <div className="flex flex-col items-center gap-1">
              <CtrlBtn onClick={onToggleScreenShare} active={isScreenSharing} activeColor="bg-[#cba6f7]"
                icon={isScreenSharing ? MonitorOffIcon : MonitorIcon} title={isScreenSharing ? 'Stop Share' : 'Share Screen'} />
              <span className="text-white/30 text-[10px] hidden sm:block">Screen</span>
            </div>
            {/* Disconnect */}
            <div className="flex flex-col items-center gap-1 ml-2">
              <button onClick={onDisconnect}
                className="w-12 h-12 rounded-full bg-[#f38ba8] hover:bg-[#f38ba8]/80 text-white flex items-center justify-center transition-all hover:scale-105 shadow-lg shadow-[#f38ba8]/20">
                <PhoneOffIcon className="w-5 h-5" />
              </button>
              <span className="text-white/30 text-[10px] hidden sm:block">Leave</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
