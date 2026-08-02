// HYD.Auth — device-local accounts. Demo-grade: Google button is a simulated consent flow;
// real Google Identity Services wiring is documented in README.md.
(function () {
  const HYD = window.HYD = window.HYD || {};
  const LS_ACCOUNTS = "hydfps.accounts.v1";
  const LS_SESSION = "hydfps.session.v1";
  const LS_PROGRESS = "hydfps.progress.v1.";

  function hexBytes(buf) {
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  function simpleHash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  async function hashPw(pw, salt) {
    try {
      if (crypto && crypto.subtle) {
        const data = new TextEncoder().encode(salt + "::" + pw);
        const buf = await crypto.subtle.digest("SHA-256", data);
        return hexBytes(buf);
      }
    } catch (e) { /* fall through */ }
    return simpleHash(salt + "::" + pw);
  }

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }

  const Auth = {
    emailRE: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,

    _accounts() { return loadJSON(LS_ACCOUNTS, {}); },
    _saveAccounts(a) { return saveJSON(LS_ACCOUNTS, a); },

    session() { return loadJSON(LS_SESSION, null); },

    isSignedIn() {
      const s = this.session();
      return !!(s && s.email && this._accounts()[s.email]);
    },

    currentEmail() {
      const s = this.session();
      return s ? s.email : null;
    },

    async signup(email, password, name) {
      email = (email || "").trim().toLowerCase();
      if (!this.emailRE.test(email)) return { ok: false, error: "Enter a valid email address (e.g. you@gmail.com)." };
      if (!password || password.length < 6) return { ok: false, error: "Password must be at least 6 characters." };
      const accs = this._accounts();
      if (accs[email]) return { ok: false, error: "An account with this email already exists. Sign in instead." };
      const salt = Math.random().toString(36).slice(2) + Date.now().toString(36);
      const h = await hashPw(password, salt);
      accs[email] = {
        name: (name || email.split("@")[0]).slice(0, 20),
        salt, h, createdAt: Date.now(), provider: "email"
      };
      this._saveAccounts(accs);
      saveJSON(LS_SESSION, { email });
      return { ok: true };
    },

    async login(email, password) {
      email = (email || "").trim().toLowerCase();
      const accs = this._accounts();
      const acc = accs[email];
      if (!acc) return { ok: false, error: "No account found for that email. Create one first." };
      const h = await hashPw(password, acc.salt);
      if (h !== acc.h) return { ok: false, error: "Wrong password. Try again." };
      saveJSON(LS_SESSION, { email });
      return { ok: true };
    },

    // Simulated Google consent (demo). In production: Google Identity Services + OAuth client.
    async googleSignIn(emailHint) {
      const email = (emailHint || "hyderabadi.gamer@gmail.com").trim().toLowerCase();
      const accs = this._accounts();
      if (!accs[email]) {
        const salt = Math.random().toString(36).slice(2) + Date.now().toString(36);
        const h = await hashPw("google-sso-" + salt, salt);
        accs[email] = {
          name: "GooglePlayer_" + email.split("@")[0].slice(0, 10),
          salt, h, createdAt: Date.now(), provider: "google"
        };
        this._saveAccounts(accs);
      }
      saveJSON(LS_SESSION, { email });
      return { ok: true, email };
    },

    logout() {
      localStorage.removeItem(LS_SESSION);
    },

    account(email) {
      return this._accounts()[email];
    },

    updateAccount(email, patch) {
      const accs = this._accounts();
      if (!accs[email]) return false;
      accs[email] = Object.assign({}, accs[email], patch);
      this._saveAccounts(accs);
      return true;
    },

    // ---------- progress ----------
    progressKey(email) { return LS_PROGRESS + (email || "guest"); },

    defaultProgress() {
      return {
        version: 1,
        email: null, name: "Charminar_Champ",
        avatar: null, // set via UI
        missionsCompleted: [],
        currentMission: 0,
        money: 500,
        coins: 0,
        kills: 0,
        bestRampage: 0,
        elite: false,
        owned: [],
        settings: { sens: 1.0, fov: 75, music: true, sfx: true },
        stats: { shots: 0, hits: 0 }
      };
    },

    loadProgress(email) {
      return loadJSON(this.progressKey(email), null);
    },

    saveProgress(email, progress) {
      if (!email) return false;
      return saveJSON(this.progressKey(email), progress);
    },

    clearProgress(email) {
      localStorage.removeItem(this.progressKey(email));
    }
  };

  HYD.Auth = Auth;
})();
