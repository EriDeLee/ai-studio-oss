const AUTH_COOKIE_NAME = 'auth_token';
const AUTH_PATH = '/__auth';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
let cachedPasswordHash = null;
let cachedPasswordHashSource = null;

const parseCookies = (cookieHeader) => {
  const cookies = {};
  if (!cookieHeader) return cookies;

  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const index = pair.indexOf('=');
    if (index <= 0) continue;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  return cookies;
};

const toHex = (bytes) => {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const sha256Hex = async (value) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return toHex(new Uint8Array(digest));
};

const getPasswordHash = (password) => {
  if (!cachedPasswordHash || cachedPasswordHashSource !== password) {
    cachedPasswordHashSource = password;
    cachedPasswordHash = sha256Hex(password);
  }
  return cachedPasswordHash;
};

const normalizeRedirectPath = (value) => {
  if (!value || !value.startsWith('/')) return '/';
  if (value.startsWith('//') || value.startsWith(AUTH_PATH)) return '/';
  return value;
};

const escapeHtml = (value) => {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
};

const renderLoginHtml = (redirectPath, hasError) => {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Access Protected</title>
    <style>
      :root { color-scheme: light dark; }
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: radial-gradient(circle at top, #f4f8ff, #e7eef9 55%, #dde6f4);
      }
      .card {
        width: min(420px, calc(100vw - 32px));
        padding: 24px;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.9);
        border: 1px solid rgba(20, 20, 40, 0.1);
        box-shadow: 0 16px 32px rgba(16, 30, 60, 0.12);
      }
      h1 { margin: 0 0 10px; font-size: 1.2rem; }
      p { margin: 0 0 16px; color: #485468; }
      .error { color: #b01818; margin: 0 0 12px; font-weight: 600; }
      input {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid #bdc7d8;
        border-radius: 10px;
        padding: 10px 12px;
        font-size: 16px;
        margin-bottom: 12px;
      }
      button {
        width: 100%;
        border: 0;
        border-radius: 10px;
        padding: 10px 12px;
        font-size: 16px;
        background: #2e5fe5;
        color: white;
        cursor: pointer;
      }
      button:hover { filter: brightness(0.95); }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>Password Required</h1>
      <p>Please enter the access password to continue.</p>
      ${hasError ? '<p class="error">Invalid password. Please try again.</p>' : ''}
      <form method="POST" action="${AUTH_PATH}">
        <input type="hidden" name="redirect" value="${escapeHtml(redirectPath)}" />
        <input type="password" name="password" placeholder="Password" required autofocus />
        <button type="submit">Continue</button>
      </form>
    </main>
  </body>
</html>`;
};

const redirectToLogin = (request) => {
  const currentUrl = new URL(request.url);
  const loginUrl = new URL(AUTH_PATH, currentUrl.origin);
  const redirectPath = normalizeRedirectPath(`${currentUrl.pathname}${currentUrl.search}`);
  loginUrl.searchParams.set('redirect', redirectPath);
  return Response.redirect(loginUrl, 302);
};

const createAuthCookieHeader = (value, isHttps) => {
  const parts = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(value)}`,
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];

  if (isHttps) {
    parts.push('Secure');
  }

  return parts.join('; ');
};

const createAuthSuccessResponse = async (request, password, redirectPath) => {
  const url = new URL(request.url);
  const redirectUrl = new URL(normalizeRedirectPath(redirectPath), url.origin);
  const cookieValue = await getPasswordHash(password);
  const headers = new Headers({ Location: redirectUrl.toString() });
  headers.append('Set-Cookie', createAuthCookieHeader(cookieValue, url.protocol === 'https:'));
  return new Response(null, { status: 302, headers });
};

export default async function middleware(request) {
  const password = process.env.PASSWORD;
  if (!password) {
    return new Response('Server misconfigured: missing PASSWORD env variable.', { status: 500 });
  }

  const url = new URL(request.url);

  if (url.pathname === AUTH_PATH) {
    if (request.method === 'GET' || request.method === 'HEAD') {
      const redirectPath = normalizeRedirectPath(url.searchParams.get('redirect') ?? '/');
      const hasError = url.searchParams.get('error') === '1';
      return new Response(renderLoginHtml(redirectPath, hasError), {
        status: hasError ? 401 : 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    }

    if (request.method === 'POST') {
      const form = await request.formData();
      const inputPassword = String(form.get('password') ?? '');
      const redirectPath = normalizeRedirectPath(String(form.get('redirect') ?? '/'));

      if (inputPassword === password) {
        return createAuthSuccessResponse(request, password, redirectPath);
      }

      const loginUrl = new URL(AUTH_PATH, url.origin);
      loginUrl.searchParams.set('redirect', redirectPath);
      loginUrl.searchParams.set('error', '1');
      return Response.redirect(loginUrl, 302);
    }

    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'GET, HEAD, POST' },
    });
  }

  const cookies = parseCookies(request.headers.get('cookie') ?? '');
  const authCookie = cookies[AUTH_COOKIE_NAME];
  const expectedCookie = await getPasswordHash(password);
  if (authCookie === expectedCookie) {
    return;
  }

  return redirectToLogin(request);
}

export const config = {
  matcher: '/:path*',
};
