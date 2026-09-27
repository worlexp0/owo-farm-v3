const express = require('express');
const { Client } = require('discord.js-selfbot-v13');
const fs = require('fs');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const PANEL_KEY = process.env.PANEL_KEY || 'degistir-bunu';
const OWO_BOT_ID = process.env.OWO_BOT_ID || '408785106942164992';

const BASLANGIC_COOLDOWN = parseInt(process.env.BASLANGIC_COOLDOWN || '15', 10);
const MAX_COOLDOWN       = parseInt(process.env.MAX_COOLDOWN       || '20', 10);
const ARTIS              = parseInt(process.env.COOLDOWN_ARTIS    || '1',  10);

// OwO nadirlik sıralaması (yüksek = daha iyi)
const NADIRLIK = {
  'common': 1, 'uncommon': 2, 'rare': 3, 'epic': 4,
  'mythic': 5, 'legendary': 6, 'fabled': 7, 'hidden': 8
};

const hesaplar = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// -------------------------------------------------------------------
// HESAP BAŞLAT
// -------------------------------------------------------------------
async function hesapBaslat(token, kanalId) {
  if (hesaplar.has(token)) throw new Error('Bu token zaten ekli.');

  const client = new Client({ checkUpdate: false });

  const kayit = {
    client,
    cooldown: BASLANGIC_COOLDOWN,
    muteUntil: 0,
    kanalId,
    durum: 'bağlanıyor',
    user: null,
    durdu: false,
    bakiye: 0,
    hayvanlar: [],      // { isim, nadirlik, seviye }
    enIyiTakim: [],     // en iyi 3 hayvan
    takimKuruldu: false,
    sonHunt: 0,
    sonBattle: 0,
    sonCrate: 0,
    sonZoo: 0,
  };
  hesaplar.set(token, kayit);

  // -----------------------------------------------------------------
  // READY
  // -----------------------------------------------------------------
  client.on('ready', async () => {
    kayit.user = client.user.username || client.user.tag;
    kayit.durum = 'çalışıyor';
    console.log(`[SELF] ${kayit.user} giriş yaptı`);

    const kanal = await client.channels.fetch(kanalId).catch(() => null);
    if (!kanal) {
      kayit.durum = 'kanal yok';
      console.log(`[SELF] ${kayit.user} kanal bulunamadı`);
      return;
    }
    console.log(`[SELF] ${kayit.user} → #${kanal.name}`);

    // Başlangıçta hayvanları öğren
    await sleep(3000);
    await kanal.send('owo zoo');
    await sleep(2000);
    await kanal.send('owo inv');
    await sleep(2000);

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

    console.log(`[OWO] ${icerik.slice(0, 200).replace(/\n/g, ' ')}`);

    // --- CAPTCHA ---
    if (kucuk.includes('captcha') || kucuk.includes('human check')) {
      kayit.durdu = true;
      kayit.durum = 'captcha!';
      console.log(`[⚠️ CAPTCHA] ${kayit.user} manuel çöz!`);
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
        console.log(`[MUTE] ${sn}s`);
      }
    }

    // ---------------------------------------------------------------
    // BAKİYE
    // ---------------------------------------------------------------
    const cashM = icerik.match(/you currently have \*{0,2}([\d,]+)\*{0,2} cowoncy/i);
    if (cashM) {
      kayit.bakiye = parseInt(cashM[1].replace(/,/g, ''), 10);
      console.log(`[💰] Bakiye: ${kayit.bakiye}`);
    }

    // ---------------------------------------------------------------
    // ZOO PARSE — "owo zoo" cevabından hayvanları al
    // ---------------------------------------------------------------
    // Örnek format: "• dog (Common) | lvl 5 | 12/15"
    const hayvanRegex = /[•\-]\s*([a-zA-Zçğıöşü\s]+?)\s*\((\w+)\)/g;
    let match;
    const yeniHayvanlar = [];
    while ((match = hayvanRegex.exec(icerik)) !== null) {
      const isim = match[1].trim();
      const nadirlik = match[2].toLowerCase();
      if (NADIRLIK[nadirlik]) {
        yeniHayvanlar.push({ isim, nadirlik });
      }
    }

    if (yeniHayvanlar.length > 0) {
      // Mevcut listeyle birleştir
      for (const y of yeniHayvanlar) {
        const varMi = kayit.hayvanlar.find(
          h => h.isim.toLowerCase() === y.isim.toLowerCase()
        );
        if (!varMi) {
          kayit.hayvanlar.push(y);
        }
      }
      console.log(`[🦊] ${kayit.hayvanlar.length} hayvan biliniyor`);

      // En iyi 3'ü seç
      kayit.enIyiTakim = kayit.hayvanlar
        .slice()
        .sort((a, b) => NADIRLIK[b.nadirlik] - NADIRLIK[a.nadirlik])
        .slice(0, 3);

      console.log(`[🏆] En iyi takım: ${kayit.enIyiTakim.map(h => h.isim + '(' + h.nadirlik + ')').join(', ')}`);
    }

    // ---------------------------------------------------------------
    // CRATE SONUCU — silah kazandıysa
    // ---------------------------------------------------------------
    if (kucuk.includes('you received') && kucuk.includes('weapon')) {
      console.log(`[⚔️] Silah kazanıldı!`);
    }
  });

  client.on('error', (e) => console.log(`[HATA] ${kayit.user}: ${e.message}`));

  await client.login(token);
  return kayit;
}

// -------------------------------------------------------------------
// ANA DÖNGÜ — Akıllı sıralama
// -------------------------------------------------------------------
async function kasDongusu(client, kanal, kayit) {
  while (client.isReady()) {
    if (kayit.durdu) { await sleep(30000); continue; }

    const now = Date.now();
    if (now < kayit.muteUntil) { await sleep(kayit.muteUntil - now); continue; }

    let gonderilecek = null;

    // 1. Önce takımı kur (ilk seferde)
    if (!kayit.takimKuruldu && kayit.enIyiTakim.length >= 3) {
      // Takım kurulumunu 3 ayrı mesajla yap
      for (const h of kayit.enIyiTakim) {
        await kanal.send(`owo team add ${h.isim}`);
        await sleep(2000);
      }
      kayit.takimKuruldu = true;
      console.log(`[✅] Takım kuruldu`);
      continue;
    }

    // 2. Zoo'yu yenile (10 dk'da bir)
    if (now - kayit.sonZoo > 10 * 60 * 1000) {
      gonderilecek = 'owo zoo';
      kayit.sonZoo = now;
    }

    // 3. Crate aç (15 dk'da bir)
    else if (now - kayit.sonCrate > 15 * 60 * 1000) {
      gonderilecek = 'owo crate';
      kayit.sonCrate = now;
    }

    // 4. Battle at (5 dk'da bir)
    else if (now - kayit.sonBattle > 5 * 60 * 1000) {
      gonderilecek = 'owo battle';
      kayit.sonBattle = now;
    }

    // 5. Hunt at (sürekli)
    else if (now - kayit.sonHunt > kayit.cooldown * 1000) {
      gonderilecek = 'owo hunt';
      kayit.sonHunt = now;
    }

    if (!gonderilecek) { await sleep(1000); continue; }

    try {
      await kanal.send(gonderilecek);
      console.log(`[${kayit.user}] → ${gonderilecek}`);
    } catch (e) {
      console.log(`[HATA] gönderim: ${e.message}`);
      await sleep(5000);
      continue;
    }

    if (gonderilecek === 'owo hunt' && kayit.cooldown < MAX_COOLDOWN) {
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

app.get('/api/list', auth, (req, res) => {
  const liste = [];
  for (const [token, k] of hesaplar.entries()) {
    liste.push({
      tokenTam: token,
      user: k.user, kanalId: k.kanalId, durum: k.durum,
      cooldown: k.cooldown, bakiye: k.bakiye,
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
.card{background:#171a21;border:1px solid #262b36;border-radius:10px;padding:18px;margin-bottom:16px;max-width:1000px}
input{width:100%;padding:10px;background:#0f1115;border:1px solid #2b3140;border-radius:6px;color:#eee;font-family:monospace;margin-bottom:10px;box-sizing:border-box}
button{background:#5865f2;color:#fff;border:none;padding:10px 16px;border-radius:6px;cursor:pointer;font-weight:600;margin-right:6px}
button.danger{background:#ed4245}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:8px;border-bottom:1px solid #262b36}
.status{padding:2px 8px;border-radius:4px;font-size:11px}
.ok{background:#1e3a25;color:#4ade80}.err{background:#3a1e1e;color:#f87171}
code{background:#262b36;padding:2px 6px;border-radius:4px}
</style></head><body>
<div style="max-width:1000px;margin:0 auto">
<h1>🦊 OwO Ultra Farm</h1>
<div class="card"><label>Panel Şifresi</label><input id="panelKey" type="password"><button onclick="kaydetKey()">Kaydet</button></div>
<div class="card"><h3>Hesap Ekle</h3><input id="token" type="password" placeholder="Kullanıcı token'ı"><input id="kanalId" placeholder="Kanal ID"><button onclick="ekle()">Ekle</button><div id="addMsg"></div></div>
<div class="card"><button onclick="listele()">🔄 Yenile</button>
<table style="margin-top:12px"><thead><tr><th>Hesap</th><th>Bakiye</th><th>Hayvan</th><th>En İyi Takım</th><th>Durum</th><th></th></tr></thead>
<tbody id="tb"></tbody></table></div></div>
<script>
const $=id=>document.getElementById(id);const getKey=()=>localStorage.getItem('panelKey')||'';
function kaydetKey(){localStorage.setItem('panelKey',$('panelKey').value.trim());listele()}
async function api(u,b){const o={method:b?'POST':'GET',headers:{'Content-Type':'application/json','x-panel-key':getKey()}};if(b)o.body=JSON.stringify(b);return await(await fetch(u,o)).json()}
async function ekle(){const r=await api('/api/add',{token:$('token').value.trim(),kanalId:$('kanalId').value.trim()});$('addMsg').textContent=r.ok?'✅ Eklendi':'❌ '+r.error;if(r.ok)listele()}
async function kaldir(t){if(!confirm('Durdur?'))return;await api('/api/remove',{token:t});listele()}
async function listele(){const r=await api('/api/list');const tb=$('tb');if(!r.hesaplar?.length){tb.innerHTML='<tr><td colspan=6>Aktif hesap yok</td></tr>';return}tb.innerHTML='';for(const h of r.hesaplar){const c=h.durum==='çalışıyor'?'ok':'err';tb.innerHTML+=`<tr><td>${h.user||'...'}</td><td>${h.bakiye}</td><td>${h.hayvanSayisi}</td><td><code>${h.takim||'-'}</code></td><td><span class="status ${c}">${h.durum}</span></td><td><button class="danger" onclick="kaldir('${h.tokenTam}')">Durdur</button></td></tr>`}}
$('panelKey').value=getKey();listele();setInterval(listele,5000);
</script></body></html>`);
});

app.listen(PORT, '0.0.0.0', () => console.log(`[PANEL] :${PORT}`));
