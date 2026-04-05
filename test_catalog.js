const test = require('node:test');
const assert = require('node:assert/strict');

const API_BASE = process.env.API_BASE_URL || 'http://localhost:8080/api/v1';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseCookies = (setCookieHeaders = []) =>
  setCookieHeaders.map((cookie) => cookie.split(';')[0]).join('; ');

const request = async ({ path, method = 'GET', body, cookie, csrfToken, stepUpToken }) => {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  if (stepUpToken) headers['X-Step-Up-Token'] = stepUpToken;

  const response = await fetch(`${API_BASE}${path}`,
    { method, headers, body: body ? JSON.stringify(body) : undefined }
  );

  const setCookie = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  const text = await response.text();
  let json = null;
  if (text) {
    try { json = JSON.parse(text); } catch (error) { json = { raw: text }; }
  }

  return { status: response.status, json, cookie: parseCookies(setCookie) };
};

const login = async (username, password) => {
  const response = await request({
    path: '/auth/login',
    method: 'POST',
    body: { username, password }
  });
  assert.equal(response.status, 200, `login failed for ${username}: ${response.json?.error?.message}`);
  return {
    cookie: response.cookie,
    csrfToken: response.json.data.csrfToken,
    user: response.json.data.user
  };
};

async function testCatalogPageSize() {
  console.log('Testing catalog page size validation...');
  
  try {
    const curator = await login('curator.dev', 'CuratorSecure!2026');
    
    // Test max allowed page size (should be 200)
    const maxAllowedPage = await request({
      path: '/catalog/search?q=Route&page=1&pageSize=51',
      method: 'GET'
    });
    console.log(`Max allowed page (51) status: ${maxAllowedPage.status}`);
    
    // Test too large page size (should be 400)
    const tooLargePage = await request({
      path: '/catalog/search?q=Route&page=1&pageSize=52',
      method: 'GET'
    });
    console.log(`Too large page (52) status: ${tooLargePage.status}`);
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testCatalogPageSize().then(() => process.exit(0)).catch(() => process.exit(1));
