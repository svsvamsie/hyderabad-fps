// HYD.UI — HUD, screens, menus, radar, customizer.
(function () {
  const HYD = window.HYD = window.HYD || {};
  const $ = (id) => document.getElementById(id);

  const UI = {
    els: {},
    screens: [],

    init() {
      const ids = ["loading", "menu", "hud", "pause", "signup", "customizer", "shop", "howto", "result", "prompt", "mission-banner", "hitmarker"];
      for (const id of ids) this.els[id] = $(id);
      this.screens = ["menu", "hud", "pause", "signup", "customizer", "shop", "howto", "result", "prompt"];

      // menu
      $("btn-start").onclick = () => HYD.Game.startFreePlay();
      $("btn-howto").onclick = () => this.show("howto");
      $("btn-howto2").onclick = () => this.show("howto");
      $("btn-howto-close").onclick = () => this.back();
      $("btn-shop").onclick = () => { this.show("shop"); this.refreshShop(); };
      $("btn-shop2").onclick = () => { this.show("shop"); this.refreshShop(); };
      $("btn-shop-close").onclick = () => this.back();
      $("btn-signin").onclick = () => this.show("signup");
      $("btn-signout").onclick = () => HYD.Game.signOut();
      $("btn-resume").onclick = () => HYD.Game.resume();
      $("btn-customize").onclick = () => { this.show("customizer"); this.openCustomizer(); };
      $("btn-rampage").onclick = () => {
        const done = HYD.Game.progress && HYD.Game.progress.missionsCompleted.length >= HYD.Missions.list.length;
        if (!done) {
          HYD.UI.toast("Rowdy Rampage unlocks after all 5 missions!", "warn");
          return;
        }
        HYD.Missions.startRampage();
        HYD.Game.mode = "playing";
        HYD.Game.paused = false;
        HYD.UI.show("");
        if (!HYD.Game.smoke) document.getElementById("game-canvas").requestPointerLock();
      };
      $("btn-quit").onclick = () => HYD.Game.quitToMenu();

      // signup tabs
      document.querySelectorAll(".tab").forEach(tab => {
        tab.onclick = () => {
          document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
          tab.classList.add("active");
          $("signup-form").classList.toggle("hidden", tab.dataset.tab !== "signup-form");
          $("login-form").classList.toggle("hidden", tab.dataset.tab !== "login-form");
        };
      });
      $("signup-form").onsubmit = (e) => { e.preventDefault(); HYD.Game.doSignup($("su-name").value, $("su-email").value, $("su-pass").value); };
      $("login-form").onsubmit = (e) => { e.preventDefault(); HYD.Game.doLogin($("li-email").value, $("li-pass").value); };
      $("btn-google").onclick = () => HYD.Game.doGoogle();
      $("btn-guest").onclick = () => HYD.Game.continueGuest();

      // customizer
      $("btn-save-avatar").onclick = () => HYD.Game.saveAvatar();
      $("btn-cancel-avatar").onclick = () => this.back();
      ["cz-name", "cz-outfit", "cz-color", "cz-skin", "cz-head", "cz-accessory", "cz-weapon"].forEach(id => {
        $(id).addEventListener("input", () => this.drawAvatar());
      });

      // result
      $("btn-result-ok").onclick = () => HYD.Game.continueAfterResult();
      $("btn-result-menu").onclick = () => HYD.Game.quitToMenu();

      // prompt
      $("prompt-ok").onclick = () => this._resolvePrompt(true);
      $("prompt-cancel").onclick = () => this._resolvePrompt(false);

      this.updateAccountLine();
    },

    show(name) {
      for (const s of this.screens) {
        if (s === "hud") continue;
        this.els[s].classList.toggle("hidden", s !== name);
      }
      this.els.hud.classList.toggle("hidden", name === "menu" || name === "result" || name === "prompt");
      if (name === "menu") this.updateAccountLine();
    },

    showHUD(showIt) {
      this.els.hud.classList.toggle("hidden", !showIt);
    },

    back() {
      if (HYD.Game.inGame()) {
        this.show("pause");
      } else {
        this.show("menu");
      }
    },

    // ---------------- account line ----------------
    updateAccountLine() {
      const signed = HYD.Auth.isSignedIn();
      const email = HYD.Auth.currentEmail();
      const line = $("account-line");
      $("btn-signin").classList.toggle("hidden", signed);
      $("btn-signout").classList.toggle("hidden", !signed);
      if (signed) {
        line.textContent = "Signed in: " + email + " — progress auto-saves";
      } else {
        line.textContent = "Guest mode — progress is not saved";
      }
    },

    // ---------------- HUD ----------------
    setObjective(text, count) {
      $("obj-title").textContent = HYD.Missions.current ? HYD.Missions.current.title : "Hyderabad";
      $("obj-desc").textContent = text;
      $("obj-count").textContent = count || "";
    },

    banner(title, desc) {
      $("mb-title").textContent = title;
      $("mb-desc").textContent = desc || "";
      this.els["mission-banner"].classList.remove("hidden");
      clearTimeout(this._bannerT);
      this._bannerT = setTimeout(() => this.els["mission-banner"].classList.add("hidden"), 4200);
    },

    toast(msg, type) {
      const t = document.createElement("div");
      t.className = "toast " + (type || "");
      t.textContent = msg;
      $("toasts").appendChild(t);
      setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity 0.4s"; }, 2600);
      setTimeout(() => t.remove(), 3100);
      while ($("toasts").children.length > 4) $("toasts").firstChild.remove();
    },

    feed(text, type) {
      const f = document.createElement("div");
      f.style.color = type === "good" ? "#7dcea0" : type === "warn" ? "#f0b429" : type === "gold" ? "#ffd700" : "#f1948a";
      f.textContent = text;
      $("feed").appendChild(f);
      setTimeout(() => f.remove(), 3000);
    },

    hitMarker() {
      this.els.hitmarker.classList.remove("hidden");
      clearTimeout(this._hm);
      this._hm = setTimeout(() => this.els.hitmarker.classList.add("hidden"), 120);
    },

    damageFlash(amt) {
      const v = $("vignette");
      v.style.boxShadow = "inset 0 0 160px rgba(192,57,43," + Math.min(0.8, amt) + ")";
      setTimeout(() => { v.style.boxShadow = "inset 0 0 160px rgba(192,57,43,0)"; }, 300);
    },

    updateHUD(dt) {
      const P = HYD.Player;
      const G = HYD.Game;
      $("money").textContent = Math.floor(P.money).toLocaleString("en-IN");
      $("coins").textContent = P.coins;
      $("kills").textContent = P.kills;
      $("health-fill").style.width = P.hp + "%";
      $("armor-fill").style.width = P.armor + "%";
      const w = P.weapons[P.current];
      $("weapon-name").textContent = w.name + (P.reloading ? " [RELOADING]" : "");
      $("ammo").textContent = w.mag + " / " + w.reserve;
      const ft = $("free-timer");
      if (G.freeMode && !G.signedUp) {
        ft.classList.remove("hidden");
        const secs = Math.ceil(G.freeTime);
        ft.textContent = "FREE SESSION 0:" + String(secs).padStart(2, "0");
        if (secs <= 10) ft.style.background = "rgba(192,57,43,1)";
      } else ft.classList.add("hidden");
      const want = $("wanted");
      if (P.wanted > 0) { want.classList.remove("hidden"); want.textContent = "★".repeat(P.wanted); }
      else want.classList.add("hidden");
      this.drawRadar();
    },

    drawRadar() {
      const c = $("radar");
      const ctx = c.getContext("2d");
      const size = c.width;
      ctx.clearRect(0, 0, size, size);
      const cx = size / 2, cy = size / 2;
      const scale = 75 / 200; // px per world unit (200 world units = 75px)
      ctx.save();
      ctx.translate(cx, cy);
      const P = HYD.Player;
      ctx.rotate(-P.yaw);
      // range rings
      ctx.strokeStyle = "rgba(240,180,41,0.35)";
      ctx.beginPath(); ctx.arc(0, 0, 37, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 74, 0, Math.PI * 2); ctx.stroke();
      // buildings
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      for (const b of HYD.World.radarBlocks) {
        const dx = (b.x - P.pos.x) * scale, dz = (b.z - P.pos.z) * scale;
        if (Math.hypot(dx, dz) > 78) continue;
        ctx.fillRect(dx - b.w / 2 * scale, dz - b.d / 2 * scale, Math.max(2, b.w * scale), Math.max(2, b.d * scale));
      }
      // objectives
      ctx.fillStyle = "#2ecc71";
      for (const m of HYD.World.markers) {
        if (!m.group.visible) continue;
        const dx = (m.pos.x - P.pos.x) * scale, dz = (m.pos.z - P.pos.z) * scale;
        if (Math.hypot(dx, dz) > 78) continue;
        ctx.beginPath(); ctx.arc(dx, dz, 4, 0, Math.PI * 2); ctx.fill();
      }
      // enemies
      ctx.fillStyle = "#e74c3c";
      for (const e of HYD.Missions.enemies) {
        const dx = (e.position.x - P.pos.x) * scale, dz = (e.position.z - P.pos.z) * scale;
        if (Math.hypot(dx, dz) > 78) continue;
        ctx.fillRect(dx - 1.5, dz - 1.5, 3, 3);
      }
      // player arrow
      ctx.save();
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = "#f0b429";
      ctx.beginPath();
      ctx.moveTo(0, -5); ctx.lineTo(4, 4); ctx.lineTo(0, 1.5); ctx.lineTo(-4, 4);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.restore();
      // north tick
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "10px Mukta, sans-serif";
      ctx.fillText("N", cx - 3, 12);
    },

    showResult(ok, title, body) {
      $("result-title").textContent = title;
      $("result-body").textContent = body || "";
      $("btn-result-ok").textContent = ok ? "Continue" : "Retry Mission";
      this.show("result");
    },

    // ---------------- prompt ----------------
    prompt(title, body) {
      $("prompt-title").textContent = title;
      $("prompt-body").textContent = body;
      this.show("prompt");
      return new Promise(res => { this._promptResolve = res; });
    },
    _resolvePrompt(val) {
      this.show(HYD.Game.inGame() ? "pause" : "menu");
      if (this._promptResolve) this._promptResolve(val);
      this._promptResolve = null;
    },

    // ---------------- customizer ----------------
    openCustomizer() {
      const av = HYD.Game.avatar;
      $("cz-name").value = av.name;
      $("cz-outfit").value = av.outfit;
      $("cz-color").value = av.color;
      $("cz-skin").value = av.skin;
      $("cz-head").value = av.head;
      $("cz-accessory").value = av.accessory;
      $("cz-weapon").value = av.weapon;
      $("cz-coins").textContent = HYD.Player.coins;
      this.drawAvatar();
    },

    avatarPrices() {
      const prices = {
        police: 200, gold: 500, weapon_gold: 300, weapon_biryani: 150
      };
      return prices;
    },

    drawAvatar() {
      const c = $("avatar-preview");
      const ctx = c.getContext("2d");
      const W = c.width, H = c.height;
      const av = {
        outfit: $("cz-outfit").value,
        color: $("cz-color").value,
        skin: $("cz-skin").value,
        head: $("cz-head").value,
        accessory: $("cz-accessory").value,
        weapon: $("cz-weapon").value,
        name: $("cz-name").value
      };
      ctx.clearRect(0, 0, W, H);
      // bg
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#2c6e49"); grad.addColorStop(1, "#10251b");
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
      // ground shadow
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.beginPath(); ctx.ellipse(W / 2, 292, 70, 12, 0, 0, Math.PI * 2); ctx.fill();

      const cx = W / 2;
      // legs
      ctx.fillStyle = "#2b2b2b";
      ctx.fillRect(cx - 22, 226, 18, 66);
      ctx.fillRect(cx + 4, 226, 18, 66);
      // body
      let bodyColor = av.color;
      if (av.outfit === "police") bodyColor = "#5d6d3a";
      if (av.outfit === "gold") bodyColor = "#d4a017";
      ctx.fillStyle = bodyColor;
      if (av.outfit === "pathani" || av.outfit === "gold") {
        // long pathani
        ctx.fillRect(cx - 30, 138, 60, 92);
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.fillRect(cx - 30, 138, 10, 92);
        ctx.fillRect(cx + 20, 138, 10, 92);
        // buttons
        ctx.fillStyle = "#222";
        for (let y = 152; y < 214; y += 18) { ctx.beginPath(); ctx.arc(cx, y, 2.4, 0, Math.PI * 2); ctx.fill(); }
      } else if (av.outfit === "kurta") {
        ctx.fillRect(cx - 26, 142, 52, 86);
        ctx.beginPath(); ctx.moveTo(cx, 142); ctx.lineTo(cx - 12, 228); ctx.lineTo(cx + 12, 228); ctx.closePath(); ctx.fill();
      } else if (av.outfit === "police") {
        ctx.fillRect(cx - 28, 140, 56, 88);
        ctx.fillStyle = "#4a572d";
        ctx.fillRect(cx - 28, 140, 56, 12);
        ctx.fillStyle = "#d4a017";
        ctx.fillRect(cx - 3, 150, 6, 10);
      } else {
        // hoodie
        ctx.fillRect(cx - 30, 140, 60, 90);
        ctx.beginPath(); ctx.arc(cx, 146, 24, Math.PI, 0); ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(cx - 30, 192, 60, 6);
        ctx.fillRect(cx - 1, 140, 2, 90);
      }
      // chain
      if (av.accessory === "chain") {
        ctx.strokeStyle = "#f0b429"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(cx, 160, 16, 0.15, Math.PI - 0.15); ctx.stroke();
        ctx.fillStyle = "#f0b429";
        ctx.beginPath(); ctx.arc(cx, 178, 6, 0, Math.PI * 2); ctx.fill();
      }
      // head
      ctx.fillStyle = av.skin;
      ctx.beginPath(); ctx.arc(cx, 104, 30, 0, Math.PI * 2); ctx.fill();
      // hair/headwear
      if (av.head === "turban") {
        ctx.fillStyle = "#d4a017";
        ctx.beginPath(); ctx.arc(cx, 82, 26, Math.PI, 0); ctx.fill();
        ctx.fillRect(cx - 26, 74, 52, 10);
        ctx.fillStyle = "#b8860b";
        ctx.fillRect(cx - 4, 72, 8, 14);
      } else if (av.head === "topi") {
        ctx.fillStyle = "#2e2e2e";
        ctx.beginPath(); ctx.arc(cx, 82, 22, Math.PI, 0); ctx.fill();
      } else if (av.head === "dupatta") {
        ctx.fillStyle = av.color;
        ctx.beginPath(); ctx.arc(cx, 82, 26, Math.PI, 0); ctx.fill();
        ctx.fillRect(cx - 26, 76, 52, 8);
      } else {
        ctx.fillStyle = "rgba(20,20,20,0.75)";
        ctx.beginPath(); ctx.arc(cx, 82, 22, Math.PI, 0); ctx.fill();
      }
      // eyes
      if (av.accessory === "sunglasses") {
        ctx.fillStyle = "#111";
        ctx.fillRect(cx - 24, 96, 20, 9);
        ctx.fillRect(cx + 4, 96, 20, 9);
        ctx.strokeStyle = "#111"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx - 4, 100); ctx.lineTo(cx + 4, 100); ctx.stroke();
      } else {
        ctx.fillStyle = "#222";
        ctx.beginPath(); ctx.arc(cx - 11, 102, 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 11, 102, 2.6, 0, Math.PI * 2); ctx.fill();
      }
      // nose ring
      if (av.accessory === "earring") {
        ctx.strokeStyle = "#f0b429"; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.arc(cx - 6, 118, 4, 0, Math.PI * 2); ctx.stroke();
      }
      // weapon
      const wcolor = av.weapon === "gold" ? "#d4a017" : av.weapon === "biryani" ? "#6d3a1f" : "#4b4b50";
      ctx.fillStyle = wcolor;
      ctx.fillRect(cx + 26, 168, 46, 10);
      ctx.fillRect(cx + 30, 176, 7, 16);
      // name
      ctx.fillStyle = "#fff";
      ctx.font = "800 17px Mukta, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText((av.name || "Noob Saar").toUpperCase(), cx, 306);
    },

    // ---------------- shop ----------------
    refreshShop() {
      $("shop-money").textContent = Math.floor(HYD.Player.money).toLocaleString("en-IN");
      $("shop-coins").textContent = HYD.Player.coins;
      const status = HYD.Monetize.demo
        ? "DEMO MODE — Razorpay not configured. Purchases are simulated locally. Add your Razorpay Key ID in js/config.js to go live (see README)."
        : "LIVE payments via Razorpay (UPI / cards / netbanking / wallets).";
      $("pay-status").textContent = status;
      document.querySelectorAll(".btn-buy").forEach(b => {
        b.onclick = () => HYD.Monetize.buy(b.dataset.plan);
      });
    }
  };

  HYD.UI = UI;
})();
