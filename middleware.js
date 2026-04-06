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
      :root {
        color-scheme: light;
        --bg-1: #f4f6f6;
        --bg-2: #e9efee;
        --panel: #ffffff;
        --text-1: #172321;
        --text-2: #314643;
        --text-3: #607572;
        --primary-400: #5ab99f;
        --primary-500: #2f9a81;
        --primary-700: #1f6354;
        --danger-bg: #ffe9e7;
        --danger-border: #ffcbc6;
        --danger-text: #af281b;
      }

      @media (prefers-color-scheme: dark) {
        :root {
          color-scheme: dark;
          --bg-1: #101515;
          --bg-2: #17201f;
          --panel: #171f1e;
          --text-1: #ebf4f2;
          --text-2: #bfd0cc;
          --text-3: #8ba09b;
          --danger-bg: rgba(175, 40, 27, 0.18);
          --danger-border: rgba(255, 131, 117, 0.4);
          --danger-text: #ffab9f;
        }
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: "Manrope", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        min-height: 100dvh;
        padding: 24px 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        background:
          radial-gradient(1200px 500px at 80% -10%, rgba(90, 185, 159, 0.3), transparent 70%),
          radial-gradient(900px 420px at -10% 110%, rgba(182, 229, 215, 0.35), transparent 70%),
          linear-gradient(160deg, var(--bg-1), var(--bg-2));
        color: var(--text-1);
      }

      .card {
        width: min(440px, 100%);
        border-radius: 20px;
        padding: 28px 22px;
        background: rgba(255, 255, 255, 0.84);
        border: 1px solid rgba(23, 35, 33, 0.1);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        box-shadow: 0 20px 46px rgba(17, 41, 37, 0.14);
      }

      @media (prefers-color-scheme: dark) {
        .card {
          background: rgba(23, 31, 30, 0.84);
          border-color: rgba(235, 244, 242, 0.12);
          box-shadow: 0 24px 46px rgba(0, 0, 0, 0.35);
        }
      }

      .badge {
        display: inline-flex;
        align-items: center;
        margin-bottom: 12px;
        border-radius: 9999px;
        border: 1px solid rgba(23, 35, 33, 0.1);
        background: rgba(255, 255, 255, 0.6);
        padding: 6px 11px;
        font-size: 12px;
        line-height: 1;
        color: var(--text-3);
      }

      @media (prefers-color-scheme: dark) {
        .badge {
          border-color: rgba(235, 244, 242, 0.12);
          background: rgba(255, 255, 255, 0.05);
        }
      }

      .brand {
        margin: 0;
        font-size: 28px;
        line-height: 1.15;
        font-weight: 800;
        color: transparent;
        background-image: linear-gradient(110deg, #4285f4 0%, #7b61ff 20%, #8e5cff 35%, #ea4335 52%, #fbbc05 74%, #34a853 100%);
        background-size: 220% 220%;
        background-clip: text;
        -webkit-background-clip: text;
        animation: brand-shift 8s ease-in-out infinite;
      }

      h1 {
        margin: 10px 0 0;
        font-size: 22px;
        line-height: 1.25;
        letter-spacing: 0.01em;
      }

      p {
        margin: 10px 0 0;
        color: var(--text-2);
      }

      .error {
        margin: 14px 0 0;
        border-radius: 12px;
        border: 1px solid var(--danger-border);
        background: var(--danger-bg);
        color: var(--danger-text);
        padding: 10px 12px;
        font-weight: 600;
        font-size: 14px;
      }

      form {
        margin-top: 18px;
      }

      input {
        width: 100%;
        border: 1px solid rgba(23, 35, 33, 0.12);
        border-radius: 12px;
        padding: 12px 14px;
        font-size: 16px;
        background: var(--panel);
        color: var(--text-1);
        outline: none;
        transition: border-color 0.2s ease, box-shadow 0.2s ease;
        margin-bottom: 12px;
      }

      input::placeholder {
        color: var(--text-3);
      }

      input:focus {
        border-color: var(--primary-500);
        box-shadow: 0 0 0 3px rgba(90, 185, 159, 0.26);
      }

      @media (prefers-color-scheme: dark) {
        input {
          border-color: rgba(235, 244, 242, 0.15);
        }
      }

      button {
        width: 100%;
        border: 0;
        border-radius: 12px;
        padding: 11px 12px;
        font-size: 16px;
        font-weight: 600;
        background: linear-gradient(145deg, var(--primary-500), var(--primary-700));
        color: white;
        cursor: pointer;
        box-shadow: 0 10px 22px rgba(31, 99, 84, 0.32);
        transition: filter 0.2s ease, transform 0.2s ease;
      }

      button:hover {
        filter: brightness(1.05);
      }

      button:active {
        transform: translateY(1px);
      }

      @keyframes brand-shift {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="badge">Protected Workspace</div>
      <p class="brand">AI Studio</p>
      <h1>Password Required</h1>
      <p>Please enter the access password to continue.</p>
      ${hasError ? '<p class="error" role="alert">Invalid password. Please try again.</p>' : ''}
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
