/**
 * LiveKit Voice Manager
 * Uses LiveKit SFU for WebRTC media routing and signaling.
 * Supports: audio, video (camera), screen sharing, per-user muting.
 */

import {
  Room,
  RoomEvent,
  Participant,
  RemoteParticipant,
  LocalParticipant,
  Track,
  TrackPublication,
  RemoteTrackPublication,
  LocalTrackPublication,
  TrackSource,
  ConnectionState,
  DataPacket_Kind,
  ParticipantEvent,
  TrackEvent,
} from 'livekit-client';

export interface RemoteStream {
  userId: string;
  stream: MediaStream;
  hasVideo: boolean;
  hasScreen: boolean;
  isStreaming: boolean;
  participant: RemoteParticipant;
}

export class LiveKitVoiceManager {
  private room: Room | null = null;
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private cameraStream: MediaStream | null = null;
  private streamStream: MediaStream | null = null; // Live streaming stream

  private userId: string = '';
  private serverId: string = '';
  private channelId: string = '';
  private isConnected: boolean = false;
  private isMuted: boolean = false;
  private isDeafened: boolean = false;
  private joinTimestamp: number = 0;
  private isStreaming: boolean = false;

  // Callbacks
  private onPeerCountChange?: (count: number) => void;
  private onRemoteStreamsChange?: (streams: RemoteStream[]) => void;
  private onScreenShareStopped?: () => void;
  private onCameraStopped?: () => void;
  private onSpeakingChange?: (isSpeaking: boolean) => void;
  private onStreamingChange?: (isStreaming: boolean) => void;
  private onConnectionStateChange?: (state: ConnectionState) => void;

  constructor() {
    this.room = new Room({
      // Configure room options as needed
      adaptiveStream: true,
      dynacast: true,
      // Allow self-signed certificates for development
      rtcConfig: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });

    this.setupRoomEventListeners();
  }

  private setupRoomEventListeners() {
    if (!this.room) return;

    // Connection state changes
    this.room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
      console.log('[LiveKitVoiceManager] Connection state changed:', state);
      this.onConnectionStateChange?.(state);

      if (state === ConnectionState.Connected) {
        this.isConnected = true;
        this.joinTimestamp = Date.now();
        this.notifyPeerCount();
      } else if (state === ConnectionState.Disconnected) {
        this.isConnected = false;
        this.notifyPeerCount();
      }
    });

    // Participant events
    this.room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      console.log('[LiveKitVoiceManager] Participant connected:', participant.identity);
      this.notifyPeerCount();
      this.notifyRemoteStreams();
    });

    this.room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      console.log('[LiveKitVoiceManager] Participant disconnected:', participant.identity);
      this.notifyPeerCount();
      this.notifyRemoteStreams();
    });

    // Track events
    this.room.on(RoomEvent.TrackSubscribed, (track: Track, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      console.log('[LiveKitVoiceManager] Track subscribed:', track.kind, 'from', participant.identity);
      this.notifyRemoteStreams();
    });

    this.room.on(RoomEvent.TrackUnsubscribed, (track: Track, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      console.log('[LiveKitVoiceManager] Track unsubscribed:', track.kind, 'from', participant.identity);
      this.notifyRemoteStreams();
    });

    this.room.on(RoomEvent.TrackMuted, (publication: TrackPublication, participant: Participant) => {
      console.log('[LiveKitVoiceManager] Track muted:', publication.kind, 'from', participant.identity);
      this.notifyRemoteStreams();
    });

    this.room.on(RoomEvent.TrackUnmuted, (publication: TrackPublication, participant: Participant) => {
      console.log('[LiveKitVoiceManager] Track unmuted:', publication.kind, 'from', participant.identity);
      this.notifyRemoteStreams();
    });

    // Local participant events
    this.room.localParticipant.on(ParticipantEvent.LocalTrackPublished, (publication: LocalTrackPublication) => {
      console.log('[LiveKitVoiceManager] Local track published:', publication.kind);
    });

    this.room.localParticipant.on(ParticipantEvent.LocalTrackUnpublished, (publication: LocalTrackPublication) => {
      console.log('[LiveKitVoiceManager] Local track unpublished:', publication.kind);
    });
  }

  setCallbacks(callbacks: {
    onPeerCountChange?: (count: number) => void;
    onRemoteStreamsChange?: (streams: RemoteStream[]) => void;
    onScreenShareStopped?: () => void;
    onCameraStopped?: () => void;
    onSpeakingChange?: (isSpeaking: boolean) => void;
    onStreamingChange?: (isStreaming: boolean) => void;
    onConnectionStateChange?: (state: ConnectionState) => void;
  }) {
    this.onPeerCountChange = callbacks.onPeerCountChange;
    this.onRemoteStreamsChange = callbacks.onRemoteStreamsChange;
    this.onScreenShareStopped = callbacks.onScreenShareStopped;
    this.onCameraStopped = callbacks.onCameraStopped;
    this.onSpeakingChange = callbacks.onSpeakingChange;
    this.onStreamingChange = callbacks.onStreamingChange;
    this.onConnectionStateChange = callbacks.onConnectionStateChange;
  }

  private notifyPeerCount() {
    if (!this.room || !this.room.participants) {
      this.onPeerCountChange?.(0);
      return;
    }
    const count = Array.from(this.room.participants.values()).length + 1; // +1 for local participant
    this.onPeerCountChange?.(count);
  }

  private notifyRemoteStreams() {
    if (!this.room || !this.room.participants) {
      this.onRemoteStreamsChange?.([]);
      return;
    }

    const streams: RemoteStream[] = [];

    for (const [identity, participant] of this.room.participants) {
      const audioTrackPub = participant.getTrackPublication(Track.Source.Microphone);
      const videoTrack = participant.getTrackPublication(Track.Source.Camera);
      const screenTrack = participant.getTrackPublication(Track.Source.ScreenShare);
      const screenVideoTrack = participant.getTrackPublication(Track.Source.ScreenShareVideo);

      // Create a MediaStream for this participant
      const stream = new MediaStream();

      if (audioTrackPub?.track) {
        const audioTrack = audioTrackPub.track.mediaStreamTrack;
        console.log('[LiveKitVoiceManager] Audio track details:', {
          enabled: audioTrack.enabled,
          readyState: audioTrack.readyState,
          kind: audioTrack.kind,
          muted: audioTrackPub.isMuted
        });
        
        // Ensure track is enabled
        if (!audioTrack.enabled) {
          console.warn('[LiveKitVoiceManager] Audio track is disabled, enabling it');
          audioTrack.enabled = true;
        }
        
        stream.addTrack(audioTrack);
      } else {
        console.warn('[LiveKitVoiceManager] No audio track found for participant:', identity);
      }
      
      if (videoTrack?.track) {
        stream.addTrack(videoTrack.track.mediaStreamTrack);
      }
      if (screenVideoTrack?.track) {
        stream.addTrack(screenVideoTrack.track.mediaStreamTrack);
      }

      console.log('[LiveKitVoiceManager] Stream for participant:', identity, 'has', stream.getTracks().length, 'tracks');
      
      streams.push({
        userId: identity,
        stream,
        hasVideo: !!videoTrack,
        hasScreen: !!(screenTrack || screenVideoTrack),
        isStreaming: false,
        participant,
      });
    }

    this.onRemoteStreamsChange?.(streams);
  }

  async join(
    userId: string,
    serverId: string,
    channelId: string,
    token: string,
    existingStream?: MediaStream
  ): Promise<MediaStream> {
    if (this.isConnected) {
      await this.leave();
    }

    this.userId = userId;
    this.serverId = serverId;
    this.channelId = channelId;

    if (existingStream) {
      this.localStream = existingStream;
    } else {
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false, // We'll add video separately
        });
        console.log('[LiveKitVoiceManager] Got audio stream with', this.localStream.getAudioTracks().length, 'tracks');
      } catch (err) {
        console.warn('[LiveKitVoiceManager] Microphone unavailable, joining without audio:', err);
        // Create a silent audio stream as fallback
        try {
          const audioContext = new AudioContext();
          const oscillator = audioContext.createOscillator();
          const gain = audioContext.createGain();
          gain.gain.value = 0; // silent
          oscillator.connect(gain);
          const dest = audioContext.createMediaStreamDestination();
          gain.connect(dest);
          oscillator.start();
          this.localStream = dest.stream;
        } catch {
          // Last resort: empty MediaStream
          this.localStream = new MediaStream();
        }
      }
    }

    try {
      // Connect to LiveKit room
      console.log('[LiveKitVoiceManager] Connecting to room:', import.meta.env.VITE_LIVEKIT_WS_URL);
      await this.room!.connect(import.meta.env.VITE_LIVEKIT_WS_URL || 'ws://localhost:7880', token);
      console.log('[LiveKitVoiceManager] Connected to room, publishing tracks');

      // Small delay to ensure connection is fully established
      await new Promise(resolve => setTimeout(resolve, 100));

      // Publish local audio track
      if (this.localStream) {
        const audioTracks = this.localStream.getAudioTracks();
        console.log('[LiveKitVoiceManager] Available audio tracks:', audioTracks.length);
        
        if (audioTracks.length > 0) {
          const audioTrack = audioTracks[0];
          console.log('[LiveKitVoiceManager] Publishing audio track, enabled:', audioTrack.enabled);
          
          try {
            const trackPublication = await this.room!.localParticipant.publishTrack(audioTrack, {
              source: Track.Source.Microphone,
              simulcast: false,
            });
            console.log('[LiveKitVoiceManager] Audio track published successfully:', trackPublication.trackSid);
          } catch (pubErr) {
            console.error('[LiveKitVoiceManager] Failed to publish audio track:', pubErr);
          }
        } else {
          console.warn('[LiveKitVoiceManager] No audio tracks found in local stream');
        }
      } else {
        console.warn('[LiveKitVoiceManager] No local stream available');
      }

      return this.localStream!;
    } catch (error) {
      console.error('[LiveKitVoiceManager] Failed to join room:', error);
      // Clean up on failure
      this.isConnected = false;
      this.notifyPeerCount();
      this.notifyRemoteStreams();
      throw error;
    }
  }

  async leave() {
    if (!this.room) return;

    // Stop all local tracks
    this.stopAllLocalTracks();

    // Disconnect from room
    await this.room.disconnect();
    this.isConnected = false;
    this.onPeerCountChange?.(0);
    this.onRemoteStreamsChange?.([]);
  }

  private stopAllLocalTracks() {
    // Stop screen share
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
      this.onScreenShareStopped?.();
    }

    // Stop camera
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(track => track.stop());
      this.cameraStream = null;
      this.onCameraStopped?.();
    }

    // Stop streaming
    if (this.streamStream) {
      this.streamStream.getTracks().forEach(track => track.stop());
      this.streamStream = null;
      this.isStreaming = false;
      this.onStreamingChange?.(false);
    }

    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
  }

  // --- Audio controls ---

  setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.room) {
      const audioPublication = this.room.localParticipant.getTrackPublication(Track.Source.Microphone);
      if (audioPublication) {
        if (muted) {
          audioPublication.mute();
        } else {
          audioPublication.unmute();
        }
      }
    }
  }

  setDeafened(deafened: boolean) {
    this.isDeafened = deafened;
    // In LiveKit, deafening is handled by the client - mute all remote audio tracks
    if (this.room && this.room.participants) {
      try {
        for (const participant of this.room.participants.values()) {
          const audioPub = participant.getTrackPublication(Track.Source.Microphone);
          if (audioPub?.track) {
            audioPub.track.mediaStreamTrack.enabled = !deafened;
          }
        }
      } catch (error) {
        console.warn('[LiveKitVoiceManager] Error setting deafened state:', error);
      }
    }
  }

  // --- Per-user mute (local only) ---

  mutePeer(userId: string) {
    if (!this.room) return;
    const participant = this.room.participants.get(userId);
    if (participant) {
      const audioPub = participant.getTrackPublication(Track.Source.Microphone);
      if (audioPub?.track) {
        audioPub.track.mediaStreamTrack.enabled = false;
      }
    }
  }

  unmutePeer(userId: string) {
    if (!this.room) return;
    const participant = this.room.participants.get(userId);
    if (participant) {
      const audioPub = participant.getTrackPublication(Track.Source.Microphone);
      if (audioPub?.track) {
        audioPub.track.mediaStreamTrack.enabled = !this.isDeafened;
      }
    }
  }

  isPeerMuted(userId: string): boolean {
    if (!this.room) return false;
    const participant = this.room.participants.get(userId);
    if (participant) {
      const audioPub = participant.getTrackPublication(Track.Source.Microphone);
      return audioPub?.isMuted ?? false;
    }
    return false;
  }

  // --- Screen sharing ---

  async startScreenShare(): Promise<MediaStream | null> {
    if (!this.room || !this.isConnected) return null;

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true, // Include system audio if available
      });

      this.screenStream = stream;

      // Publish screen video track
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        await this.room.localParticipant.publishTrack(videoTrack, {
          source: Track.Source.ScreenShareVideo,
          name: 'screen-video',
        });
      }

      // Publish screen audio track if available
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        await this.room.localParticipant.publishTrack(audioTrack, {
          source: Track.Source.ScreenShare,
          name: 'screen-audio',
        });
      }

      // Handle when user stops sharing via browser UI
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        this.stopScreenShare();
      });

      return stream;
    } catch (error) {
      console.error('[LiveKitVoiceManager] Failed to start screen share:', error);
      return null;
    }
  }

  async stopScreenShare() {
    if (!this.room) return;

    const screenVideoPub = this.room.localParticipant.getTrackPublication(Track.Source.ScreenShareVideo);
    const screenAudioPub = this.room.localParticipant.getTrackPublication(Track.Source.ScreenShare);

    if (screenVideoPub) {
      await this.room.localParticipant.unpublishTrack(screenVideoPub.track!);
    }
    if (screenAudioPub) {
      await this.room.localParticipant.unpublishTrack(screenAudioPub.track!);
    }

    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
    }

    this.onScreenShareStopped?.();
  }

  // --- Camera sharing ---

  async startCamera(): Promise<MediaStream | null> {
    if (!this.room || !this.isConnected) return null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false, // Audio is already published
      });

      this.cameraStream = stream;

      // Publish camera video track
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        await this.room.localParticipant.publishTrack(videoTrack, {
          source: Track.Source.Camera,
        });
      }

      return stream;
    } catch (error) {
      console.error('[LiveKitVoiceManager] Failed to start camera:', error);
      return null;
    }
  }

  async stopCamera() {
    if (!this.room) return;

    const cameraPub = this.room.localParticipant.getTrackPublication(Track.Source.Camera);

    if (cameraPub) {
      await this.room.localParticipant.unpublishTrack(cameraPub.track!);
    }

    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(track => track.stop());
      this.cameraStream = null;
    }

    this.onCameraStopped?.();
  }

  // --- Getters ---

  getRoom(): Room | null {
    return this.room;
  }

  getLocalParticipant(): LocalParticipant | null {
    return this.room?.localParticipant || null;
  }

  getRemoteParticipants(): RemoteParticipant[] {
    return this.room?.participants ? Array.from(this.room.participants.values()) : [];
  }

  getConnectionState(): ConnectionState {
    return this.room?.connectionState || ConnectionState.Disconnected;
  }

  getJoinedAt(): number {
    return this.joinTimestamp;
  }

  getServerId(): string {
    return this.serverId;
  }

  getChannelId(): string {
    return this.channelId;
  }
}

// Singleton instance
export const livekitVoiceManager = new LiveKitVoiceManager();