import React from 'react';
import {
  PhoneOffIcon,
  MonitorIcon,
  MonitorOffIcon,
  VideoIcon,
  VideoOffIcon,
  MicIcon,
  MicOffIcon,
  HeadphonesIcon
} from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { UserAvatar } from './UserAvatar';
import type { Member } from '../lib/database';

interface VoicePanelProps {
  channelName: string;
  serverName: string;
  onDisconnect: () => void;
  isMuted: boolean;
  isDeafened: boolean;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onToggleScreenShare?: () => void;
  onToggleCamera?: () => void;
  isScreenSharing?: boolean;
  isCameraOn?: boolean;
  joinedAt?: number;
  connectedUserCount?: number;
  userLimit?: number;
  channelId?: string;
  currentUser?: Member | any;
  otherUser?: Member | any;
  isDMCall?: boolean;
  onToggleStreaming?: () => void;
  isStreaming?: boolean;
}

export function VoicePanel({
  channelName,
  serverName,
  onDisconnect,
  isMuted,
  isDeafened,
  onToggleMute,
  onToggleDeafen,
  onToggleScreenShare,
  onToggleCamera,
  isScreenSharing = false,
  isCameraOn = false,
  connectedUserCount = 0,
  currentUser,
  otherUser,
}: VoicePanelProps) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col bg-[#1e1e2e] h-full rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#181825] border-b border-[#11111b]">
        <div className="flex items-center gap-2">
          <MicIcon size={18} className="text-[#94e2d5]" />
          <span className="font-semibold text-[#cdd6f4]">{t('voice.voiceCall') || 'Voice Call'}</span>
          <span className="text-xs text-[#6c7086]">• {connectedUserCount} {t('general.connected') || 'connected'}</span>
        </div>
        <button
          className="text-[#6c7086] hover:text-[#cdd6f4] transition-colors"
          title="Settings">
          <MonitorIcon size={18} />
        </button>
      </div>

      {/* Main Content - Centered Avatars */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 gap-8">
        {/* Avatar Section */}
        <div className="flex items-center justify-center gap-16">
          {/* Current User */}
          {currentUser && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-24 h-24 rounded-full overflow-hidden ring-4 ring-[#a6e3a1] flex items-center justify-center bg-[#313244]">
                <UserAvatar user={currentUser} size="xl" className="w-24 h-24 text-3xl" />
              </div>
              <div className="text-center">
                <p className="text-base font-semibold text-[#cdd6f4]">{currentUser.displayName}</p>
                <p className="text-xs text-[#a6e3a1]">{t('general.online') || 'online'}</p>
              </div>
            </div>
          )}

          {/* Other User with Calling Rings */}
          {otherUser && (
            <div className="flex flex-col items-center gap-3 relative">
              <div className="relative w-24 h-24">
                {/* Calling rings animation */}
                {connectedUserCount === 1 && (
                  <>
                    <div
                      className="absolute inset-0 rounded-full border-2 border-[#4c7dd9]"
                      style={{
                        transform: 'scale(1.2)',
                        animation: 'pulse 2s ease-out infinite',
                        opacity: 0.6
                      }}
                    />
                    <div
                      className="absolute inset-0 rounded-full border-2 border-[#4c7dd9]"
                      style={{
                        transform: 'scale(1.4)',
                        animation: 'pulse 2s ease-out infinite',
                        animationDelay: '0.4s',
                        opacity: 0.3
                      }}
                    />
                  </>
                )}
                {/* Avatar */}
                <div className="absolute inset-0 rounded-full overflow-hidden ring-4 ring-[#45475a] flex items-center justify-center bg-[#313244]">
                  <UserAvatar user={otherUser} size="xl" className="w-24 h-24 text-3xl" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-base font-semibold text-[#cdd6f4]">{otherUser.displayName}</p>
                <p className="text-xs text-[#a6adc8]">
                  {connectedUserCount > 1 ? (t('general.online') || 'online') : (t('voice.calling') || 'Calling')}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Control Buttons */}
        <div className="flex items-center justify-center gap-6">
          <button
            onClick={onToggleMute}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
              isMuted
                ? 'bg-[#f38ba8] shadow-lg shadow-[#f38ba8]/40'
                : 'bg-[#45475a] hover:bg-[#585b70]'
            }`}
            title={isMuted ? t('voice.unmute') : t('voice.mute')}>
            {isMuted ? (
              <MicOffIcon size={24} className="text-white" />
            ) : (
              <MicIcon size={24} className="text-[#cdd6f4]" />
            )}
          </button>

          <button
            onClick={onToggleDeafen}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all relative ${
              isDeafened
                ? 'bg-[#f38ba8] shadow-lg shadow-[#f38ba8]/40'
                : 'bg-[#45475a] hover:bg-[#585b70]'
            }`}
            title={isDeafened ? t('voice.undeafen') : t('voice.deafen')}>
            <HeadphonesIcon size={24} className={isDeafened ? 'text-white' : 'text-[#cdd6f4]'} />
            {isDeafened && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-1 bg-white rotate-45 rounded" />
            )}
          </button>

          <button
            onClick={onToggleCamera}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
              isCameraOn
                ? 'bg-[#cba6f7] shadow-lg shadow-[#cba6f7]/40'
                : 'bg-[#45475a] hover:bg-[#585b70]'
            }`}
            title={isCameraOn ? t('voice.stopCamera') : t('voice.startCamera')}>
            {isCameraOn ? (
              <VideoOffIcon size={24} className="text-white" />
            ) : (
              <VideoIcon size={24} className="text-[#cdd6f4]" />
            )}
          </button>

          <button
            onClick={onToggleScreenShare}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
              isScreenSharing
                ? 'bg-[#cba6f7] shadow-lg shadow-[#cba6f7]/40'
                : 'bg-[#45475a] hover:bg-[#585b70]'
            }`}
            title={isScreenSharing ? t('voice.stopScreenShare') : t('voice.shareScreen')}>
            {isScreenSharing ? (
              <MonitorOffIcon size={24} className="text-white" />
            ) : (
              <MonitorIcon size={24} className="text-[#cdd6f4]" />
            )}
          </button>

          <button
            onClick={onDisconnect}
            className="w-14 h-14 rounded-full bg-[#f38ba8] hover:bg-[#eba0ac] flex items-center justify-center transition-all shadow-lg shadow-[#f38ba8]/40">
            <PhoneOffIcon size={24} className="text-white" />
          </button>
        </div>
      </div>

      {/* Footer */}
      {otherUser && (
        <div className="px-4 py-3 bg-[#181825] border-t border-[#11111b] flex items-center gap-3">
          <div className="flex-shrink-0">
            <UserAvatar user={otherUser} size="sm" className="w-8 h-8 text-sm" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[#cdd6f4] truncate">
              @ {otherUser.displayName}
            </p>
            <p className="text-xs text-[#6c7086]">
              {connectedUserCount > 1 ? (t('general.online') || 'Online') : (t('voice.calling') || 'Calling')}
            </p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0% {
            opacity: 1;
            transform: scale(1.2);
          }
          100% {
            opacity: 0;
            transform: scale(1.8);
          }
        }
      `}</style>
    </div>
  );
}
