import { AccessToken } from 'livekit-server-sdk';

/**
 * Generate a secure LiveKit JWT token using official LiveKit SDK
 * @param userId - The user ID
 * @param room - The room name
 * @returns JWT token
 */
export async function getLiveKitToken(
  userId: string,
  room: string
): Promise<string> {
  const apiKey = import.meta.env.VITE_LIVEKIT_API_KEY;
  const apiSecret = import.meta.env.VITE_LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error('LiveKit API Key or Secret not configured');
  }

  console.log('[getLiveKitToken] Generating token for user:', userId, 'room:', room);

  try {
    const at = new AccessToken(apiKey, apiSecret);
    at.identity = userId;
    at.name = userId;
    at.addGrant({
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,
      room: room,
      roomJoin: true,
    });

    const token = await at.toJwt();
    console.log('[getLiveKitToken] Token generated:', token.substring(0, 50) + '...');
    return token;
  } catch (error) {
    console.error('[getLiveKitToken] Error generating token:', error);
    throw error;
  }
}
