// Google Calendar API client with service account JWT support
// Compatible with Cloudflare Workers runtime (Web Crypto API only, no Node.js crypto)

const GCAL_BASE = 'https://www.googleapis.com/calendar/v3';
const TIMEZONE = 'Asia/Tokyo';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export interface GoogleCalendarConfig {
  calendarId: string;
  accessToken?: string;           // Direct access token (legacy)
  serviceAccount?: {              // Service account credentials
    clientEmail: string;
    privateKey: string;           // PEM format
  };
}

export interface BusyInterval {
  start: string;
  end: string;
}

export interface CreateEventInput {
  summary: string;
  start: string;   // ISO datetime string
  end: string;     // ISO datetime string
  description?: string;
}

// ---------------------------------------------------------------------------
// Base64url helpers (no external deps, works in Workers)
// ---------------------------------------------------------------------------

function base64urlEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlEncodeString(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---------------------------------------------------------------------------
// PEM private key parsing
// ---------------------------------------------------------------------------

function pemToArrayBuffer(pem: string): ArrayBuffer {
  // Strip PEM headers/footers and all whitespace
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/[\r\n\s]/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ---------------------------------------------------------------------------
// Service account JWT token generation (Web Crypto API)
// ---------------------------------------------------------------------------

/**
 * Generate an OAuth2 access token using Google service account credentials.
 * Uses Web Crypto API for RS256 signing — fully compatible with Cloudflare Workers.
 */
async function generateServiceAccountToken(
  clientEmail: string,
  privateKeyPem: string,
  scopes: string[],
): Promise<string> {
  // 1. Build JWT header + claims
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: clientEmail,
    scope: scopes.join(' '),
    aud: TOKEN_ENDPOINT,
    exp: now + 3600,
    iat: now,
  };

  // 2. Base64url encode header and claims
  const encodedHeader = base64urlEncodeString(JSON.stringify(header));
  const encodedClaims = base64urlEncodeString(JSON.stringify(claims));
  const unsignedToken = `${encodedHeader}.${encodedClaims}`;

  // 3. Import PEM private key using Web Crypto API (PKCS8)
  const keyData = pemToArrayBuffer(privateKeyPem);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  // 4. Sign with RS256
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(unsignedToken),
  );

  // 5. Build signed JWT
  const encodedSignature = base64urlEncode(signature);
  const jwt = `${unsignedToken}.${encodedSignature}`;

  // 6. Exchange JWT for access token
  const tokenRes = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => '');
    throw new Error(`Service account token exchange failed ${tokenRes.status}: ${text}`);
  }

  const tokenData = (await tokenRes.json()) as { access_token?: string };
  if (!tokenData.access_token) {
    throw new Error('Service account token exchange: response missing access_token');
  }

  // 7. Return the access token
  return tokenData.access_token;
}

// ---------------------------------------------------------------------------
// Google Calendar Client
// ---------------------------------------------------------------------------

export class GoogleCalendarClient {
  constructor(private config: GoogleCalendarConfig) {}

  /**
   * Resolve a valid access token from either direct config or service account JWT flow.
   */
  private async getAccessToken(): Promise<string> {
    if (this.config.accessToken) {
      return this.config.accessToken;
    }
    if (this.config.serviceAccount) {
      return generateServiceAccountToken(
        this.config.serviceAccount.clientEmail,
        this.config.serviceAccount.privateKey,
        ['https://www.googleapis.com/auth/calendar'],
      );
    }
    throw new Error('No authentication configured: provide accessToken or serviceAccount');
  }

  /**
   * Get busy time intervals from Google Calendar FreeBusy API.
   * Returns an array of { start, end } intervals when the calendar is busy.
   */
  async getFreeBusy(timeMin: string, timeMax: string): Promise<BusyInterval[]> {
    const accessToken = await this.getAccessToken();
    const url = `${GCAL_BASE}/freeBusy`;
    const body = {
      timeMin,
      timeMax,
      items: [{ id: this.config.calendarId }],
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Google FreeBusy API error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      calendars?: Record<string, { busy?: { start: string; end: string }[] }>;
    };

    const calendarData = data.calendars?.[this.config.calendarId];
    return calendarData?.busy ?? [];
  }

  /**
   * Create an event on Google Calendar.
   * Returns the created event's ID.
   */
  async createEvent(event: CreateEventInput): Promise<{ eventId: string }> {
    const accessToken = await this.getAccessToken();
    const url = `${GCAL_BASE}/calendars/${encodeURIComponent(this.config.calendarId)}/events`;

    const body = {
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.start, timeZone: TIMEZONE },
      end: { dateTime: event.end, timeZone: TIMEZONE },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Google Calendar createEvent error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as { id?: string };
    if (!data.id) {
      throw new Error('Google Calendar createEvent: response missing event id');
    }

    return { eventId: data.id };
  }

  /**
   * Delete an event from Google Calendar.
   */
  async deleteEvent(eventId: string): Promise<void> {
    const accessToken = await this.getAccessToken();
    const url = `${GCAL_BASE}/calendars/${encodeURIComponent(this.config.calendarId)}/events/${encodeURIComponent(eventId)}`;

    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    // 204 = success, 410 = already deleted — both are acceptable
    if (!res.ok && res.status !== 410) {
      const text = await res.text().catch(() => '');
      throw new Error(`Google Calendar deleteEvent error ${res.status}: ${text}`);
    }
  }
}
