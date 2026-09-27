const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder } = require('discord.js');
const SelfClient = require('discord.js-selfbot-v13').Client;

// -------------------------------------------------------------------
// AYARLAR
// -------------------------------------------------------------------
const ANA_TOKEN = process.env.ANA_BOT_TOKEN;   // Ana Discord botunun token'ı (ZORUNLU)
const CLIENT_ID = process.env.CLIENT_ID;       // Bot application ID (ZORUNLU)
const GUILD_ID  = process.env.GUILD_ID;        // Slash komutların kayıt olacağı sunucu ID (opsiyonel)

const OWO_BOT_ID = process.env.OWO_BOT_ID || '408785106942164992';

const BASLANGIC_COOLDOWN = parseInt(process.env.BASLANGIC_COOLDOWN || '15', 10);
const MAX_COOLDOWN       = parseInt(process.env.MAX_COOLDOWN       || '20', 10);
const ARTIS              = parseInt(process.env.COOLDOWN_ARTIS    || '1',  10);

const CF_AKTIF       = (process.env.CF_AKTIF || 'true') === 'true';
const CF_MIN_BAKIYE  = parseInt(process.env.CF_MIN_BAKIYE  || '200', 10);
const CF_BAHIS_ORANI = parseFloat(process.env.CF_BAHIS_ORANI || '0.05');
const CF_MIN_BAHIS   = parseInt(process.env.CF_MIN_BAHIS   || '10',  10);
const CF_MAX_BAHIS   = parseInt(process.env.CF_MAX_BAHIS   || '100', 10);
const CF_INTERVAL    = parseInt(process.env.CF_INTERVAL    || '300000', 10);

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
// SELF-BOT BAŞLATICI
// -------------------------------------------------------------------
async function selfBotBaslat(token, kanalId, ownerId) {
  if (hesaplar.has(token)) throw new Error('Bu token zaten ekli.');

  const client = new SelfClient({ checkUpdate: false });
  const ozel = OZEL_KOMUTLAR.map((k) => ({ ...k }));

  const kayit = {
    client, ownerId,
    cooldown: BASLANGIC_COOLDOWN,
    muteUntil: 0,
    kanalId,
    durum: 'bağlanıyor',
    user: null,
    durdu: false,
    ozel,
    bakiye: 0,
    cfSon: 0, cfSeri: 0, cfMola: 0,
    kazanc: 0, kayip: 0,
    hayvanlar: [], enIyiTakim: [], takimKuruldu: false,
    sonHunt: 0, sonBattle: 0, sonCrate: 0, sonZoo: 0,
  };
  hesaplar.set(token, kayit);

  // READY
  client.on('ready', async () => {
    kayit.user = client.user.username || client.user.tag || 'bilinmiyor';
    kayit.durum = 'çalışıyor';
    console.log(`[SELF] ${kayit.user} giriş yaptı`);

    const kanal = await client.channels.fetch(kanalId).catch(() => null);
    if (!kanal) {
      kayit.durum = 'kanal yok';
      console.log(`[SELF] ${kayit.user} kanal bulunamadı`);
      return;
    }
    console.log(`[SELF] ${kayit.user} → #${kanal.name}`);

    await sleep(3000);
    await kanal.send('owo zoo');
    await sleep(2500);
    await kanal.send('owo inv');
    await sleep(2500);

    kasDongusu(client, kanal, kayit);
  });

  // MESAJ DİNLE
  client.on('messageCreate', async (message) => {
    if (message.author.id !== OWO_BOT_ID) return;
    const icerik = message.content;
    const kucuk = icerik.toLowerCase();
    const now = Date.now();

    // Buton tıklama
    try {
      if (message.components && message.components.length > 0) {
        for (const row of message.components) {
          if (!row.components) continue;
          for (const comp of row.components) {
            const etiket = (comp.label || '').toLowerCase();
            const hedef = ['verify','confirm','click here','tıkla','doğrula','i am human','human','continue','devam','next'];
            if (comp.type === 'BUTTON' && hedef.some(h => etiket.includes(h))) {
              try {
                await comp.click();
                console.log(`[🖱️ ${kayit.user}] Butona tıklandı: "${comp.label}"`);
                await sleep(2000);
              } catch (e) { console.log(`[🖱️ HATA] ${e.message}`); }
            }
          }
        }
      }
    } catch (e) { console.log(`[BUTON HATA] ${e.message}`); }

    console.log(`[OWO/${kayit.user}] ${icerik.slice(0, 180).replace(/\n/g, ' ')}`);

    // Captcha
    if ((kucuk.includes('captcha') || kucuk.includes('human check')) &&
        (!message.components || message.components.length === 0)) {
      kayit.durdu = true; kayit.durum = 'captcha!';
      console.log(`[⚠️ CAPTCHA/${kayit.user}] manuel çöz!`);
      return;
    }

    // Ban
    if (kucuk.includes('you have been banned') || kucuk.includes('banned from owo')) {
      kayit.durdu = true; kayit.durum = 'banlı';
      console.log(`[🚫 BAN/${kayit.user}]`);
      return;
    }

    // Mute
    if (kucuk.includes('muted') && !kucuk.includes('unmuted')) {
      const m = kucuk.match(/muted for (\d+)\s*(minute|second|hour|min|sec)/);
      if (m) {
        const adet = parseInt(m[1], 10);
        const brm = m[2];
        let sn = brm.includes('hour') ? adet * 3600 : brm.includes('min') ? adet * 60 : adet;
        kayit.muteUntil = now + sn * 1000;
        console.log(`[MUTE/${kayit.user}] ${sn}s`);
      } else { kayit.muteUntil = now + 300 * 1000; }
    }

    if (kucuk.includes("you can't use") || kucuk.includes('slow down')) {
      kayit.muteUntil = now + 5000;
    }

    // Bakiye
    const cashM = icerik.match(/you currently have \*{0,2}([\d,]+)\*{0,2} cowoncy/i);
    if (cashM) {
      kayit.bakiye = parseInt(cashM[1].replace(/,/g, ''), 10);
      console.log(`[💰 ${kayit.user}] ${kayit.bakiye}`);
    }

    // CF kazanç
    const wonM = icerik.match(/you won \*{0,2}([\d,]+)\*{0,2} cowoncy/i);
    if (wonM) {
      const k = parseInt(wonM[1].replace(/,/g, ''), 10);
      kayit.bakiye += k; kayit.kazanc += k; kayit.cfSeri = 0;
      console.log(`[🟢 CF+/${kayit.user}] +${k}`);
    }

    // CF kayıp
    const lostM = icerik.match(/you lost \*{0,2}([\d,]+)\*{0,2} cowoncy/i);
    if (lostM) {
      const k = parseInt(lostM[1].replace(/,/g, ''), 10);
      kayit.bakiye -= k; kayit.kayip += k; kayit.cfSeri++;
      console.log(`[🔴 CF-/${kayit.user}] -${k}`);
      if (kayit.cfSeri >= 3) { kayit.cfMola = now + 30 * 60 * 1000; kayit.cfSeri = 0; }
    }

    // Satış
    const sellM = icerik.match(/sold \*{0,2}(\d+)\*{0,2} animals? for \*{0,2}([\d,]+)\*{0,2}/i);
    if (sellM) {
      const t = parseInt(sellM[2].replace(/,/g, ''), 10);
      kayit.bakiye += t;
      console.log(`[💵 ${kayit.user}] ${sellM[1]} satıldı +${t}`);
    }

    // Zoo parse
    const hRegex = /[•\-]\s*([a-zA-Zçğıöşü\s]+?)\s*\((\w+)\)/g;
    let mm;
    const yeniler = [];
    while ((mm = hRegex.exec(icerik)) !== null) {
      const isim = mm[1].trim();
      const nad = mm[2].toLowerCase();
      if (NADIRLIK[nad]) yeniler.push({ isim, nadirlik: nad });
    }
    if (yeniler.length > 0) {
      for (const y of yeniler) {
        if (!kayit.hayvanlar.find(h => h.isim.toLowerCase() === y.isim.toLowerCase()))
          kayit.hayvanlar.push(y);
      }
      kayit.enIyiTakim = kayit.hayvanlar.slice()
        .sort((a, b) => NADIRLIK[b.nadirlik] - NADIRLIK[a.nadirlik]).slice(0, 3);
      console.log(`[🦊 ${kayit.user}] ${kayit.hayvanlar.length} hayvan, takım: ${kayit.enIyiTakim.map(h=>h.isim).join(', ')}`);
    }
  });

  client.on('error', (e) => console.log(`[SELF HATA/${kayit.user}] ${e.message}`));

  await client.login(token);
  return kayit;
}

// -------------------------------------------------------------------
// KASMA DÖNGÜSÜ
// -------------------------------------------------------------------
async function kasDongusu(client, kanal, kayit) {
  while (client.isReady()) {
    if (kayit.durdu) { await sleep(30000); continue; }
    const now = Date.now();
    if (now < kayit.muteUntil) { await sleep(kayit.muteUntil - now); continue; }

    let gonder = null;

    if (!kayit.takimKuruldu && kayit.enIyiTakim.length >= 3) {
      for (const h of kayit.enIyiTakim) {
        try {
          await kanal.send(`owo team add ${h.isim}`);
          console.log(`[${kayit.user}] team add ${h.isim}`);
        } catch (e) {}
        await sleep(2500);
      }
      kayit.takimKuruldu = true;
      console.log(`[✅ ${kayit.user}] takım kuruldu`);
      continue;
    }

    for (const k of kayit.ozel) {
      if (now - k.son >= k.interval) { gonder = k.cmd; k.son = now; break; }
    }
    if (!gonder && now - kayit.sonZoo > 10*60*1000) { gonder = 'owo zoo'; kayit.sonZoo = now; }
    if (!gonder && now - kayit.sonCrate > 15*60*1000) { gonder = 'owo crate'; kayit.sonCrate = now; }
    if (!gonder && now - kayit.sonBattle > 5*60*1000) { gonder = 'owo battle'; kayit.sonBattle = now; }
    if (!gonder && CF_AKTIF && now - kayit.cfSon >= CF_INTERVAL) {
      if (now >= kayit.cfMola && kayit.bakiye >= CF_MIN_BAKIYE) {
        let b = Math.floor(kayit.bakiye * CF_BAHIS_ORANI);
        if (b < CF_MIN_BAHIS) b = CF_MIN_BAHIS;
        if (b > CF_MAX_BAHIS) b = CF_MAX_BAHIS;
        const yon = Math.random() < 0.5 ? 'heads' : 'tails';
        gonder = `owo cf ${b} ${yon}`;
        kayit.cfSon = now;
      }
    }
    if (!gonder && now - kayit.sonHunt >= kayit.cooldown * 1000) {
      gonder = ANA_KOMUTLAR[Math.floor(Math.random() * ANA_KOMUTLAR.length)];
      kayit.sonHunt = now;
    }
    if (!gonder) { await sleep(1000); continue; }

    try {
      await kanal.send(gonder);
      console.log(`[${kayit.user}] → ${gonder} (cd=${kayit.cooldown})`);
    } catch (e) {
      console.log(`[GÖNDER HATA] ${e.message}`);
      await sleep(5000); continue;
    }

    if (kayit.cooldown < MAX_COOLDOWN) {
      kayit.cooldown += ARTIS;
      if (kayit.cooldown > MAX_COOLDOWN) kayit.cooldown = MAX_COOLDOWN;
    }
    await sleep(2000);
  }
}

// -------------------------------------------------------------------
// ANA BOT (slash komutlar)
// -------------------------------------------------------------------
const bot = new Client({ intents: [GatewayIntentBits.Guilds] });

const komutlar = [
  new SlashCommandBuilder()
    .setName('add')
    .setDescription('OwO kasmak için bir hesap (token) ekler')
    .addStringOption(o => o.setName('token').setDescription('Kullanıcı token\'ı').setRequired(true))
    .addChannelOption(o => o.setName('kanal').setDescription('OwO kasılacak kanal').setRequired(true)),
  new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Bir hesabı durdurur')
    .addStringOption(o => o.setName('token').setDescription('Kaldırılacak token').setRequired(true)),
  new SlashCommandBuilder()
    .setName('list')
    .setDescription('Aktif hesapları listeler'),
  new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Captcha çözüldü, devam et')
    .addStringOption(o => o.setName('token').setDescription('Devam edecek token').setRequired(true)),
];

bot.once('ready', async () => {
  console.log(`[ANA BOT] ${bot.user.tag} giriş yaptı`);
  try {
    const rest = new REST({ version: '10' }).setToken(ANA_TOKEN);
    const veri = komutlar.map(k => k.toJSON());
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: veri });
      console.log(`[ANA BOT] ${veri.length} komut ${GUILD_ID} sunucusuna kaydedildi`);
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: veri });
      console.log(`[ANA BOT] ${veri.length} global komut kaydedildi`);
    }
  } catch (e) { console.log(`[SLASH HATA] ${e.message}`); }
});

bot.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  // /add
  if (commandName === 'add') {
    await interaction.deferReply({ ephemeral: true });
    const token = interaction.options.getString('token');
    const kanal = interaction.options.getChannel('kanal');

    if (hesaplar.has(token)) {
      return interaction.editReply('⚠️ Bu token zaten aktif. Önce `/remove` ile kaldır.');
    }

    try {
      await selfBotBaslat(token, kanal.id, interaction.user.id);
      await interaction.editReply(
        `✅ Hesap başlatıldı!\n**Kanal:** ${kanal}\n**Cooldown:** ${BASLANGIC_COOLDOWN}s (maks ${MAX_COOLDOWN}s)\n\n` +
        `Birkaç saniye içinde loglarda giriş mesajını göreceksin.`
      );
    } catch (e) {
      await interaction.editReply(`❌ Hata: ${e.message}`);
    }
  }

  // /remove
  if (commandName === 'remove') {
    await interaction.deferReply({ ephemeral: true });
    const token = interaction.options.getString('token');
    const k = hesaplar.get(token);
    if (!k) return interaction.editReply('❌ Bu token aktif değil.');
    try { await k.client.destroy(); } catch {}
    hesaplar.delete(token);
    await interaction.editReply('✅ Hesap durduruldu.');
  }

  // /list
  if (commandName === 'list') {
    await interaction.deferReply({ ephemeral: true });
    if (hesaplar.size === 0) return interaction.editReply('📭 Aktif hesap yok.');

    const emb = new EmbedBuilder().setTitle('🦊 Aktif Hesaplar').setColor(0x5865f2);
    let i = 1;
    for (const [token, k] of hesaplar.entries()) {
      emb.addFields({
        name: `${i}. ${k.user || 'bağlanıyor...'}`,
        value:
          `**Durum:** ${k.durum}\n` +
          `**Bakiye:** ${k.bakiye.toLocaleString()}\n` +
          `**Kazanç/Kayıp:** +${k.kazanc} / -${k.kayip}\n` +
          `**Kanal:** <#${k.kanalId}>\n` +
          `**Hayvan:** ${k.hayvanlar.length} | **Takım:** ${k.enIyiTakim.map(h=>h.isim).join(', ') || '-'}`,
        inline: false
      });
      i++;
    }
    await interaction.editReply({ embeds: [emb] });
  }

  // /resume
  if (commandName === 'resume') {
    await interaction.deferReply({ ephemeral: true });
    const token = interaction.options.getString('token');
    const k = hesaplar.get(token);
    if (!k) return interaction.editReply('❌ Bu token aktif değil.');
    k.durdu = false;
    k.durum = 'çalışıyor';
    await interaction.editReply('✅ Devam ediyor.');
  }
});

// -------------------------------------------------------------------
// BAŞLAT
// -------------------------------------------------------------------
if (!ANA_TOKEN || !CLIENT_ID) {
  console.log('❌ ANA_BOT_TOKEN veya CLIENT_ID eksik!');
  process.exit(1);
}

bot.login(ANA_TOKEN);
