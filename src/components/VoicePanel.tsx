import React, { useEffect, useState } from 'react'
import { PhoneOff, Monitor, MonitorOff, Video, VideoOff, Mic, MicOff, Headphones, Clock, Users } from 'lucide-react'
import { useI18n } from '../lib/i18n'

interface VoicePanelProps {
  channelName: string
  serverName: string
  onDisconnect: () => void
  isMuted: boolean
  isDeafened: boolean
  onToggleMute: () => void
  onToggleDeafen: () => void
  onToggleScreenShare?: () => void
  onToggleCamera?: () => void
  isScreenSharing?: boolean
  isCameraOn?: boolean
  joinedAt?: number
  connectedUserCount?: number
  userLimit?: number
}

export function VoicePanel({
  channelName, serverName, onDisconnect,
  isMuted, isDeafened, onToggleMute, onToggleDeafen,
  onToggleScreenShare, onToggleCamera,
  isScreenSharing = false, isCameraOn = false,
  joinedAt, connectedUserCount = 0, userLimit,
}: VoicePanelProps) {
  const { t } = useI18n()
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!joinedAt) return
    const tick = () => setElapsed(Math.floor((Date.now() - joinedAt) / 1000))
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [joinedAt])

  const formatElapsed = (s: number) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    const p = (n: number) => n.toString().padStart(2, '0')
    return h > 0 ? `${p(h)}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`
  }

  return (
    <div className="bg-[#181825] border-b border-[#11111b] overflow-hidden">
      {/* Green header strip */}
      <div className="px-3 pt-2.5 pb-1">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#a6e3a1] animate-pulse flex-shrink-0" />
            <span className={`text-xs font-bold ${isDeafened ? 'text-[#f38ba8]' : 'text-[#a6e3a1]'}`}>
              {isDeafened ? t('voice.deafened') : t('voice.connected')}
            </span>
          </div>
          <button onClick={onDisconnect}
            className="p-1 text-white/30 hover:text-[#f38ba8] rounded transition-colors hover:bg-[#f38ba8]/10"
            title={t('voice.disconnect')}>
            <PhoneOff size={14} />
          </button>
        </div>

        {/* Channel / server name */}
        <p className="text-xs text-white/40 truncate leading-tight mb-1.5">
          <span className="text-white/70 font-medium">{channelName}</span>
          <span className="mx-1 text-white/20">/</span>
          <span>{serverName}</span>
        </p>

        {/* Timer + user count */}
        <div className="flex items-center justify-between">
          {joinedAt ? (
            <div className="flex items-center gap-1 text-[10px] text-white/30 font-mono tabular-nums">
              <Clock size={9} className="text-[#a6e3a1]" />
              {formatElapsed(elapsed)}
            </div>
          ) : <div />}
          <div className="flex items-center gap-1 text-[10px] text-white/25">
            <Users size={9} />
            <span>{connectedUserCount}{userLimit && userLimit > 0 ? `/${userLimit}` : ''}</span>
          </div>
        </div>
      </div>

      {/* Control buttons - 2x2 compact grid */}
      <div className="grid grid-cols-4 gap-px bg-[#11111b] border-t border-[#11111b]">
        {[
          {
            onClick: onToggleMute,
            active: isMuted,
            activeColor: 'text-[#f38ba8] bg-[#f38ba8]/10',
            Icon: isMuted ? MicOff : Mic,
            title: isMuted ? t('voice.unmute') : t('voice.mute'),
          },
          {
            onClick: onToggleDeafen,
            active: isDeafened,
            activeColor: 'text-[#f38ba8] bg-[#f38ba8]/10',
            Icon: Headphones,
            title: isDeafened ? t('voice.undeafen') : t('voice.deafen'),
          },
          {
            onClick: onToggleCamera,
            active: isCameraOn,
            activeColor: 'text-[#a6e3a1] bg-[#a6e3a1]/10',
            Icon: isCameraOn ? VideoOff : Video,
            title: isCameraOn ? t('voice.stopCamera') : t('voice.startCamera'),
          },
          {
            onClick: onToggleScreenShare,
            active: isScreenSharing,
            activeColor: 'text-[#cba6f7] bg-[#cba6f7]/10',
            Icon: isScreenSharing ? MonitorOff : Monitor,
            title: isScreenSharing ? t('voice.stopScreenShare') : t('voice.shareScreen'),
          },
        ].map(({ onClick, active, activeColor, Icon, title }, i) => (
          <button key={i} onClick={onClick} title={title}
            className={`flex items-center justify-center py-2 transition-colors bg-[#181825]
              ${active ? activeColor : 'text-white/30 hover:text-white/60 hover:bg-white/5'}`}>
            <Icon size={15} className={active && i === 1 && isDeafened ? 'opacity-50' : ''} />
          </button>
        ))}
      </div>
    </div>
  )
}
