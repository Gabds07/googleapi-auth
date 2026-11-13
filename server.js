const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const { OAuth2Client } = require('google-auth-library');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const SESSION_COOKIE = 'google_app_session';
const NONCE_COOKIE = 'google_login_nonce';
const SESSION_TTL_MS = 60 * 60 * 1000;
const NONCE_TTL_MS = 5 * 60 * 1000;
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

// Demonstração didática: estes mapas são locais ao processo e não substituem
// um armazenamento compartilhado/persistente em produção.
const usersByGoogleSub = new Map();
const sessions = new Map();
const loginNonces = new Map();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '16kb', type: 'application/json' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client; " +
      "style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.googleusercontent.com; " +
      "frame-src https://accounts.google.com; connect-src 'self' https://accounts.google.com " +
      "https://oauth2.googleapis.com; base-uri 'self'; form-action 'self'; object-src 'none'"
  );
  res.setHeader('Cache-Control', 'no-store');
  next();
});

function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function cookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    ...(maxAge ? { maxAge } : {})
  };
}

function setAppCookie(res, name, value, maxAge) {
  res.cookie(name, value, cookieOptions(maxAge));
}

function clearAppCookie(res, name) {
  res.clearCookie(name, cookieOptions());
}

function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function pruneExpired() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(id);
  }
  for (const [nonce, expiresAt] of loginNonces) {
    if (expiresAt <= now) loginNonces.delete(nonce);
  }
}

function getSession(req) {
  pruneExpired();
  const id = readCookie(req, SESSION_COOKIE);
  if (!id) return null;
  const session = sessions.get(id);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(id);
    return null;
  }
  return { id, ...session };
}

function publicUser(user) {
  return {
    name: user.name || 'Conta Google',
    email: user.email || '',
    picture: user.picture || '',
    emailVerified: user.emailVerified === true
  };
}

function sendAuthError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, configured: Boolean(googleClient) });
});

app.get('/api/config', (_req, res) => {
  // Client ID é identificador público de cliente Web; nenhum segredo é enviado.
  res.json({ configured: Boolean(googleClient), clientId: GOOGLE_CLIENT_ID || null });
});

app.get('/api/auth/nonce', (req, res) => {
  if (!googleClient) {
    return sendAuthError(
      res,
      503,
      'client_id_missing',
      'O login ainda não foi configurado. Defina GOOGLE_CLIENT_ID no servidor.'
    );
  }

  pruneExpired();
  const nonce = newToken();
  loginNonces.set(nonce, Date.now() + NONCE_TTL_MS);
  setAppCookie(res, NONCE_COOKIE, nonce, NONCE_TTL_MS);
  return res.json({ nonce });
});

app.post('/api/auth/google', async (req, res) => {
  if (!googleClient) {
    return sendAuthError(
      res,
      503,
      'client_id_missing',
      'O login ainda não foi configurado. Defina GOOGLE_CLIENT_ID no servidor.'
    );
  }

  const idToken = req.body && req.body.id_token;
  if (typeof idToken !== 'string' || idToken.length > 12000) {
    return sendAuthError(res, 400, 'credential_missing', 'A credencial recebida não é válida.');
  }

  const nonceCookie = readCookie(req, NONCE_COOKIE);
  const nonceExpiry = nonceCookie ? loginNonces.get(nonceCookie) : undefined;
  if (!nonceCookie || !nonceExpiry || nonceExpiry <= Date.now()) {
    clearAppCookie(res, NONCE_COOKIE);
    return sendAuthError(
      res,
      401,
      'nonce_expired',
      'A tentativa de login expirou. Atualize a página e tente novamente.'
    );
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    const validIssuers = new Set(['accounts.google.com', 'https://accounts.google.com']);

    if (
      !payload ||
      !payload.sub ||
      !validIssuers.has(payload.iss) ||
      typeof payload.nonce !== 'string' ||
      !safeEqual(payload.nonce, nonceCookie)
    ) {
      return sendAuthError(
        res,
        401,
        'credential_invalid',
        'O Google não confirmou esta tentativa de login. Tente novamente.'
      );
    }

    // Consome o nonce antes de criar a sessão: o mesmo token não pode ser repetido.
    loginNonces.delete(nonceCookie);
    clearAppCookie(res, NONCE_COOKIE);

    const googleSub = payload.sub;
    let user = usersByGoogleSub.get(googleSub);
    if (!user) {
      user = {
        googleSub,
        name: typeof payload.name === 'string' ? payload.name : '',
        email: typeof payload.email === 'string' ? payload.email : '',
        picture: typeof payload.picture === 'string' ? payload.picture : '',
        emailVerified: payload.email_verified === true,
        createdAt: Date.now()
      };
      usersByGoogleSub.set(googleSub, user);
    } else {
      // Nome, e-mail e foto podem mudar; `sub` continua sendo a chave da conta.
      user.name = typeof payload.name === 'string' ? payload.name : user.name;
      user.email = typeof payload.email === 'string' ? payload.email : user.email;
      user.picture = typeof payload.picture === 'string' ? payload.picture : user.picture;
      user.emailVerified = payload.email_verified === true;
    }

    const sessionId = newToken();
    const csrfToken = newToken();
    sessions.set(sessionId, {
      googleSub,
      csrfToken,
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_MS
    });
    setAppCookie(res, SESSION_COOKIE, sessionId, SESSION_TTL_MS);

    return res.json({
      authenticated: true,
      user: publicUser(user),
      csrfToken,
      expiresIn: Math.floor(SESSION_TTL_MS / 1000)
    });
  } catch {
    // Não registrar nem devolver o ID token ou sua representação.
    return sendAuthError(
      res,
      401,
      'credential_invalid',
      'Não foi possível validar a credencial com o Google. Confira o Client ID e tente novamente.'
    );
  }
});

app.get('/api/session', (req, res) => {
  const session = getSession(req);
  if (!session) {
    clearAppCookie(res, SESSION_COOKIE);
    return res.json({ authenticated: false });
  }

  const user = usersByGoogleSub.get(session.googleSub);
  if (!user) {
    sessions.delete(session.id);
    clearAppCookie(res, SESSION_COOKIE);
    return res.json({ authenticated: false });
  }

  return res.json({
    authenticated: true,
    user: publicUser(user),
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt
  });
});

app.post('/api/logout', (req, res) => {
  const session = getSession(req);
  if (session) {
    const csrfToken = req.get('x-csrf-token');
    if (!safeEqual(csrfToken, session.csrfToken)) {
      return sendAuthError(res, 403, 'csrf_failed', 'A solicitação expirou. Atualize a página e tente novamente.');
    }
    sessions.delete(session.id);
  }

  clearAppCookie(res, SESSION_COOKIE);
  clearAppCookie(res, NONCE_COOKIE);
  return res.json({ ok: true });
});

app.use(
  express.static(path.join(__dirname, 'public'), {
    dotfiles: 'deny',
    etag: false,
    lastModified: false,
    setHeaders(res) {
      res.setHeader('Cache-Control', 'no-store');
    }
  })
);

app.use((err, _req, res, _next) => {
  if (err && err.type === 'entity.too.large') {
    return sendAuthError(res, 413, 'request_too_large', 'A solicitação excede o tamanho permitido.');
  }
  if (err instanceof SyntaxError && err.status === 400) {
    return sendAuthError(res, 400, 'invalid_json', 'A solicitação não contém JSON válido.');
  }
  console.error('Erro inesperado ao processar a solicitação.');
  return sendAuthError(res, 500, 'server_error', 'Ocorreu um erro no servidor. Tente novamente.');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Aplicação disponível na porta ${PORT}.`);
  if (!GOOGLE_CLIENT_ID) {
    console.warn('Login inativo: configure GOOGLE_CLIENT_ID no ambiente do servidor.');
  }
});
