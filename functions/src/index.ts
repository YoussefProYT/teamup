import * as functions from 'firebase-functions';
import * as crypto from 'crypto';

const API_KEY = process.env.LIVEKIT_API_KEY || '';
const API_SECRET = process.env.LIVEKIT_API_SECRET || '';

function base64UrlEncode(data: Buffer | string): string {
  const base64 = typeof data === 'string'
    ? Buffer.from(data).toString('base64')
    : data.toString('base64');
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function createJWT(payload: Record<string, any>, secret: string): string {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));

  // Create HMAC signature
  const message = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest();

  const encodedSignature = base64UrlEncode(signature);

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

export const generateLiveKitToken = functions.https.onCall(
  (data: any, context: functions.https.CallableContext) => {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { userId, roomName } = data;

    if (!userId || !roomName) {
      throw new functions.https.HttpsError('invalid-argument', 'userId and roomName are required');
    }

    if (!API_KEY || !API_SECRET) {
      console.error('LiveKit credentials not configured');
      throw new functions.https.HttpsError('internal', 'LiveKit credentials not configured');
    }

    const payload = {
      iss: API_KEY,
      sub: userId,
      name: userId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour expiry
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    };

    try {
      const token = createJWT(payload, API_SECRET);
      return { token };
    } catch (error) {
      console.error('Error generating token:', error);
      throw new functions.https.HttpsError('internal', 'Failed to generate token');
    }
  }
);
