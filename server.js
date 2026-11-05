require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 8080;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Av98012@12'; // Change in production
const ADMIN_ACTOR = process.env.ADMIN_ACTOR || 'admin@tembisa-midrand';

// ==========================================
// 1. FILE STORAGE SETUP
// ==========================================
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (err) {}
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'img-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// ==========================================
// 2. DATABASE SETUP
// ==========================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const sessions = new Map();

// ==========================================
// 3. LOCATIONS & PROPERTY TYPES
// ==========================================
const PROPERTY_TYPES = ['bachelor', 'cottage', 'backroom', 'flat', 'house'];
const PROPERTY_TYPE_LABELS = {
  bachelor: 'Bachelor',
  cottage: 'Cottage',
  backroom: 'Backroom',
  flat: 'Flat',
  house: 'House'
};

const TEMBISA_TOWNSHIPS = [
  'Ecaleni','Ehlanzeni','Elindinga','Emangweni','Emfihlweni','Emkatini','Emoyeni',
  'Endayini','Endulweni','Entshonalanga','Esangweni','Esiziba','Esselen Park','Ethafeni',
  'Hospital View','Hospital Hill','Ibaxa','Ibazelo','Igqagqa','Ililiba','Inxiweni',
  'Isekelo','Isiphetweni','Isithame','Isivana','Jiyana','Khatamping','Kopanong',
  'Leboeng','Lekaneng','Lifateng','Makulong','Maokeng','Mashimong','Moedi','Moriting',
  'Moteong','Motsu','Mpho','Mqantsa','Phomolong','Sedibeng','Seotloana','Sethokga',
  'Teanong','Temong','Thiteng','Tlamatlama','Tsenolong','Tsepo','Umfuyaneni',
  'Umonjaneni','Umthambeka','Vusimuzi','Welomlambo','Winnie Mandela','Witfontein','Xubene',
  'Extension 1','Extension 2','Extension 3','Extension 4','Extension 5','Extension 6',
  'Extension 7','Extension 8','Extension 9','Extension 10','Extension 11','Extension 12',
  'Extension 13','Extension 14','Extension 15','Extension 16','Extension 17','Extension 18',
  'Extension 19','Extension 20','Extension 21','Extension 22','Extension 23','Extension 24',
  'Extension 25','Extension 26','Extension 27',
  'Winnie Mandela Ext 1','Winnie Mandela Ext 2','Winnie Mandela Ext 3','Winnie Mandela Ext 4','Winnie Mandela Ext 5',
  'Ivory Park','Ivory Park Ext 1','Ivory Park Ext 2','Ivory Park Ext 3','Ivory Park Ext 4',
  'Ebony Park','Ebony Park Ext 1','Ebony Park Ext 2',
  'Rabie Ridge','Rabie Ridge Ext 1','Rabie Ridge Ext 2','Rabie Ridge Ext 3','Rabie Ridge Ext 4','Rabie Ridge Ext 5',
  'Kaalfontein','Kaalfontein Ext 1','Kaalfontein Ext 2','Kaalfontein Ext 3','Kaalfontein Ext 4',
  'Mayibuye','Clayville','Olifantsfontein','Klipfontein View'
];

const MIDRAND_TOWNSHIPS = [
  'Allandale','Austin View','Barbeque Downs','Beaulieu','Beverley','Blue Hills','Bridle Park',
  'Buccleuch','Carlswald','Carlswald North','Chartwell','Commercia','Country View',
  'Crowthorne','Diepsloot','Ebony Park','Erand','Glen Austin','Glenferness','Grand Central',
  'Halfway Gardens','Halfway House','Headway Hill','Ivory Park','Jukskei View','Kaalfontein',
  'Kyalami','Kyalami Hills','Kyalami Heights','Kyalami Gardens','Kyalami Park','Mayibuye',
  'Midridge Park','Noordwyk','Plooysville','President Park','Rabie Ridge','Randjesfontein',
  'Randjespark','Sagewood','Summerset','Tanganani','Vorna Valley','Waterval','Willaway',
  'Witpoort','Zevenfontein',
  'Beaulieu Country Estate','Blue Valley Golf Estate','Carlswald Estate',
  'Crescent Wood Country Estate','Dainfern','Dainfern Ridge','Helderfontein',
  'Kyalami Estate','Kyalami Hills Estate','Kyalami Boulevard Estate','Kyalami Terrace',
  'Kyalami View','Saddlebrook Estate','Savannah Hills','Steyn City','Summerset Estate',
  'The Polofields','Waterfall City','Waterfall Country Estate','Waterfall Valley',
  'Waterfall Crescent','Vorna Valley Estates',
  'Austin View AH','Barbeque AH','Blue Hills AH','Bridle Park AH','Carlswald AH',
  'Crowthorne AH','Diepsloot AH','Erand AH','Glen Austin AH','Glenferness AH',
  'Knopjeslaagte AH','Kyalami AH','President Park AH','Randjesfontein AH',
  'Treesbank AH','Willaway AH'
];

function slugify(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildRegion(key, name, townshipNames) {
  const seen = new Set();
  const townships = [];
  for (const n of townshipNames) {
    const k = slugify(n);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    townships.push({ key: k, name: n });
  }
  return { key, name, townships };
}

const LOCATION_SEED = {
  regions: [
    buildRegion('tembisa', 'Tembisa', TEMBISA_TOWNSHIPS),
    buildRegion('midrand', 'Midrand', MIDRAND_TOWNSHIPS)
  ]
};

// ==========================================
// 4. FEE ENGINE
// ==========================================
const RENTAL_FEE_TABLE = [
  { min: 800,   max: 1700,  fee: 300  },
  { min: 1800,  max: 2500,  fee: 350  },
  { min: 2600,  max: 3900,  fee: 400  },
  { min: 4000,  max: 6000,  fee: 500  },
  { min: 6100,  max: 7900,  fee: 700  },
  { min: 8000,  max: 15000, fee: 1500 }
];
const SALE_FEE_RATE = 0.12;
const NON_TEMBISA_SURCHARGE = 100;

function parseAmount(v) {
  return Number(String(v || '').replace(/[^\d.]/g, '')) || 0;
}

function isTembisaCore(room) {
  const region = String(room.regionKey || room.region || '').toLowerCase();
  return region === 'tembisa';
}

function calculateAgentFee({ amount, purpose, regionKey, region }) {
  const amt = parseAmount(amount);
  const inTembisa = isTembisaCore({ regionKey, region });
  const surcharge = inTembisa ? 0 : NON_TEMBISA_SURCHARGE;
  const p = String(purpose || 'rent').toLowerCase();
  const isSale = p === 'sale' || p === 'buy' || p === 'sell';

  if (isSale) {
    const base = Math.round(amt * SALE_FEE_RATE);
    return {
      kind: 'sale', base, surcharge, total: base + surcharge, inTembisa, manual: false,
      breakdown: `12% of R${amt.toLocaleString('en-ZA')} = R${base.toLocaleString('en-ZA')}` +
                 (surcharge ? ` + R${surcharge} non-Tembisa surcharge` : '')
    };
  }

  let base = 0;
  let matchedRange = null;
  for (const row of RENTAL_FEE_TABLE) {
    if (amt >= row.min && amt <= row.max) {
      base = row.fee;
      matchedRange = `R${row.min.toLocaleString('en-ZA')}–R${row.max.toLocaleString('en-ZA')}`;
      break;
    }
  }
  if (!base) {
    if (amt > 0 && amt < 800) base = RENTAL_FEE_TABLE[0].fee;
    else if (amt > 15000) base = RENTAL_FEE_TABLE[RENTAL_FEE_TABLE.length - 1].fee;
  }

  return {
    kind: 'rent', base, surcharge, total: base + surcharge, inTembisa, manual: false,
    breakdown: matchedRange
      ? `Rent ${matchedRange} → R${base} fee` + (surcharge ? ` + R${surcharge} non-Tembisa surcharge` : '')
      : `R${base} fee` + (surcharge ? ` + R${surcharge} non-Tembisa surcharge` : '')
  };
}

function resolveAgentFee(room) {
  const override = Number(room.agentFeeOverride);
  if (Number.isFinite(override) && override > 0) {
    const auto = calculateAgentFee(room);
    return {
      kind: auto.kind, base: override, surcharge: 0, total: override,
      inTembisa: auto.inTembisa, manual: true,
      breakdown: `MANUAL override — R${override.toLocaleString('en-ZA')} (system would have been R${auto.total.toLocaleString('en-ZA')})`
    };
  }
  return calculateAgentFee(room);
}

function withFee(room) {
  return { ...room, agentFee: resolveAgentFee(room) };
}

// ==========================================
// 5. DB INIT & HELPERS
// ==========================================
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_state (
        id VARCHAR(50) PRIMARY KEY,
        data JSONB NOT NULL
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS financial_ledger (
        id SERIAL PRIMARY KEY,
        room_id VARCHAR(80),
        kind VARCHAR(20),
        amount NUMERIC(12,2),
        fee_base NUMERIC(12,2),
        surcharge NUMERIC(12,2),
        fee_total NUMERIC(12,2),
        in_tembisa BOOLEAN,
        location VARCHAR(200),
        township VARCHAR(200),
        event VARCHAR(40),
        manual BOOLEAN DEFAULT FALSE,
        actor VARCHAR(80),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_audit (
        id SERIAL PRIMARY KEY,
        actor VARCHAR(80),
        action VARCHAR(120),
        detail TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    const res = await client.query('SELECT * FROM app_state WHERE id = $1', ['main_db']);
    if (res.rowCount === 0) {
      const defaultDB = {
        locations: LOCATION_SEED,
        rooms: { pending: [], approved: [], taken: [], declined: [], removed: [] },
        contacts: []
      };
      await client.query('INSERT INTO app_state (id, data) VALUES ($1, $2)', ['main_db', defaultDB]);
    }
  } finally { client.release(); }
}

async function readDB() {
  const res = await pool.query('SELECT data FROM app_state WHERE id = $1', ['main_db']);
  return res.rows[0].data;
}
async function writeDB(db) {
  await pool.query('UPDATE app_state SET data = $1 WHERE id = $2', [db, 'main_db']);
}
async function audit(actor, action, detail) {
  try {
    await pool.query(
      'INSERT INTO admin_audit (actor, action, detail) VALUES ($1,$2,$3)',
      [actor || ADMIN_ACTOR, action, detail || '']
    );
  } catch (_) {}
}

initDB().catch(err => console.error('DB init failed:', err.message));

// ==========================================
// 6. PUBLIC ENDPOINTS
// ==========================================
app.post('/api/upload', upload.array('images'), (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files' });
  res.json({ success: true, urls: req.files.map(f => `/uploads/${f.filename}`) });
});

app.post('/api/admin/upload', upload.array('images'), (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files' });
  res.json({ success: true, urls: req.files.map(f => `/uploads/${f.filename}`) });
});

app.get('/api/locations', async (req, res) => {
  try {
    const db = await readDB();
    res.json({ regions: db.locations.regions });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/property-types', (req, res) => {
  res.json({ types: PROPERTY_TYPES, labels: PROPERTY_TYPE_LABELS });
});

app.get('/api/public', async (req, res) => {
  try {
    const db = await readDB();
    const rooms = db.rooms.approved
      .filter(r => r.online !== false)
      .map(room => ({
        id: room.id,
        title: room.title,
        region: room.region || '',
        regionKey: room.regionKey || '',
        township: room.township || '',
        location: room.township || '',
        purpose: room.purpose || 'rent',
        type: room.type || 'bachelor',
        typeLabel: PROPERTY_TYPE_LABELS[room.type] || room.type || 'Bachelor',
        amount: room.amount,
        deposit: room.deposit || 'No deposit',
        bedrooms: Number(room.bedrooms) || 1,
        bathrooms: Number(room.bathrooms) || 1,
        parkingSpaces: Number(room.maxCars) || (room.parking === 'Yes' ? 1 : 0),
        childFriendly: room.childFriendly === 'Yes' ? 'Yes' : 'No',
        maxKids: room.maxKids || '0',
        toiletType: room.toiletType || 'Shared',
        bathroomType: room.bathroomType || 'Shared',
        tiles: room.tiles || 'No',
        ceiling: room.ceiling || 'No',
        images: Array.isArray(room.images) ? room.images : [],
        video: room.video || '',
        notes: room.notes,
        address: room.address || '',
        availableDate: room.availableDate || '',
        posterName: room.posterName,
        posterContact: room.posterContact
      }));
    res.json({ rooms });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/rooms', async (req, res) => {
  try {
    const db = await readDB();
    const body = req.body || {};
    const region = body.region || '';
    const regionKey = body.regionKey || slugify(region);
    const township = body.township || '';
    const type = PROPERTY_TYPES.includes(body.type) ? body.type : 'bachelor';
    
    const room = {
      id: 'post-' + Date.now(),
      title: body.title,
      purpose: body.purpose,
      type: type,
      region,
      regionKey,
      township,
      location: township,
      address: body.address,
      amount: body.amount,
      deposit: body.deposit,
      bedrooms: body.bedrooms,
      bathrooms: body.bathrooms,
      availableDate: body.availableDate,
      notes: body.notes,
      childFriendly: body.childFriendly,
      maxKids: body.maxKids,
      parking: body.parking,
      maxCars: body.maxCars,
      ceiling: body.ceiling,
      tiles: body.tiles,
      toiletType: body.toiletType,
      bathroomType: body.bathroomType,
      posterName: body.posterName,
      posterContact: body.posterContact,
      images: body.images,
      video: body.video,
      online: true,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    room.agentFeeSnapshot = calculateAgentFee(room);
    db.rooms.pending.unshift(room);
    await writeDB(db);
    res.status(201).json({ ok: true, id: room.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/fee-preview', (req, res) => {
  try {
    const { amount, purpose, regionKey, region, agentFeeOverride } = req.body || {};
    const autoFee = calculateAgentFee({ amount, purpose, regionKey, region });
    const overrideNum = Number(agentFeeOverride);
    if (Number.isFinite(overrideNum) && overrideNum > 0) {
      return res.json({ fee: {
        kind: autoFee.kind, base: overrideNum, surcharge: 0, total: overrideNum,
        inTembisa: autoFee.inTembisa, manual: true,
        breakdown: `MANUAL override — R${overrideNum.toLocaleString('en-ZA')} (system would have been R${autoFee.total.toLocaleString('en-ZA')})`,
        autoTotal: autoFee.total
      }});
    }
    res.json({ fee: autoFee });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ==========================================
// 7. ADMIN AUTH & DATA
// ==========================================
function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token || !sessions.has(token)) return res.status(401).json({ error: 'Unauthorized' });
  req.actor = ADMIN_ACTOR;
  next();
}

app.post('/api/admin/login', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Incorrect password' });
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { created: Date.now() });
  audit(ADMIN_ACTOR, 'login', 'Admin logged in');
  res.json({ token, success: true });
});

app.get('/api/admin/data', requireAuth, async (req, res) => {
  try {
    const db = await readDB();
    const enriched = {};
    for (const key of Object.keys(db.rooms)) enriched[key] = (db.rooms[key] || []).map(withFee);
    db.rooms = enriched;

    const feeTotals = { rent: 0, sale: 0, surcharges: 0, manual: 0, grand: 0, byStatus: {} };
    for (const status of Object.keys(enriched)) {
      let statusTotal = 0;
      for (const r of enriched[status]) {
        if (r.agentFee.manual) feeTotals.manual += r.agentFee.total;
        else {
          feeTotals[r.agentFee.kind] += r.agentFee.base;
          feeTotals.surcharges += r.agentFee.surcharge;
        }
        feeTotals.grand += r.agentFee.total;
        statusTotal += r.agentFee.total;
      }
      feeTotals.byStatus[status] = statusTotal;
    }

    const ledger = await pool.query('SELECT * FROM financial_ledger ORDER BY created_at DESC LIMIT 500');
    const auditRows = await pool.query('SELECT * FROM admin_audit ORDER BY created_at DESC LIMIT 200');

    res.json({
      ...db,
      feeTotals,
      ledger: ledger.rows,
      auditTrail: auditRows.rows,
      propertyTypes: PROPERTY_TYPES,
      propertyTypeLabels: PROPERTY_TYPE_LABELS,
      feeConfig: { rentalTable: RENTAL_FEE_TABLE, saleRate: SALE_FEE_RATE, nonTembisaSurcharge: NON_TEMBISA_SURCHARGE }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 8. ADMIN ACTIONS & LEDGER
// ==========================================
app.post('/api/admin/action', requireAuth, async (req, res) => {
  try {
    const db = await readDB();
    const { action, section, from, to, id, data } = req.body;

    if (action === 'move') {
      const item = db[section][from].find(x => x.id === id);
      if (item) {
        db[section][from] = db[section][from].filter(x => x.id !== id);
        const fresh = { ...item, status: to, updatedAt: new Date().toISOString() };
        fresh.agentFeeSnapshot = resolveAgentFee(fresh);
        db[section][to].unshift(fresh);

        if (section === 'rooms' && to === 'approved') {
          const f = fresh.agentFeeSnapshot;
          await pool.query(
            `INSERT INTO financial_ledger
              (room_id, kind, amount, fee_base, surcharge, fee_total, in_tembisa, location, township, event, manual, actor)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [fresh.id, f.kind, parseAmount(fresh.amount), f.base, f.surcharge, f.total,
             f.inTembisa, fresh.location || '', fresh.township || '', 'approved', !!f.manual, req.actor]
          );
          audit(req.actor, 'approve-room', `${fresh.id} → fee R${f.total}${f.manual ? ' (MANUAL)' : ''}`);
        }
        if (section === 'rooms' && from === 'approved' && to !== 'approved') {
          audit(req.actor, 'unapprove-room', `${fresh.id} → ${to}`);
        }
      }
    } else if (action === 'edit') {
      const i = db[section][from].findIndex(x => x.id === id);
      if (i !== -1) {
        const merged = { ...db[section][from][i], ...data, updatedAt: new Date().toISOString() };
        merged.location = merged.township || '';
        if (Object.prototype.hasOwnProperty.call(data, 'agentFeeOverride')) {
          const n = Number(data.agentFeeOverride);
          if (Number.isFinite(n) && n > 0) merged.agentFeeOverride = n;
          else delete merged.agentFeeOverride;
        }
        merged.agentFeeSnapshot = resolveAgentFee(merged);
        db[section][from][i] = merged;
        audit(req.actor, 'edit-room', `${id} → fee R${merged.agentFeeSnapshot.total}${merged.agentFeeSnapshot.manual ? ' (MANUAL)' : ''}`);
      }
    } else if (action === 'set-fee-override') {
      const i = db[section][from].findIndex(x => x.id === id);
      if (i !== -1) {
        const n = Number(data.agentFeeOverride);
        if (Number.isFinite(n) && n > 0) db[section][from][i].agentFeeOverride = n;
        else delete db[section][from][i].agentFeeOverride;
        db[section][from][i].agentFeeSnapshot = resolveAgentFee(db[section][from][i]);
        audit(req.actor, 'set-fee-override', `${id} → ${Number.isFinite(n) && n > 0 ? 'R' + n : 'cleared'}`);
      }
    } else if (action === 'clear-fee-override') {
      const i = db[section][from].findIndex(x => x.id === id);
      if (i !== -1) {
        delete db[section][from][i].agentFeeOverride;
        db[section][from][i].agentFeeSnapshot = resolveAgentFee(db[section][from][i]);
        audit(req.actor, 'clear-fee-override', `${id} → back to auto`);
      }
    } else if (action === 'delete') {
      db[section][from] = db[section][from].filter(x => x.id !== id);
      audit(req.actor, 'delete-room', `${id} from ${from}`);
    } else if (action === 'add-images') {
      const item = db[section][from].find(x => x.id === id);
      if (item) { if (!item.images) item.images = []; item.images.push(...data.images); }
    }

    await writeDB(db);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/ledger', requireAuth, async (req, res) => {
  try {
    const { from, to } = req.query;
    let q = 'SELECT * FROM financial_ledger';
    const params = [];
    if (from && to) { q += ' WHERE created_at >= $1 AND created_at <= $2'; params.push(from, to); }
    q += ' ORDER BY created_at DESC';
    const r = await pool.query(q, params);
    res.json({ ledger: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/ledger.csv', requireAuth, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM financial_ledger ORDER BY created_at DESC');
    const headers = ['id','room_id','kind','amount','fee_base','surcharge','fee_total','in_tembisa','location','township','event','manual','actor','created_at'];
    const lines = [headers.join(',')];
    for (const row of r.rows) {
      lines.push(headers.map(h => {
        const v = row[h];
        if (v === null || v === undefined) return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(','));
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="tembisa-midrand-ledger.csv"');
    res.send(lines.join('\n'));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/reset-everything', requireAuth, async (req, res) => {
  try {
    const emptyDB = {
      locations: LOCATION_SEED,
      rooms: { pending: [], approved: [], taken: [], declined: [], removed: [] },
      contacts: []
    };
    await writeDB(emptyDB);
    await pool.query('DELETE FROM financial_ledger');
    audit(req.actor, 'reset-everything', 'All data wiped');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 9. SEO & STATIC ROUTES
// ==========================================
const SITE_URL = process.env.SITE_URL || 'https://tembisa.vusaniikhayaproperties.co.za';
const BRAND = 'Tembisa & Midrand Rentals';
const POWERED = 'Powered by Vusani Ikhaya Properties';

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
});

app.get('/sitemap.xml', async (req, res) => {
  try {
    const db = await readDB();
    const urls = [`${SITE_URL}/`, `${SITE_URL}/about`, `${SITE_URL}/post`];
    for (const region of db.locations.regions) {
      urls.push(`${SITE_URL}/${region.key}`);
      for (const tw of region.townships) urls.push(`${SITE_URL}/${region.key}/${tw.key}`);
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`).join('\n')}
</urlset>`;
    res.type('application/xml').send(xml);
  } catch (err) { res.status(500).send('sitemap error'); }
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API route not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => console.log(`Tembisa & Midrand Rentals running on port ${PORT}`));
