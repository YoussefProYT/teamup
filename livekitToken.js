// Simple JWT token generation for LiveKit (development only)
// In production, this should be done server-side for security

function base64UrlEncode(str) {
  return btoa(String.fromCharCode(...new Uint8Array(str)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function createJWT(payload, secret) {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const encodedHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));

  // Use Web Crypto API for proper HMAC
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const message = encodedHeader + '.' + encodedPayload;
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  const encodedSignature = base64UrlEncode(signature);

  return encodedHeader + '.' + encodedPayload + '.' + encodedSignature;
}

export async function createVoiceToken(userId, serverId, channelId) {
  // Create room name as serverId-channelId for voice channels
  const roomName = `${serverId}-${channelId}`;

  const payload = {
    iss: import.meta.env.VITE_LIVEKIT_API_KEY || 'dev-api-key',
    sub: userId,
    name: userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    // LiveKit grants
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  };

  const secret = import.meta.env.VITE_LIVEKIT_API_SECRET || 'dev-secret';
  return await createJWT(payload, secret);
}

// Keep the old function for backward compatibility
export async function createToken(userId, roomName) {
  const payload = {
    iss: import.meta.env.VITE_LIVEKIT_API_KEY || 'dev-api-key',
    sub: userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    // LiveKit grants
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
  };

  const secret = import.meta.env.VITE_LIVEKIT_API_SECRET || 'dev-secret';
  return await createJWT(payload, secret);
}