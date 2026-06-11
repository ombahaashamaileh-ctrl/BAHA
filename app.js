/* ═══════════════════════════════════════════════════════════════
   مساعد أسعار المنتجات — app.js
   Google Drive API + Google Identity Services + OAuth 2.0
═══════════════════════════════════════════════════════════════ */

// ──────────────────────────────────────────────
// ⚙️  CONFIG  ← ضع Client ID هنا
// ──────────────────────────────────────────────
const CONFIG = {
  CLIENT_ID: '632630557064-cmf14at54ta4a2j0ls0ske386tgepspk.apps.googleusercontent.com',   // 🔴 ضع Client ID هنا
  SCOPES: 'https://www.googleapis.com/auth/drive.file',
  APP_FOLDER_NAME: 'ProductPriceAssistant',
  JSON_FILE_NAME: 'products.json',
  DISCOVERY_DOCS: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
};

// ──────────────────────────────────────────────
// 🌐  STATE
// ──────────────────────────────────────────────
const STATE = {
  user: null,
  accessToken: null,
  tokenClient: null,
  gapiReady: false,
  folderId: null,
  jsonFileId: null,
  products: [],
  editingProductId: null,
  deletingProductId: null,
  cameraStream: null,
  cameraActive: false,
  searchImageDataUrl: null,
};

// ──────────────────────────────────────────────
// 🛠  DOM HELPERS
// ──────────────────────────────────────────────
const $ = id => document.getElementById(id);
const setScreen = id => {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
};
const setPage = name => {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  $(`page-${name}`).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === name);
  });
  const titles = {
    dashboard: 'لوحة التحكم',
    add: 'إضافة منتج جديد',
    search: 'البحث بالصورة',
    manage: 'إدارة المنتجات',
  };
  $('page-title').textContent = titles[name] || name;
  if (name !== 'search') stopCamera();
};

function showLoading(text = 'جارٍ التحميل...') {
  $('loading-text').textContent = text;
  $('loading-overlay').style.display = 'flex';
}
function hideLoading() {
  $('loading-overlay').style.display = 'none';
}

function toast(msg, type = 'info', duration = 3500) {
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
  $('toast-container').appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 350);
  }, duration);
}

function setSyncStatus(status, text) {
  const el = $('sync-status');
  el.className = `sync-status ${status}`;
  el.textContent = text;
}

// ──────────────────────────────────────────────
// 🔑  AUTH & GAPI INIT
// ──────────────────────────────────────────────
function waitForScripts() {
  return new Promise(resolve => {
    const check = () => {
      if (window.gapi && window.google) { resolve(); return; }
      setTimeout(check, 200);
    };
    check();
  });
}

async function initApp() {
  await waitForScripts();

  // Initialise GAPI client
  await new Promise((res, rej) => {
    gapi.load('client', { callback: res, onerror: rej });
  });

  await gapi.client.init({
    apiKey: '',
    discoveryDocs: CONFIG.DISCOVERY_DOCS,
  });

  STATE.gapiReady = true;

  // Initialise GIS token client
  STATE.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: CONFIG.SCOPES,
    prompt: '',
    callback: onTokenResponse,
  });

  // UI event bindings
  bindUI();

  // Check stored session
  const stored = sessionStorage.getItem('ppa_token');
  if (stored) {
    const tok = JSON.parse(stored);
    STATE.accessToken = tok.access_token;
    gapi.client.setToken(tok);
    try {
      await loadUserProfile();
      await setupDrive();
      await loadProducts();
      showApp();
    } catch {
      sessionStorage.removeItem('ppa_token');
      setScreen('screen-login');
    }
  } else {
    setScreen('screen-login');
  }
}

function onTokenResponse(resp) {
  if (resp.error) {
    hideLoading();
    toast('فشل تسجيل الدخول: ' + resp.error, 'error');
    return;
  }
  STATE.accessToken = resp.access_token;
  gapi.client.setToken(resp);
  sessionStorage.setItem('ppa_token', JSON.stringify(resp));
  afterLogin();
}

async function afterLogin() {
  showLoading('جارٍ تسجيل الدخول...');
  try {
    await loadUserProfile();
    hideLoading();
    setScreen('screen-setup');
    await runDriveSetup();
  } catch (e) {
    hideLoading();
    toast('حدث خطأ أثناء تسجيل الدخول', 'error');
    console.error(e);
  }
}

async function loadUserProfile() {
  const resp = await fetch(
    'https://www.googleapis.com/oauth2/v2/userinfo',
    { headers: { Authorization: `Bearer ${STATE.accessToken}` } }
  );
  if (!resp.ok) throw new Error('profile fetch failed');
  STATE.user = await resp.json();
  updateUserUI();
}

function updateUserUI() {
  if (!STATE.user) return;
  const u = STATE.user;
  ['user-name'].forEach(id => { if ($(id)) $(id).textContent = u.name || ''; });
  $('user-email').textContent = u.email || '';
  ['user-avatar', 'topbar-avatar'].forEach(id => {
    if ($(id) && u.picture) { $(id).src = u.picture; $(id).style.display = 'block'; }
  });
}

// ──────────────────────────────────────────────
// ☁️  DRIVE SETUP
// ──────────────────────────────────────────────
async function runDriveSetup() {
  try {
    setStepActive('step-auth');
    await delay(400);
    setStepDone('step-auth');

    setStepActive('step-folder');
    await ensureFolder();
    setStepDone('step-folder');

    setStepActive('step-json');
    await ensureJsonFile();
    setStepDone('step-json');

    await delay(500);
    await loadProducts();
    showApp();
  } catch (e) {
    toast('فشل إعداد Drive: ' + e.message, 'error');
    console.error(e);
  }
}

async function setupDrive() {
  await ensureFolder();
  await ensureJsonFile();
}

async function ensureFolder() {
  const resp = await driveList({
    q: `name='${CONFIG.APP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id,name)',
  });
  if (resp.files.length > 0) {
    STATE.folderId = resp.files[0].id;
  } else {
    const folder = await driveCreate({
      name: CONFIG.APP_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    });
    STATE.folderId = folder.id;
  }
}

async function ensureJsonFile() {
  const resp = await driveList({
    q: `name='${CONFIG.JSON_FILE_NAME}' and '${STATE.folderId}' in parents and trashed=false`,
    fields: 'files(id,name)',
  });
  if (resp.files.length > 0) {
    STATE.jsonFileId = resp.files[0].id;
  } else {
    const file = await uploadJson([], null);
    STATE.jsonFileId = file.id;
  }
}

// ──────────────────────────────────────────────
// 📦  PRODUCTS CRUD
// ──────────────────────────────────────────────
async function loadProducts() {
  if (!STATE.jsonFileId) return;
  setSyncStatus('syncing', '⟳ تحميل...');
  try {
    const data = await driveDownload(STATE.jsonFileId);
    STATE.products = JSON.parse(data) || [];
    renderAll();
    setSyncStatus('synced', '✓ محدّث');
  } catch (e) {
    STATE.products = [];
    setSyncStatus('', '');
    console.error('load products', e);
  }
}

async function saveProducts() {
  setSyncStatus('syncing', '⟳ حفظ...');
  try {
    await uploadJson(STATE.products, STATE.jsonFileId);
    setSyncStatus('synced', '✓ تم الحفظ');
  } catch (e) {
    setSyncStatus('', '');
    throw e;
  }
}

async function addProduct(name, price, imageFile) {
  let imageUrl = '';
  let imageFileId = '';

  if (imageFile) {
    showLoading('جارٍ رفع الصورة...');
    const uploaded = await uploadImage(imageFile, STATE.folderId);
    imageFileId = uploaded.id;
    imageUrl = `https://drive.google.com/uc?export=view&id=${uploaded.id}`;
  }

  const product = {
    id: generateId(),
    name,
    price: parseFloat(price),
    imageUrl,
    imageFileId,
    imageDataUrl: imageFile ? await fileToDataUrl(imageFile) : '',
    addedAt: new Date().toISOString(),
  };

  STATE.products.unshift(product);
  showLoading('جارٍ حفظ البيانات...');
  await saveProducts();
  hideLoading();
  return product;
}

async function updateProduct(id, name, price, imageFile) {
  const idx = STATE.products.findIndex(p => p.id === id);
  if (idx === -1) throw new Error('المنتج غير موجود');

  const product = { ...STATE.products[idx], name, price: parseFloat(price) };

  if (imageFile) {
    showLoading('جارٍ رفع الصورة...');
    if (product.imageFileId) {
      try { await driveDelete(product.imageFileId); } catch {}
    }
    const uploaded = await uploadImage(imageFile, STATE.folderId);
    product.imageFileId = uploaded.id;
    product.imageUrl = `https://drive.google.com/uc?export=view&id=${uploaded.id}`;
    product.imageDataUrl = await fileToDataUrl(imageFile);
  }

  product.updatedAt = new Date().toISOString();
  STATE.products[idx] = product;
  showLoading('جارٍ حفظ التعديلات...');
  await saveProducts();
  hideLoading();
}

async function deleteProduct(id) {
  const idx = STATE.products.findIndex(p => p.id === id);
  if (idx === -1) return;
  const product = STATE.products[idx];
  if (product.imageFileId) {
    try { await driveDelete(product.imageFileId); } catch {}
  }
  STATE.products.splice(idx, 1);
  showLoading('جارٍ حذف المنتج...');
  await saveProducts();
  hideLoading();
}

// ──────────────────────────────────────────────
// 🔍  IMAGE SEARCH (pixel-comparison)
// ──────────────────────────────────────────────
async function searchByImage(queryDataUrl) {
  if (STATE.products.length === 0) return null;

  showLoading('جارٍ مقارنة الصور...');

  const queryFeatures = await extractImageFeatures(queryDataUrl);
  let bestScore = 0;
  let bestProduct = null;

  for (const product of STATE.products) {
    if (!product.imageDataUrl) continue;
    try {
      const features = await extractImageFeatures(product.imageDataUrl);
      const score = compareFeatures(queryFeatures, features);
      if (score > bestScore) {
        bestScore = score;
        bestProduct = product;
      }
    } catch (e) {
      console.warn('compare error', e);
    }
  }

  hideLoading();

  const THRESHOLD = 0.60;
  if (bestProduct && bestScore >= THRESHOLD) {
    return { product: bestProduct, score: bestScore };
  }
  return null;
}

async function extractImageFeatures(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const SIZE = 16;
      const canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      const d = ctx.getImageData(0, 0, SIZE, SIZE).data;
      const hist = new Array(64).fill(0);
      for (let i = 0; i < d.length; i += 4) {
        const r = Math.floor(d[i]   / 64);
        const g = Math.floor(d[i+1] / 64);
        const b = Math.floor(d[i+2] / 64);
        hist[r * 16 + g * 4 + b]++;
      }
      const total = SIZE * SIZE;
      resolve(hist.map(v => v / total));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function compareFeatures(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

// ──────────────────────────────────────────────
// 📤📥  BACKUP
// ──────────────────────────────────────────────
function exportBackup() {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    user: STATE.user?.email,
    products: STATE.products,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ProductPriceAssistant_backup_${dateStr()}.json`;
  a.click();
  toast('تم تصدير النسخة الاحتياطية ✓', 'success');
}

async function importBackup(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data.products)) throw new Error('ملف غير صالح');
    const confirmed = confirm(`سيتم استيراد ${data.products.length} منتج. هل تريد المتابعة؟`);
    if (!confirmed) return;
    STATE.products = data.products;
    showLoading('جارٍ حفظ البيانات...');
    await saveProducts();
    hideLoading();
    renderAll();
    toast(`تم استيراد ${data.products.length} منتج بنجاح ✓`, 'success');
  } catch (e) {
    hideLoading();
    toast('فشل الاستيراد: ' + e.message, 'error');
  }
}

// ──────────────────────────────────────────────
// 🎨  RENDER
// ──────────────────────────────────────────────
function renderAll() {
  renderDashboard();
  renderManage();
  updateStats();
}

function updateStats() {
  const now = new Date();
  const today = dateStr(now);
  const weekAgo = new Date(now - 7 * 86400000);

  $('stat-total').textContent = STATE.products.length;
  $('stat-today').textContent = STATE.products.filter(p => p.addedAt?.startsWith(today)).length;
  $('stat-week').textContent  = STATE.products.filter(p => new Date(p.addedAt) >= weekAgo).length;
}

function renderDashboard() {
  const container = $('recent-products');
  const empty     = $('dashboard-empty');
  const recent = STATE.products.slice(0, 8);

  if (recent.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';
  container.innerHTML = recent.map(p => productCardHTML(p, false)).join('');
}

function renderManage(filter = '') {
  const container = $('manage-products-grid');
  const empty     = $('manage-empty');
  const filtered  = filter
    ? STATE.products.filter(p => p.name.toLowerCase().includes(filter.toLowerCase()))
    : STATE.products;

  if (filtered.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';
  container.innerHTML = filtered.map(p => productCardHTML(p, true)).join('');
  bindCardButtons();
}

function productCardHTML(p, showActions) {
  const img = p.imageDataUrl || p.imageUrl;
  const imgEl = img
    ? `<img class="product-card-img" src="${img}" alt="${escHtml(p.name)}" loading="lazy" />`
    : `<div class="product-card-img-placeholder">📦</div>`;

  const actions = showActions ? `
    <div class="product-card-actions">
      <button class="btn-card-edit" data-id="${p.id}">✏️ تعديل</button>
      <button class="btn-card-delete" data-id="${p.id}">🗑️ حذف</button>
    </div>` : '';

  return `
    <div class="product-card" data-id="${p.id}">
      ${imgEl}
      <div class="product-card-body">
        <div class="product-card-name">${escHtml(p.name)}</div>
        <div class="product-card-price">${formatPrice(p.price)} <span class="product-card-price-unit">ر.س</span></div>
        <div class="product-card-date">${formatDate(p.addedAt)}</div>
      </div>
      ${actions}
    </div>`;
}

function bindCardButtons() {
  document.querySelectorAll('.btn-card-edit').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openEditModal(btn.dataset.id);
    });
  });
  document.querySelectorAll('.btn-card-delete').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openDeleteModal(btn.dataset.id);
    });
  });
}

// ──────────────────────────────────────────────
// ✏️  EDIT MODAL
// ──────────────────────────────────────────────
function openEditModal(id) {
  const p = STATE.products.find(p => p.id === id);
  if (!p) return;
  STATE.editingProductId = id;

  $('edit-name').value  = p.name;
  $('edit-price').value = p.price;

  const previewEl = $('edit-image-preview');
  const src = p.imageDataUrl || p.imageUrl;
  if (src) {
    previewEl.src = src;
    previewEl.style.display = 'block';
    previewEl.classList.add('visible');
  } else {
    previewEl.style.display = 'none';
  }

  $('edit-image-input').value = '';
  $('modal-edit').style.display = 'flex';
}

function closeEditModal() {
  $('modal-edit').style.display = 'none';
  STATE.editingProductId = null;
}

// ──────────────────────────────────────────────
// 🗑️  DELETE MODAL
// ──────────────────────────────────────────────
function openDeleteModal(id) {
  STATE.deletingProductId = id;
  $('modal-delete').style.display = 'flex';
}

function closeDeleteModal() {
  $('modal-delete').style.display = 'none';
  STATE.deletingProductId = null;
}

// ──────────────────────────────────────────────
// 📷  CAMERA
// ──────────────────────────────────────────────
async function startCamera() {
  const area = $('camera-area');
  area.innerHTML = '';
  area.innerHTML = `
    <video id="camera-feed" autoplay playsinline></video>
    <button id="btn-capture" class="btn-capture">
      <span class="capture-ring"></span>
      <span class="capture-dot"></span>
    </button>`;

  $('btn-capture').addEventListener('click', capturePhoto);

  try {
    STATE.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    $('camera-feed').srcObject = STATE.cameraStream;
    STATE.cameraActive = true;
  } catch (e) {
    area.innerHTML = `
      <div class="camera-placeholder">
        <span class="cam-icon">📷</span>
        <p>تعذّر الوصول إلى الكاميرا</p>
        <small>${e.message}</small>
      </div>`;
    toast('تعذّر الوصول إلى الكاميرا', 'warning');
  }
}

function stopCamera() {
  if (STATE.cameraStream) {
    STATE.cameraStream.getTracks().forEach(t => t.stop());
    STATE.cameraStream = null;
    STATE.cameraActive = false;
  }
}

function capturePhoto() {
  const video = $('camera-feed');
  if (!video || !STATE.cameraActive) return;
  const canvas = $('capture-canvas');
  canvas.width  = video.videoWidth  || 640;
  canvas.height = video.videoHeight || 480;
  canvas.getContext('2d').drawImage(video, 0, 0);
  STATE.searchImageDataUrl = canvas.toDataURL('image/jpeg', 0.85);
  stopCamera();
  showSearchPreview(STATE.searchImageDataUrl);
  $('btn-do-search').style.display = 'flex';
}

function showSearchPreview(dataUrl) {
  const area = $('camera-area');
  area.style.aspectRatio = 'auto';
  area.innerHTML = `<img src="${dataUrl}" style="width:100%;border-radius:var(--radius);max-height:280px;object-fit:contain;" />`;
}

// ──────────────────────────────────────────────
// 🖼  IMAGE UPLOAD HELPERS
// ──────────────────────────────────────────────
function setupImageInput(inputId, previewId, clearBtnId, placeholderId) {
  const input   = $(inputId);
  const preview = $(previewId);
  const clear   = clearBtnId ? $(clearBtnId) : null;
  const ph      = placeholderId ? $(placeholderId) : null;

  if (!input) return;

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      preview.src = e.target.result;
      preview.style.display = 'block';
      preview.classList.add('visible');
      if (ph) ph.style.display = 'none';
      if (clear) clear.style.display = 'block';
    };
    reader.readAsDataURL(file);
  });

  if (clear) {
    clear.addEventListener('click', () => {
      input.value = '';
      preview.src = '';
      preview.style.display = 'none';
      preview.classList.remove('visible');
      if (ph) ph.style.display = 'flex';
      clear.style.display = 'none';
    });
  }
}

// ──────────────────────────────────────────────
// 🌐  DRIVE API WRAPPERS
// ──────────────────────────────────────────────
async function driveList(params) {
  const r = await gapi.client.drive.files.list(params);
  return r.result;
}

async function driveCreate(meta) {
  const r = await gapi.client.drive.files.create({
    resource: meta,
    fields: 'id,name',
  });
  return r.result;
}

async function driveDelete(fileId) {
  await gapi.client.drive.files.delete({ fileId });
}

async function driveDownload(fileId) {
  const r = await gapi.client.drive.files.get({ fileId, alt: 'media' });
  return typeof r.body === 'string' ? r.body : JSON.stringify(r.result);
}

async function uploadJson(data, existingId) {
  const body = JSON.stringify(data);
  const blob = new Blob([body], { type: 'application/json' });

  const token = STATE.accessToken;
  const boundary = '-------3141592653589793';
  const delimiter = '\r\n--' + boundary + '\r\n';
  const closeDelim = '\r\n--' + boundary + '--';

  const meta = {
    name: CONFIG.JSON_FILE_NAME,
    mimeType: 'application/json',
    ...(existingId ? {} : { parents: [STATE.folderId] }),
  };

  const multipart =
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(meta) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    body +
    closeDelim;

  const method  = existingId ? 'PATCH' : 'POST';
  const urlBase = 'https://www.googleapis.com/upload/drive/v3/files';
  const url     = existingId
    ? `${urlBase}/${existingId}?uploadType=multipart&fields=id`
    : `${urlBase}?uploadType=multipart&fields=id`;

  const resp = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary="${boundary}"`,
    },
    body: multipart,
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error('Upload JSON failed: ' + err);
  }
  return resp.json();
}

async function uploadImage(file, folderId) {
  const token = STATE.accessToken;
  const boundary = '-------3141592653589793';
  const delimiter = '\r\n--' + boundary + '\r\n';
  const closeDelim = '\r\n--' + boundary + '--';

  const base64 = await fileToBase64(file);
  const meta = {
    name: `img_${Date.now()}_${file.name}`,
    parents: [folderId],
  };

  const multipart =
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(meta) +
    delimiter +
    `Content-Type: ${file.type}\r\nContent-Transfer-Encoding: base64\r\n\r\n` +
    base64 +
    closeDelim;

  const resp = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`,
      },
      body: multipart,
    }
  );

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error('Upload image failed: ' + err);
  }
  return resp.json();
}

// ──────────────────────────────────────────────
// 🛠  UTILITIES
// ──────────────────────────────────────────────
function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function fileToDataUrl(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = e => res(e.target.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = e => res(e.target.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function formatPrice(price) {
  return parseFloat(price || 0).toLocaleString('ar-SA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('ar-SA', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function dateStr(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function escHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[m]));
}

function setStepActive(id) {
  const el = $(id);
  el.classList.add('active');
  el.classList.remove('done');
}
function setStepDone(id) {
  const el = $(id);
  el.classList.remove('active');
  el.classList.add('done');
  el.querySelector('.step-dot').textContent = '';
  el.querySelector('.step-dot').style.background = '#10B981';
}

function showApp() {
  setScreen('screen-app');
  setPage('dashboard');
}

// ──────────────────────────────────────────────
// 🔌  UI EVENT BINDINGS
// ──────────────────────────────────────────────
function bindUI() {
  // ── Login
  $('btn-google-login').addEventListener('click', () => {
    if (CONFIG.CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID_HERE') {
      toast('⚠️ يرجى وضع Google Client ID في CONFIG بداية ملف app.js', 'error', 6000);
      return;
    }
    STATE.tokenClient.requestAccessToken({ prompt: 'consent' });
  });

  // ── Drive setup
  $('btn-setup-drive').addEventListener('click', runDriveSetup);

  // ── Nav items
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      const page = el.dataset.page;
      setPage(page);
      closeSidebar();
      if (page === 'search') startCamera();
    });
  });

  // ── Sidebar
  $('btn-open-sidebar').addEventListener('click', openSidebar);
  $('btn-close-sidebar').addEventListener('click', closeSidebar);
  $('sidebar-overlay').addEventListener('click', closeSidebar);

  // ── Add product form
  setupImageInput('product-image-input', 'image-preview', 'btn-clear-image', 'upload-placeholder');

  $('btn-save-product').addEventListener('click', async () => {
    const name  = $('product-name').value.trim();
    const price = $('product-price').value.trim();

    if (!name)  { toast('يرجى إدخال اسم المنتج', 'warning'); return; }
    if (!price) { toast('يرجى إدخال السعر', 'warning'); return; }

    const file = $('product-image-input').files[0] || null;

    $('save-btn-text').style.display    = 'none';
    $('save-btn-spinner').style.display = 'inline-block';
    $('btn-save-product').disabled = true;

    try {
      await addProduct(name, price, file);
      toast('✅ تم حفظ المنتج بنجاح', 'success');
      $('product-name').value  = '';
      $('product-price').value = '';
      $('product-image-input').value = '';
      $('image-preview').src = '';
      $('image-preview').style.display = 'none';
      $('image-preview').classList.remove('visible');
      $('upload-placeholder').style.display = 'flex';
      $('btn-clear-image').style.display = 'none';
      renderAll();
    } catch (e) {
      toast('فشل الحفظ: ' + e.message, 'error');
    } finally {
      $('save-btn-text').style.display    = 'inline';
      $('save-btn-spinner').style.display = 'none';
      $('btn-save-product').disabled = false;
    }
  });

  // ── Search page
  $('btn-camera-opt').addEventListener('click', () => {
    $('btn-camera-opt').classList.add('active');
    $('btn-upload-opt').classList.remove('active');
    $('camera-area').style.display = 'block';
    $('upload-search-area').style.display = 'none';
    $('btn-do-search').style.display = 'none';
    STATE.searchImageDataUrl = null;
    startCamera();
  });

  $('btn-upload-opt').addEventListener('click', () => {
    $('btn-upload-opt').classList.add('active');
    $('btn-camera-opt').classList.remove('active');
    $('camera-area').style.display = 'none';
    $('upload-search-area').style.display = 'flex';
    $('btn-do-search').style.display = 'none';
    STATE.searchImageDataUrl = null;
    stopCamera();
  });

  setupImageInput('search-image-input', 'search-preview', null, null);

  $('search-image-input').addEventListener('change', () => {
    const file = $('search-image-input').files[0];
    if (file) {
      fileToDataUrl(file).then(url => {
        STATE.searchImageDataUrl = url;
        $('btn-do-search').style.display = 'flex';
      });
    }
  });

  $('btn-do-search').addEventListener('click', async () => {
    if (!STATE.searchImageDataUrl) { toast('اختر صورة أولاً', 'warning'); return; }

    $('search-btn-text').style.display    = 'none';
    $('search-btn-spinner').style.display = 'inline-block';
    $('btn-do-search').disabled = true;

    try {
      const result = await searchByImage(STATE.searchImageDataUrl);
      showSearchResult(result);
    } catch (e) {
      toast('خطأ أثناء البحث: ' + e.message, 'error');
    } finally {
      $('search-btn-text').style.display    = 'inline';
      $('search-btn-spinner').style.display = 'none';
      $('btn-do-search').disabled = false;
    }
  });

  function resetSearch() {
    $('search-result').style.display = 'none';
    STATE.searchImageDataUrl = null;
    $('btn-do-search').style.display = 'none';
    if ($('btn-camera-opt').classList.contains('active')) {
      startCamera();
    } else {
      $('search-image-input').value = '';
      const prev = $('search-preview');
      if (prev) { prev.src = ''; prev.style.display = 'none'; }
    }
  }

  $('btn-search-again').addEventListener('click', resetSearch);
  $('btn-search-again2').addEventListener('click', resetSearch);

  // ── Manage search filter
  $('manage-search').addEventListener('input', () => {
    renderManage($('manage-search').value);
  });

  // ── Edit modal
  setupImageInput('edit-image-input', 'edit-image-preview', null, null);

  $('btn-close-modal').addEventListener('click', closeEditModal);
  $('btn-cancel-edit').addEventListener('click', closeEditModal);

  $('btn-change-img').addEventListener('click', () => {
    $('edit-image-input').click();
  });

  $('btn-save-edit').addEventListener('click', async () => {
    const name  = $('edit-name').value.trim();
    const price = $('edit-price').value.trim();

    if (!name)  { toast('يرجى إدخال الاسم', 'warning'); return; }
    if (!price) { toast('يرجى إدخال السعر', 'warning'); return; }

    const file = $('edit-image-input').files[0] || null;
    $('edit-btn-text').style.display    = 'none';
    $('edit-btn-spinner').style.display = 'inline-block';
    $('btn-save-edit').disabled = true;

    try {
      await updateProduct(STATE.editingProductId, name, price, file);
      toast('✅ تم حفظ التعديلات', 'success');
      closeEditModal();
      renderAll();
    } catch (e) {
      toast('فشل التعديل: ' + e.message, 'error');
    } finally {
      $('edit-btn-text').style.display    = 'inline';
      $('edit-btn-spinner').style.display = 'none';
      $('btn-save-edit').disabled = false;
    }
  });

  // ── Delete modal
  $('btn-confirm-delete').addEventListener('click', async () => {
    if (!STATE.deletingProductId) return;
    try {
      showLoading('جارٍ حذف المنتج...');
      await deleteProduct(STATE.deletingProductId);
      toast('تم حذف المنتج', 'info');
      closeDeleteModal();
      renderAll();
    } catch (e) {
      hideLoading();
      toast('فشل الحذف: ' + e.message, 'error');
    }
  });

  $('btn-cancel-delete').addEventListener('click', closeDeleteModal);

  // ── Close modals on overlay click
  $('modal-edit').addEventListener('click', e => { if (e.target === $('modal-edit')) closeEditModal(); });
  $('modal-delete').addEventListener('click', e => { if (e.target === $('modal-delete')) closeDeleteModal(); });

  // ── Backup
  $('btn-export').addEventListener('click', exportBackup);

  $('btn-import-trigger').addEventListener('click', () => {
    $('import-file-input').click();
  });
  $('import-file-input').addEventListener('change', () => {
    const file = $('import-file-input').files[0];
    if (file) importBackup(file);
    $('import-file-input').value = '';
  });

  // ── Logout
  $('btn-logout').addEventListener('click', () => {
    const confirmed = confirm('هل تريد تسجيل الخروج؟');
    if (!confirmed) return;
    google.accounts.oauth2.revoke(STATE.accessToken, () => {});
    sessionStorage.removeItem('ppa_token');
    gapi.client.setToken(null);
    STATE.accessToken = null;
    STATE.user = null;
    STATE.products = [];
    STATE.folderId = null;
    STATE.jsonFileId = null;
    stopCamera();
    setScreen('screen-login');
  });
}

// ──────────────────────────────────────────────
// 🔍  SEARCH RESULT DISPLAY
// ──────────────────────────────────────────────
function showSearchResult(result) {
  $('search-result').style.display = 'block';
  $('search-result').scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (result) {
    const { product, score } = result;
    $('result-found').style.display    = 'block';
    $('result-not-found').style.display = 'none';

    const imgSrc = product.imageDataUrl || product.imageUrl;
    $('result-img').src    = imgSrc || '';
    $('result-img').style.display = imgSrc ? 'block' : 'none';
    $('result-name').textContent  = product.name;
    $('result-price').textContent = formatPrice(product.price);
    $('result-date').textContent  = 'أضيف: ' + formatDate(product.addedAt);
    $('result-score').textContent = Math.round(score * 100) + '%';
  } else {
    $('result-found').style.display    = 'none';
    $('result-not-found').style.display = 'block';
  }
}

// ──────────────────────────────────────────────
// 📱  SIDEBAR (mobile)
// ──────────────────────────────────────────────
function openSidebar() {
  $('sidebar').classList.add('open');
  $('sidebar-overlay').classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  $('sidebar').classList.remove('open');
  $('sidebar-overlay').classList.remove('visible');
  document.body.style.overflow = '';
}

// ──────────────────────────────────────────────
// 🚀  BOOT
// ──────────────────────────────────────────────
window.addEventListener('load', () => {
  initApp().catch(e => {
    console.error('initApp failed:', e);
    toast('حدث خطأ في تهيئة التطبيق', 'error');
    setScreen('screen-login');
  });
});
