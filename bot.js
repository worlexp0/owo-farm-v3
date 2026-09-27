const express = require('express');
const { Client } = require('discord.js-selfbot-v13');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const PANEL_KEY = process.env.PANEL_KEY || 'degistir-bunu';
const OWO_BOT_ID = process.env.OWO_BOT_ID || '408785106942164992';

// -------------------------------------------------------------------
// AYARLAR
// -------------------------------------------------------------------
const BASLANGIC_COOLDOWN = parseInt(process.env.BASLANGIC_COOLDOWN || '15', 10);
const MAX_COOLDOWN       = parseInt(process.env.MAX_COOLDOWN       || '20', 10);
const ARTIS              = parseInt(process.env.COOLDOWN_ARTIS    || '1',  10);

const CF_AKTIF       = (process.env.CF_AKTIF || 'true') === 'true';
const CF_MIN_BAKIYE  = parseInt(process.env.CF_MIN_BAKIYE  || '200', 10);
const CF_BAHIS_ORANI = parseFloat(process.env.CF_BAHIS_ORANI || '0.05');
const CF_MIN_BAHIS   = parseInt(process.env.CF_MIN_BAHIS   || '10',  10);
const CF_MAX_BAHIS   = parseInt(process.env.CF_MAX_BAHIS   || '100', 10);
const CF_INTERVAL    = parseInt(process.env.CF_INTERVAL    || '300000', 10);

// OwO nadirlik sıralaması
const NADIRLIK = {
  'common': 1, 'uncommon': 2, 'rare': 3, 'epic': 4,
  'mythic': 5, 'legendary': 6, 'fabled': 7, 'hidden': 8
};

const ANA_KOMUTLAR = ['owo hunt', 'owo battle', 'owo pray'];

const OZEL_KOMUTLAR = [
  { cmd: 'owo daily',    interval: 12 * 60 * 60 * 1000, son: 0 },
  { cmd: 'owo cookie',   interval: 24 * 60 * 60 * 1000, son: 0 },
  { cmd: 'owo vote',     interval: 12 * 60 * 60 * 1000, son: 0 },
  { cmd: 'owo quest',    interval: 30 * 60 * 1000,      son: 0 },
  { cmd: 'owo sell all', interval: 30 * 60 * 1000,      son: 0 },
  { cmd: 'owo cash',     interval: 10 * 60 * 1000,      son: 0 },
];

const hesaplar = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// -------------------------------------------------------------------
// HESAP BAŞLAT
// -------------------------------------------------------------------
async function hesapBaslat(token, kanalId) {
  if (hesaplar.has(token)) throw new Error('Bu token zaten ekli.');

  const client = new Client({ checkUpdate: false });
  const ozel = OZEL_KOMUTLAR.map((k) => ({ ...k }));

  const kayit = {
    client,
    cooldown: BASLANGIC_COOLDOWN,
    muteUntil: 0,
    kanalId,
    durum: 'bağlanıyor',
    user: null,
    durdu: false,
    ozel,
    bakiye: 0,
    cfSon: 0,
    cfSeri: 0,
    cfMola: 0,
    kazanc: 0,
    kayip: 0,
    // Yeni alanlar
    hayvanlar: [],
    enIyiTakim: [],
    takimKuruldu: false,
    sonHunt: 0,
    sonBattle: 0,
    sonCrate: 0,
    sonZoo: 0,
    sonTeam: 0,
  };
  hesaplar.set(token, kayit);

  // -----------------------------------------------------------------
  // READY
  // -----------------------------------------------------------------
  client.on('ready', async () => {
    kayit.user = client.user.username || client.user.tag || 'bilinmiyor';
    kayit.durum = 'çalışıyor';
    console.log(`[SELF] ${kayit.user} giriş yaptı`);

    const kanal = await client.channels.fetch(kanalId).catch(() => null);
    if (!kanal) {
      kayit.durum = 'kanal yok';
      console.log(`[SELF] ${kayit.user} kanal bulunamadı: ${kanalId}`);
      return;
    }
    console.log(`[SELF] ${kayit.user} → #${kanal.name}`);

    // Başlangıçta keşif
    await sleep(3000);
    await kanal.send('owo zoo');
    await sleep(2500);
    await kanal.send('owo inv');
    await sleep(2500);

    kasDongusu(client, kanal, kayit);
  });

  // -----------------------------------------------------------------
  // OWO MESAJLARINI DİNLE
  // -----------------------------------------------------------------
  client.on('messageCreate', async (message) => {
    if (message.author.id !== OWO_BOT_ID) return;

    const icerik = message.content;
    const kucuk = icerik.toLowerCase();
    const now = Date.now();

    // -------------------------------------------------------------
    // 🔘 OTOMATİK BUTON TIKLAMA (Verify / Confirm vs.)
    // -------------------------------------------------------------
    try {
      if (message.components && message.components.length > 0) {
        for (const row of message.components) {
          if (!row.components) continue;
          for (const comp of row.components) {
            const etiket = (comp.label || '').toLowerCase();
            const hedef = [
              'verify', 'confirm', 'click here', 'tıkla', 'doğrula',
              'i am human', 'human', 'continue', 'devam', 'next', 'ok'
            ];
            if (comp.type === 'BUTTON' && hedef.some(h => etiket.includes(h))) {
              try {
                await comp.click();
                console.log(`[🖱️ ${kayit.user}] Butona tıklandı: "${comp.label}"`);
                await sleep(2000);
              } catch (err) {
                console.log(`[🖱️ HATA] ${err.message}`);
              }
            }
          }
        }
      }
    } catch (err) {
      console.log(`[BUTON HATA] ${err.message}`);
    }

    // Log
    console.log(`[OWO / ${kayit.user}] ${icerik.slice(0, 200).replace(/\n/g, ' ')}`);

    // --- CAPTCHA (resim/emoji) ---
    if (kucuk.includes('captcha') || kucuk.includes('human check') || kucuk.includes('are you a human')) {
      // Buton varsa yukarıda tıklandı, captcha hâlâ varsa durdur
      if (!message.components || message.components.length === 0) {
        kayit.durdu = true;
        kayit.durum = 'captcha!';
        console.log(`[⚠️ CAPTCHA / ${kayit.user}] Manuel çöz!`);
        return;
      }
    }

    // --- BAN ---
    if (kucuk.includes('you have been banned') || kucuk.includes('banned from owo')) {
      kayit.durdu = true;
      kayit.durum = 'banlı';
      console.log(`[🚫 BAN / ${kayit.user}]`);
      return;
    }

    // --- MUTE ---
    if (kucuk.includes('muted') && !kucuk.includes('unmuted')) {
      const m = kucuk.match(/muted for (\d+)\s*(minute|second|hour|min|sec)/);
      if (m) {
        const adet = parseInt(m[1], 10);
        const brm = m[2];
        let sn = brm.includes('hour') ? adet * 3600 :
                 brm.includes('min')  ? adet * 60 : adet;
        kayit.muteUntil = now + sn * 1000;
        console.log(`[MUTE / ${kayit.user}] ${sn}s`);
      } else {
        kayit.muteUntil = now + 300 * 1000;
        console.log(`[MUTE / ${kayit.user}] 300s`);
      }
    }

    // --- GEÇİCİ KISITLAMA ---
    if (kucuk.includes("you can't use") || kucuk.includes('slow down')) {
      kayit.muteUntil = now + 5000;
    }

    // -------------------------------------------------------------
    // BAKİYE
    // -------------------------------------------------------------
    const cashM = icerik.match(/you currently have \*{0,2}([\d,]+)\*{0,2} cowoncy/i);
    if (cashM) {
      kayit.bakiye = parseInt(cashM[1].replace(/,/g, ''), 10);
      console.log(`[💰 ${kayit.user}] Bakiye: ${kayit.bakiye.toLocaleString()}`);
    }

    // CF kazanç
    const wonM = icerik.match(/you won \*{0,2}([\d,]+)\*{0,2} cowoncy/i);
    if (wonM) {
      const kaz = parseInt(wonM[1].replace(/,/g, ''), 10);
      kayit.bakiye += kaz;
      kayit.kazanc += kaz;
      kayit.cfSeri = 0;
      console.log(`[🟢 CF KAZANÇ / ${kayit.user}] +${kaz}`);
    }

    // CF kayıp
    const lostM = icerik.match(/you lost \*{0,2}([\d,]+)\*{0,2} cowoncy/i);
    if (lostM) {
      const kay = parseInt(lostM[1].replace(/,/g, ''), 10);
      kayit.bakiye -= kay;
      kayit.kayip += kay;
      kayit.cfSeri += 1;
      console.log(`[🔴 CF KAYIP / ${kayit.user}] -${kay} (seri: ${kayit.cfSeri})`);
      if (kayit.cfSeri >= 3) {
        kayit.cfMola = now + 30 * 60 * 1000;
        kayit.cfSeri = 0;
        console.log(`[⏸️ ${kayit.user}] 3 üst üste kayıp → 30dk mola`);
      }
    }

    // Satış
    const sellM = icerik.match(/sold \*{0,2}(\d+)\*{0,2} animals? for \*{0,2}([\d,]+)\*{0,2}/i);
    if (sellM) {
      const tutar = parseInt(sellM[2].replace(/,/g, ''), 10);
      kayit.bakiye += tutar;
      console.log(`[💵 ${kayit.user}] ${sellM[1]} hayvan satıldı → +${tutar}`);
    }

    // -------------------------------------------------------------
    // ZOO PARSE
    // -------------------------------------------------------------
    const hayvanRegex = /[•\-]\s*([a-zA-Zçğıöşü\s]+?)\s*\((\w+)\)/g;
    let m2;
    const yeniHayvanlar = [];
    while ((m2 = hayvanRegex.exec(icerik)) !== null) {
      const isim = m2[1].trim();
      const nadirlik = m2[2].toLowerCase();
      if (NADIRLIK[nadirlik]) {
        yeniHayvanlar.push({ isim, nadirlik });
      }
    }
    if (yeniHayvanlar.length > 0) {
      for (const y of yeniHayvanlar) {
        if (!kayit.hayvanlar.find(h => h.isim.toLowerCase() === y.isim.toLowerCase())) {
          kayit.hayvanlar.push(y);
        }
      }
      kayit.enIyiTakim = kayit.hayvanlar
        .slice()
        .sort((a, b) => NADIRLIK[b.nadirlik] - NADIRLIK[a.nadirlik])
        .slice(0, 3);
      console.log(`[🦊 ${kayit.user}] ${kayit.hayvanlar.length} hayvan, en iyi: ${kayit.enIyiTakim.map(h => h.isim).join(', ')}`);
    }
  });

  client.on('error', (e) => console.log(`[HATA / ${kayit.user}] ${e.message}`));

  await client.login(token);
  return kayit;
}

// -------------------------------------------------------------------
// ANA DÖNGÜ
// -------------------------------------------------------------------
async function kasDongusu(client, kanal, kayit) {
  while (client.isReady()) {
    if (kayit.durdu) { await sleep(30000); continue; }

    const now = Date.now();
    if (now < kayit.muteUntil) { await sleep(kayit.muteUntil - now); continue; }

    let gonderilecek = null;

    // 1) Takımı kur (en iyi 3 hayvanla, tek sefer)
    if (!kayit.takimKuruldu && kayit.enIyiTakim.length >= 3) {
      for (const h of kayit.enIyiTakim) {
        try {
          await kanal.send(`owo team add ${h.isim}`);
          console.log(`[${kayit.user}] → owo team add ${h.isim} (${h.nadirlik})`);
        } catch (e) { console.log(`[TAKIM HATA] ${e.message}`); }
        await sleep(2500);
      }
      kayit.takimKuruldu = true;
      kayit.sonTeam = now;
      console.log(`[✅ ${kayit.user}] Takım kuruldu`);
      continue;
    }

    // 2) Özel komutlar
    for (const k of kayit.ozel) {
      if (now - k.son >= k.interval) {
        gonderilecek = k.cmd;
        k.son = now;
        break;
      }
    }

    // 3) Zoo yenile (10 dk)
    if (!gonderilecek && now - kayit.sonZoo > 10 * 60 * 1000) {
      gonderilecek = 'owo zoo';
      kayit.sonZoo = now;
    }

    // 4) Crate aç (15 dk)
    if (!gonderilecek && now - kayit.sonCrate > 15 * 60 * 1000) {
      gonderilecek = 'owo crate';
      kayit.sonCrate = now;
    }

    // 5) Battle (5 dk)
    if (!gonderilecek && now - kayit.sonBattle > 5 * 60 * 1000) {
      gonderilecek = 'owo battle';
      kayit.sonBattle = now;
    }

    // 6) CF
    if (!gonderilecek && CF_AKTIF && now - kayit.cfSon >= CF_INTERVAL) {
      if (now >= kayit.cfMola && kayit.bakiye >= CF_MIN_BAKIYE) {
        let bahis = Math.floor(kayit.bakiye * CF_BAHIS_ORANI);
        if (bahis < CF_MIN_BAHIS) bahis = CF_MIN_BAHIS;
        if (bahis > CF_MAX_BAHIS) bahis = CF_MAX_BAHIS;
        const yon = Math.random() < 0.5 ? 'heads' : 'tails';
        gonderilecek = `owo cf ${bahis} ${yon}`;
        kayit.cfSon = now;
      }
    }

    // 7) Hunt (sürekli)
    if (!gonderilecek && now - kayit.sonHunt >= kayit.cooldown * 1000) {
      gonderilecek = ANA_KOMUTLAR[Math.floor(Math.random() * ANA_KOMUTLAR.length)];
      kayit.sonHunt = now;
    }

    if (!gonderilecek) { await sleep(1000); continue; }

    try {
      await kanal.send(gonderilecek);
      console.log(`[${kayit.user}] → ${gonderilecek} (cd=${kayit.cooldown}s, bakiye=${kayit.bakiye})`);
    } catch (e) {
      console.log(`[GÖNDERİM HATA] ${e.message}`);
      await sleep(5000);
      continue;
    }

    if (kayit.cooldown < MAX_COOLDOWN) {
      kayit.cooldown += ARTIS;
      if (kayit.cooldown > MAX_COOLDOWN) kayit.cooldown = MAX_COOLDOWN;
    }

    await sleep(2000);
  }
}

// -------------------------------------------------------------------
// API
// -------------------------------------------------------------------
function auth(req, res, next) {
  const key = req.headers['x-panel-key'] || req.body?.panelKey;
  if (key !== PANEL_KEY) return res.status(401).json({ error: 'Yetkisiz' });
  next();
}

app.post('/api/add', auth, async (req, res) => {
  const { token, kanalId } = req.body;
  if (!token || !kanalId) return res.json({ error: 'token ve kanalId zorunlu' });
  try { await hesapBaslat(token, kanalId); res.json({ ok: true }); }
  catch (e) { res.json({ error: e.message }); }
});

app.post('/api/remove', auth, async (req, res) => {
  const { token } = req.body;
  const k = hesaplar.get(token);
  if (!k) return res.json({ error: 'Yok' });
  try { await k.client.destroy(); } catch {}
  hesaplar.delete(token);
  res.json({ ok: true });
});

app.post('/api/resume', auth, async (req, res) => {
  const { token } = req.body;
  const k = hesaplar.get(token);
  if (!k) return res.json({ error: 'Yok' });
  k.durdu = false;
  k.durum = 'çalışıyor';
  res.json({ ok: true });
});

app.get('/api/list', auth, (req, res) => {
  const liste = [];
  for (const [token, k] of hesaplar.entries()) {
    liste.push({
      tokenTam: token,
      user: k.user, kanalId: k.kanalId, durum: k.durum,
      cooldown: k.cooldown, bakiye: k.bakiye,
      kazanc: k.kazanc, kayip: k.kayip,
      hayvanSayisi: k.hayvanlar.length,
      takim: k.enIyiTakim.map(h => `${h.isim}(${h.nadirik})`).join(', '),
    });
  }
  res.json({ hesaplar: liste });
});

// -------------------------------------------------------------------
// PANEL
// -------------------------------------------------------------------
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>OwO Ultra Farm</title>
<style>
body{font-family:system-ui;background:#0f1115;color:#e8e8e8;padding:20px;margin:0}
.card{background:#171a21;border:1px solid #262b36;border-radius:10px;padding:18px;margin-bottom:16px;max-width:1100px}
input{width:100%;padding:10px;background:#0f1115;border:1px solid #2b3140;border-radius:6px;color:#eee;font-family:monospace;margin-bottom:10px;box-sizing:border-box}
button{background:#5865f2;color:#fff;border:none;padding:10px 16px;border-radius:6px;cursor:pointer;font-weight:600;margin-right:6px}
button.danger{background:#ed4245}button.warn{background:#f0a020}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:8px;border-bottom:1px solid #262b36}
.status{padding:2px 8px;border-radius:4px;font-size:11px}
.ok{background:#1e3a25;color:#4ade80}.err{background:#3a1e1e;color:#f87171}.warn{background:#3a331e;color:#fbbf24}
code{background:#262b36;padding:2px 6px;border-radius:4px;font-size:11px}
.coin{color:#fbbf24;font-weight:600}.kazanc{color:#4ade80}.kayip{color:#f87171}
</style></head><body>
<div style="max-width:1100px;margin:0 auto">
<h1>🦊 OwO Ultra Farm</h1>

<div class="card"><label>Panel Şifresi</label>
<input id="panelKey" type="password" placeholder="PANEL_KEY">
<button onclick="kaydetKey()">Kaydet</button></div>

<div class="card"><h3>Hesap Ekle</h3>
<input id="token" type="password" placeholder="Kullanıcı token'ı (bot token'ı DEĞİL)">
<input id="kanalId" placeholder="Kanal ID">
<button onclick="ekle()">Ekle ve Başlat</button>
<div id="addMsg" style="margin-top:10px"></div></div>

<div class="card">
<div style="display:flex;justify-content:space-between;align-items:center">
<h3 style="margin:0">Hesaplar</h3>
<button onclick="listele()">🔄 Yenile</button></div>
<table style="margin-top:12px">
<thead><tr><th>Hesap</th><th>Bakiye</th><th>Kazanç</th><th>Kayıp</th><th>Hayvan</th><th>En İyi Takım</th><th>Durum</th><th>İşlem</th></tr></thead>
<tbody id="tb"><tr><td colspan="8">Yükleniyor...</td></tr></tbody>
</table></div>

</div>
<script>
const $=id=>document.getElementById(id);
const getKey=()=>localStorage.getItem('panelKey')||'';
const fmt=n=>n==null?0:Number(n).toLocaleString('tr-TR');
function kaydetKey(){localStorage.setItem('panelKey',$('panelKey').value.trim());listele();}
async function api(u,b){const o={method:b?'POST':'GET',headers:{'Content-Type':'application/json','x-panel-key':getKey()}};if(b)o.body=JSON.stringify(b);return await(await fetch(u,o)).json();}
async function ekle(){const token=$('token').value.trim(),kanalId=$('kanalId').value.trim();if(!token||!kanalId){$('addMsg').textContent='Token ve kanal ID gerekli';return;}$('addMsg').textContent='Başlatılıyor...';const r=await api('/api/add',{token,kanalId});$('addMsg').textContent=r.ok?'✅ Eklendi':('❌ '+r.error);if(r.ok){$('token').value='';listele();}}
async function kaldir(t){if(!confirm('Durdur?'))return;await api('/api/remove',{token:t});listele();}
async function devam(t){await api('/api/resume',{token:t});listele();}
async function listele(){const r=await api('/api/list');const tb=$('tb');if(!r.hesaplar||!r.hesaplar.length){tb.innerHTML='<tr><td colspan=8 style="color:#666">Aktif hesap yok</td></tr>';return;}tb.innerHTML='';for(const h of r.hesaplar){const cls=h.durum==='çalışıyor'?'ok':(h.durum==='bağlanıyor'?'warn':'err');const tr=document.createElement('tr');tr.innerHTML='<td>'+(h.user||'...')+'</td><td class="coin">'+fmt(h.bakiye)+'</td><td class="kazanc">+'+fmt(h.kazanc)+'</td><td class="kayip">-'+fmt(h.kayip)+'</td><td>'+h.hayvanSayisi+'</td><td><code>'+(h.takim||'-')+'</code></td><td><span class="status '+cls+'">'+h.durum+'</span></td><td><button class="warn" onclick="devam(\\''+h.tokenTam+'\\')">Devam</button> <button class="danger" onclick="kaldir(\\''+h.tokenTam+'\\')">Durdur</button></td>';tb.appendChild(tr);}}
$('panelKey').value=getKey();listele();setInterval(listele,5000);
</script></body></html>`);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[PANEL] http://0.0.0.0:${PORT}`);
});
