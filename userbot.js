require("dotenv").config();

const fs = require("fs");
const input = require("input");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { NewMessage } = require("telegram/events");

const API_ID = Number(process.env.API_ID);
const API_HASH = process.env.API_HASH;
const OWNER_ID = String(process.env.OWNER_ID || "");
const SESSION_FILE = "./session.txt";
const DATA_FILE = "./data.json";

if (!API_ID || !API_HASH || !OWNER_ID) {
  console.error("API_ID, API_HASH, dan OWNER_ID wajib diisi di .env");
  process.exit(1);
}

const session = new StringSession(
  fs.existsSync(SESSION_FILE) ? fs.readFileSync(SESSION_FILE, "utf8").trim() : ""
);

const client = new TelegramClient(session, API_ID, API_HASH, {
  connectionRetries: 5
});

const DEFAULT_DB = {
  settings: { enabled: false, message: "", interval: 120 },
  groups: {},
  premium: []
};

function loadDB() {
  try {
    if (!fs.existsSync(DATA_FILE)) return structuredClone(DEFAULT_DB);
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return {
      settings: { ...DEFAULT_DB.settings, ...(data.settings || {}) },
      groups: data.groups || {},
      premium: Array.isArray(data.premium) ? data.premium.map(String) : []
    };
  } catch {
    return structuredClone(DEFAULT_DB);
  }
}

let db = loadDB();
let groupCache = [];
let loopRunning = false;

function saveDB() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function scanGroups() {
  const found = [];
  for await (const dialog of client.iterDialogs({})) {
    if (dialog.isGroup) {
      const id = String(dialog.id);
      const title = dialog.title || "(tanpa nama)";
      if (!db.groups[id]) {
        db.groups[id] = { title, enabled: false };
      } else {
        db.groups[id].title = title;
      }
      found.push({ id, title, enabled: !!db.groups[id].enabled });
    }
  }
  groupCache = found;
  saveDB();
  return found;
}


function isOwner(userId) {
  return OWNER_ID && String(userId) === OWNER_ID;
}

function isPremium(userId) {
  const id = String(userId);
  return isOwner(id) || db.premium.includes(id);
}

function premiumListText() {
  if (!db.premium.length) return "Belum ada Premium.";
  return db.premium.map((id, i) => `${i + 1}. ${id}`).join("\n");
}

function menuText() {
  return [
    "╭─ SC UNSERBOT TARGET V1",
    "│",
    "├ /menu",
    "├ /groups",
    "├ /shareadd <nomor>",
    "├ /sharedel <nomor>",
    "├ /sharelist",
    "├ /sharemsg <pesan>",
    "├ /shareint <detik>",
    "├ /shareon",
    "├ /shareoff",
    "├ /status",
    "├ /addpremium <user_id> [OWNER]",
    "├ /delpremium <user_id> [OWNER]",
    "└ /premiumlist [OWNER]"
  ].join("\n");
}

function targetList() {
  const entries = Object.entries(db.groups).filter(([, g]) => g.enabled);
  if (!entries.length) return "Belum ada target grup.";
  return entries.map(([id, g], i) => `${i + 1}. ${g.title} | ${id}`).join("\n");
}

async function autoShareLoop() {
  if (loopRunning) return;
  loopRunning = true;

  try {
    while (db.settings.enabled) {
      await scanGroups();

      const targets = Object.entries(db.groups)
        .filter(([, g]) => g.enabled);

      if (!db.settings.message.trim()) {
        console.log("Auto-Share aktif tetapi pesan belum diatur.");
        await sleep(5000);
        continue;
      }

      for (const [id, g] of targets) {
        if (!db.settings.enabled) break;

        try {
          await client.sendMessage(id, { message: db.settings.message });
          console.log(`Terkirim ke: ${g.title}`);
        } catch (err) {
          console.log(`Gagal ${g.title}: ${err.message}`);
        }

        await sleep(3000);
      }

      if (db.settings.enabled) {
        await sleep(Math.max(30, Number(db.settings.interval) || 120) * 1000);
      }
    }
  } finally {
    loopRunning = false;
  }
}

async function handleCommand(event) {
  const sender = await event.message.getSender();
  const senderId = sender && sender.id != null ? String(sender.id) : "";

  const raw = (event.message.message || "").trim();
  if (!raw.startsWith("/")) return;

  // Hanya Owner/Premium yang boleh mengontrol userbot.
  if (!isPremium(senderId)) return;

  const parts = raw.split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  if (command === "/addpremium") {
    if (!isOwner(senderId)) {
      await event.message.reply({ message: "Command ini hanya untuk Owner." });
      return;
    }
    const id = String(args[0] || "").trim();
    if (!/^\\d+$/.test(id)) {
      await event.message.reply({ message: "Gunakan: /addpremium <user_id>" });
      return;
    }
    if (id === OWNER_ID) {
      await event.message.reply({ message: "User tersebut sudah Owner." });
      return;
    }
    if (!db.premium.includes(id)) db.premium.push(id);
    saveDB();
    await event.message.reply({ message: `Premium ditambahkan: ${id}` });
    return;
  }

  if (command === "/delpremium") {
    if (!isOwner(senderId)) {
      await event.message.reply({ message: "Command ini hanya untuk Owner." });
      return;
    }
    const id = String(args[0] || "").trim();
    const before = db.premium.length;
    db.premium = db.premium.filter(x => x !== id);
    saveDB();
    await event.message.reply({
      message: before === db.premium.length
        ? "User tidak ditemukan di daftar Premium."
        : `Premium dihapus: ${id}`
    });
    return;
  }

  if (command === "/premiumlist") {
    if (!isOwner(senderId)) {
      await event.message.reply({ message: "Command ini hanya untuk Owner." });
      return;
    }
    await event.message.reply({ message: "DAFTAR PREMIUM\n\n" + premiumListText() });
    return;
  }

  if (command === "/menu" || command === "/start") {
    await event.message.reply({ message: menuText() });
    return;
  }

  if (command === "/groups") {
    const groups = await scanGroups();
    if (!groups.length) {
      await event.message.reply({ message: "Tidak ada grup yang terdeteksi." });
      return;
    }
    const text = groups.map((g, i) =>
      `${i + 1}. ${g.title} ${g.enabled ? "[TARGET]" : ""}`
    ).join("\n");
    await event.message.reply({ message: "DAFTAR GRUP\n\n" + text });
    return;
  }

  if (command === "/shareadd") {
    const n = Number(args[0]);
    if (!Number.isInteger(n) || n < 1) {
      await event.message.reply({ message: "Gunakan: /shareadd <nomor>" });
      return;
    }
    await scanGroups();
    const g = groupCache[n - 1];
    if (!g) {
      await event.message.reply({ message: "Nomor grup tidak ditemukan. Jalankan /groups." });
      return;
    }
    db.groups[g.id].enabled = true;
    saveDB();
    await event.message.reply({ message: `Target ditambahkan: ${g.title}` });
    return;
  }

  if (command === "/sharedel") {
    const n = Number(args[0]);
    const targets = Object.entries(db.groups).filter(([, g]) => g.enabled);
    if (!Number.isInteger(n) || n < 1 || !targets[n - 1]) {
      await event.message.reply({ message: "Gunakan: /sharedel <nomor> berdasarkan /sharelist" });
      return;
    }
    const [id, g] = targets[n - 1];
    db.groups[id].enabled = false;
    saveDB();
    await event.message.reply({ message: `Target dihapus: ${g.title}` });
    return;
  }

  if (command === "/sharelist") {
    await event.message.reply({ message: "TARGET GRUP\n\n" + targetList() });
    return;
  }

  if (command === "/sharemsg") {
    const msg = raw.slice("/sharemsg".length).trim();
    if (!msg) {
      await event.message.reply({ message: "Gunakan: /sharemsg <pesan>" });
      return;
    }
    db.settings.message = msg;
    saveDB();
    await event.message.reply({ message: "Pesan Auto-Share diperbarui." });
    return;
  }

  if (command === "/shareint") {
    const sec = Number(args[0]);
    if (!Number.isFinite(sec) || sec < 30) {
      await event.message.reply({ message: "Interval minimum 30 detik. Contoh: /shareint 120" });
      return;
    }
    db.settings.interval = Math.floor(sec);
    saveDB();
    await event.message.reply({ message: `Interval: ${db.settings.interval} detik.` });
    return;
  }

  if (command === "/shareon") {
    if (!Object.values(db.groups).some(g => g.enabled)) {
      await event.message.reply({ message: "Belum ada target. Tambahkan dengan /shareadd <nomor>." });
      return;
    }
    if (!db.settings.message.trim()) {
      await event.message.reply({ message: "Pesan belum diatur. Gunakan /sharemsg <pesan>." });
      return;
    }
    db.settings.enabled = true;
    saveDB();
    autoShareLoop();
    await event.message.reply({ message: "Auto-Share AKTIF pada target yang dipilih." });
    return;
  }

  if (command === "/shareoff") {
    db.settings.enabled = false;
    saveDB();
    await event.message.reply({ message: "Auto-Share DIMATIKAN." });
    return;
  }

  if (command === "/status") {
    const targets = Object.values(db.groups).filter(g => g.enabled).length;
    await event.message.reply({
      message: [
        "STATUS",
        `Auto-Share: ${db.settings.enabled ? "ON" : "OFF"}`,
        `Target: ${targets}`,
        `Interval: ${db.settings.interval} detik`,
        `Pesan: ${db.settings.message ? "tersedia" : "belum diatur"}`
      ].join("\n")
    });
    return;
  }
}

(async () => {
  await client.start({
    phoneNumber: async () => await input.text("Nomor Telegram: "),
    password: async () => await input.text("Password 2FA: "),
    phoneCode: async () => await input.text("Kode Telegram: "),
    onError: err => console.log("Login error:", err.message)
  });

  fs.writeFileSync(SESSION_FILE, client.session.save(), { mode: 0o600 });
  console.log("Userbot berhasil login.");
  await scanGroups();

  client.addEventHandler(handleCommand, new NewMessage({}));

  if (db.settings.enabled) autoShareLoop();

  console.log(menuText());
})();
