const test = require('node:test');
const assert = require('node:assert/strict');

const API_BASE = process.env.API_BASE_URL || 'http://localhost:8080/api/v1';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseCookies = (setCookieHeaders = []) => {
  const parsed = setCookieHeaders.map((cookie) => cookie.split(';')[0]).join('; ');
  console.log('Raw Set-Cookie headers:', setCookieHeaders);
  console.log('Parsed cookie:', parsed);
  return parsed;
};

const request = async ({ path, method = 'GET', body, cookie, csrfToken, stepUpToken }) => {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  if (stepUpToken) headers['X-Step-Up-Token'] = stepUpToken;

  console.log(`Request: ${method} ${path}`);
  console.log('Headers:', headers);
  console.log('Cookie:', cookie);
  console.log('CSRF Token:', csrfToken);

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
  
  console.log('Login response cookie:', response.cookie);
  
  return {
    cookie: response.cookie,
    csrfToken: response.json.data.csrfToken,
    user: response.json.data.user
  };
};

// Test specific scenarios
async function runTests() {
  console.log('Running specific API tests...');
  
  try {
    const admin = await login('admin.dev', 'AdminSecure!2026');
    console.log('✓ Admin login successful');
    console.log('CSRF Token:', admin.csrfToken);
    
    // Test 13: Catalog search without auth
    const catalogSearch = await request({
      path: '/catalog/search?page=1&pageSize=20',
      method: 'GET'
    });
    console.log(`Catalog search status: ${catalogSearch.status}`);
    
    // Test 25: Analytics metric creation
    const metricResult = await request({
      path: '/analytics/metrics',
      method: 'POST',
      cookie: admin.cookie,
      csrfToken: admin.csrfToken,
      body: {
        key: 'test_metric',
        name: 'Test Metric',
        dataset: 'registrations',
        aggregation: 'count'
      }
    });
    console.log(`Metric creation status: ${metricResult.status}`);
    if (metricResult.status !== 201) {
      console.log('Metric creation error:', metricResult.json);
    }
    
    // Test with session cookie verification
    const sessionCheck = await request({
      path: '/auth/me',
      method: 'GET',
      cookie: admin.cookie
    });
    console.log(`Session check status: ${sessionCheck.status}`);
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

runTests().then(() => process.exit(0)).catch(() => process.exit(1));
