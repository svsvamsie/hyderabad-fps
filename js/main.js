// HYD.Game — boot, input, loop, freeplay gate, progress, effects, smoke test.
(function () {
  const HYD = window.HYD = window.HYD || {};
  const $ = (id) => document.getElementById(String(id).replace(/^#/, ""));
  const params = new URLSearchParams(location.search);

  const Game = {
    mode: "menu",            // menu | playing
    paused: false,
    smoke: params.has("smoke"),
    settings: { sens: 1, fov: 75, music: true, sfx: true },
    stats: { shots: 0, hits: 0 },
    progress: null,
    avatar: null,
    signedUp: false,
    freeMode: true,
    freeTime: 60,
    gateShown: false,
    god: false,
    _lastResultOk: false,

    init() {
      const canvas = $("game-canvas");
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      this.renderer.setSize(innerWidth, innerHeight);
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.08;
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 600);
      HYD.camPos = new THREE.Vector3(0, 1.6, 20);

      HYD.World.init(this.scene, this.renderer);
      HYD.Player.init(this.camera, this.scene);
      HYD.Missions.init();
      HYD.UI.init();
      HYD.Monetize.init();

      // load saved settings/progress
      if (HYD.Auth.isSignedIn()) {
        this.loadProgressIntoGame(HYD.Auth.currentEmail());
      } else {
        this.progress = HYD.Auth.defaultProgress();
        this.avatar = { name: "Charminar_Champ", outfit: "pathani", color: "#1d6f42", skin: "#e0ac69", head: "turban", accessory: "none", weapon: "classic" };
      }
      HYD.Audio.setEnabled(this.settings.music, this.settings.sfx);
      HYD.Player.applySkin();

      this.bindInput();
      addEventListener("resize", () => {
        this.camera.aspect = innerWidth / innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(innerWidth, innerHeight);
      });

      // loading -> menu
      if (this.smoke) {
        $("#loading").classList.add("hidden");
        setTimeout(() => this.runSmoke(), 400);
      } else {
        let p = 0;
        const iv = setInterval(() => {
          p = Math.min(100, p + 12 + Math.random() * 18);
          $("#load-fill").style.width = p + "%";
          $("#load-text").textContent = ["Summoning Charminar…", "Steaming biryani…", "Honking autos…", "Brewing Irani chai…"][Math.floor(p / 25)];
          if (p >= 100) {
            clearInterval(iv);
            setTimeout(() => {
              $("#loading").classList.add("hidden");
              HYD.UI.show("menu");
              HYD.UI.updateAccountLine();
            }, 250);
          }
        }, 90);
      }

      this.clock = new THREE.Clock();
      this.loop();
    },

    // ---------------- input ----------------
    bindInput() {
      const canvas = $("game-canvas");
      HYD.Input = { keys: {}, dx: 0, dy: 0, mouseDown: false, firePressed: false };
      addEventListener("keydown", (e) => {
        HYD.Audio.ensure();
        HYD.Input.keys[e.code] = true;
        if (e.code === "Space" || e.code === "Tab") e.preventDefault();
        if (this.mode === "playing" && !this.paused) {
          if (e.code === "KeyR") HYD.Player.startReload();
          if (e.code === "Digit1" || e.code === "Numpad1") HYD.Player.switchWeapon("pistol");
          if (e.code === "Digit2" || e.code === "Numpad2") HYD.Player.switchWeapon("ak");
          if (e.code === "Escape") this.pause();
          if (e.code === "KeyP") { this.god = !this.god; HYD.UI.toast(this.god ? "God mode ON" : "God mode OFF", "warn"); }
        }
      });
      addEventListener("keyup", (e) => { HYD.Input.keys[e.code] = false; });
      addEventListener("mousemove", (e) => {
        if (document.pointerLockElement === canvas) {
          HYD.Input.dx += e.movementX;
          HYD.Input.dy += e.movementY;
        }
      });
      addEventListener("mousedown", (e) => {
        HYD.Audio.ensure();
        if (document.pointerLockElement === canvas && this.mode === "playing" && !this.paused) {
          if (e.button === 0) {
            HYD.Input.firePressed = true;
            HYD.Input.mouseDown = true;
          }
        }
      });
      addEventListener("mouseup", (e) => { if (e.button === 0) HYD.Input.mouseDown = false; });
      addEventListener("wheel", (e) => {
        if (this.mode === "playing" && !this.paused) {
          const next = HYD.Player.current === "pistol" ? "ak" : "pistol";
          HYD.Player.switchWeapon(next);
        }
      }, { passive: true });
      addEventListener("contextmenu", (e) => e.preventDefault());
      document.addEventListener("pointerlockchange", () => {
        if (document.pointerLockElement !== canvas && this.mode === "playing" && !this.paused && !this.smoke) {
          if (!this.gateShown) this.pause();
        }
      });
    },

    pause() {
      if (this.mode !== "playing" || this.paused) return;
      this.paused = true;
      if (document.pointerLockElement) document.exitPointerLock();
      HYD.UI.show("pause");
      HYD.Audio.ui();
    },

    resume() {
      this.paused = false;
      HYD.UI.show("");
      if (!this.smoke) $("game-canvas").requestPointerLock();
      HYD.Audio.ui();
    },

    inGame() {
      return this.mode === "playing";
    },

    // ---------------- flow ----------------
    startFreePlay() {
      HYD.Audio.ensure();
      HYD.Audio.switchTrack("game");
      this.mode = "playing";
      this.paused = false;
      this.gateShown = false;
      this.signedUp = HYD.Auth.isSignedIn();
      this.freeMode = !this.signedUp;
      this.freeTime = 60;
      if (!this.signedUp) {
        this.progress = HYD.Auth.defaultProgress();
      }
      this.applyProgressToPlayer();
      HYD.Missions.clearAllEnemies();
      HYD.Missions.markers.forEach(m => HYD.World.setMarkerVisible(m, false));
      HYD.Missions.markers = [];

      const done = this.progress.missionsCompleted.length;
      if (done >= HYD.Missions.list.length) {
        HYD.UI.banner("HYDERABAD IS OPEN", "All missions complete. Free roam — Esc for Rowdy Rampage.");
        HYD.Missions.current = null;
        HYD.UI.setObjective("Free roam — explore the city", "");
      } else {
        HYD.Missions.startMission(this.progress.currentMission || 0);
      }
      HYD.UI.showHUD(true);
      HYD.UI.show("");
      HYD.UI.updateAccountLine();
      if (!this.smoke) $("game-canvas").requestPointerLock();
      HYD.Audio.ui();
      HYD.UI.toast(this.signedUp ? "Welcome back, saar!" : "Free session: 60 seconds. Sign up to save your progress.", this.signedUp ? "good" : "warn");
    },

    showSignupGate() {
      this.gateShown = true;
      this.paused = true;
      if (document.pointerLockElement) document.exitPointerLock();
      HYD.UI.show("signup");
      HYD.UI.toast("Free session over — sign up to keep your avatar & missions!", "warn");
    },

    continueGuest() {
      this.paused = false;
      this.freeMode = false;
      HYD.UI.show("");
      if (!this.smoke) $("game-canvas").requestPointerLock();
      HYD.UI.toast("Guest mode — progress won't be saved. Sign up anytime from the menu.", "warn");
    },

    async doSignup(name, email, pass) {
      const r = await HYD.Auth.signup(email, pass, name);
      if (!r.ok) { HYD.UI.toast(r.error, "bad"); HYD.Audio.error(); return; }
      this.afterAuth();
    },

    async doLogin(email, pass) {
      const r = await HYD.Auth.login(email, pass);
      if (!r.ok) { HYD.UI.toast(r.error, "bad"); HYD.Audio.error(); return; }
      this.afterAuth();
    },

    async doGoogle() {
      let email = null;
      if (!this.smoke) {
        email = window.prompt("Google sign-in (demo build)\n\nEnter the Gmail address to link, or press OK for a demo account.\n\nProduction: replace with Google Identity Services — see README.", "hyderabadi.gamer@gmail.com");
      }
      if (email === null && !this.smoke) return;
      const r = await HYD.Auth.googleSignIn(email || "hyderabadi.gamer@gmail.com");
      if (r.ok) this.afterAuth();
    },

    afterAuth() {
      this.signedUp = true;
      this.freeMode = false;
      this.gateShown = true;
      this.paused = false;
      const email = HYD.Auth.currentEmail();
      const stored = HYD.Auth.loadProgress(email);
      const hasStored = stored && ((stored.missionsCompleted || []).length > 0 || (stored.money || 0) > 0);
      if (hasStored) {
        // returning player — restore their world
        this.loadProgressIntoGame(email);
      } else {
        // brand-new account — migrate the guest session into it
        const pr = this.progress || HYD.Auth.defaultProgress();
        pr.email = email;
        pr.avatar = this.avatar;
        this.progress = pr;
      }
      this.saveProgress();
      HYD.UI.updateAccountLine();
      HYD.UI.show("");
      if (!this.smoke) $("game-canvas").requestPointerLock();
      HYD.UI.toast("Signed in — progress & avatar now auto-save. Customise your avatar any time via Esc → Customise.", "good");
      HYD.Audio.ui();
    },

    signOut() {
      HYD.Auth.logout();
      this.quitToMenu();
      HYD.UI.toast("Signed out.", "warn");
    },

    quitToMenu() {
      this.mode = "menu";
      this.paused = false;
      if (document.pointerLockElement) document.exitPointerLock();
      HYD.Missions.clearAllEnemies();
      HYD.Audio.switchTrack("menu");
      HYD.UI.show("menu");
      HYD.UI.showHUD(false);
      HYD.UI.updateAccountLine();
    },

    continueAfterResult() {
      const ok = this._lastResultOk;
      HYD.Missions.clearAllEnemies();
      if (ok) {
        const next = (HYD.Missions.index + 1);
        if (HYD.Missions.current && next < HYD.Missions.list.length) {
          HYD.Missions.startMission(next);
          this.paused = false;
          HYD.UI.show("");
          if (!this.smoke) $("game-canvas").requestPointerLock();
        } else {
          HYD.Missions.current = null;
          HYD.UI.banner("HYDERABAD IS OPEN", "All missions complete. Free roam — Esc for Rowdy Rampage.");
          HYD.UI.setObjective("Free roam — explore the city", "");
          this.paused = false;
          HYD.UI.show("");
          if (!this.smoke) $("game-canvas").requestPointerLock();
        }
      } else {
        HYD.Missions.startMission(HYD.Missions.index);
        this.paused = false;
        HYD.UI.show("");
        if (!this.smoke) $("game-canvas").requestPointerLock();
      }
    },

    // ---------------- progress / avatar ----------------
    applyProgressToPlayer() {
      const pr = this.progress || HYD.Auth.defaultProgress();
      const P = HYD.Player;
      P.money = pr.money;
      P.coins = pr.coins;
      P.kills = pr.kills;
      this.stats = pr.stats || { shots: 0, hits: 0 };
      this.settings = Object.assign({ sens: 1, fov: 75, music: true, sfx: true }, pr.settings || {});
      if (pr.avatar) this.avatar = pr.avatar;
      P.skin = (this.avatar && this.avatar.weapon) || "classic";
      if (pr.elite) P.coins = P.coins; // elite flag kept in progress
      HYD.Audio.setEnabled(this.settings.music, this.settings.sfx);
    },

    loadProgressIntoGame(email) {
      const pr = HYD.Auth.loadProgress(email);
      this.progress = pr ? Object.assign(HYD.Auth.defaultProgress(), pr) : HYD.Auth.defaultProgress();
      this.progress.email = email;
      if (!this.progress.avatar) {
        this.progress.avatar = { name: "Charminar_Champ", outfit: "pathani", color: "#1d6f42", skin: "#e0ac69", head: "turban", accessory: "none", weapon: "classic" };
      }
      this.avatar = this.progress.avatar;
      this.applyProgressToPlayer();
      // unlock owned cosmetics
      this.progress.owned = this.progress.owned || [];
      // apply AK unlock if mission done
      if ((this.progress.missionsCompleted || []).includes("auto")) HYD.Player.weapons.ak.unlocked = true;
    },

    saveProgress() {
      if (!this.signedUp || !HYD.Auth.isSignedIn()) return false;
      const email = HYD.Auth.currentEmail();
      const pr = this.progress || HYD.Auth.defaultProgress();
      const P = HYD.Player;
      pr.money = Math.floor(P.money);
      pr.coins = P.coins;
      pr.kills = P.kills;
      pr.stats = this.stats;
      pr.settings = this.settings;
      pr.avatar = this.avatar;
      pr.name = (this.avatar && this.avatar.name) || pr.name;
      pr.currentMission = HYD.Missions.index >= 0 ? HYD.Missions.index : pr.currentMission;
      pr.owned = pr.owned || [];
      pr.elite = !!pr.elite;
      pr.bestRampage = pr.bestRampage || 0;
      return HYD.Auth.saveProgress(email, pr);
    },

    grantElite() {
      if (!this.progress) return;
      this.progress.elite = true;
      this.saveProgress();
      HYD.UI.toast("Elite Pass activated — all premium cosmetics unlocked, ad-free, +25% mission cash!", "good");
      HYD.UI.refreshShop();
    },

    saveAvatar() {
      const av = {
        name: ($("cz-name").value || "Charminar_Champ").slice(0, 20),
        outfit: $("cz-outfit").value,
        color: $("cz-color").value,
        skin: $("cz-skin").value,
        head: $("cz-head").value,
        accessory: $("cz-accessory").value,
        weapon: $("cz-weapon").value
      };
      const pr = this.progress;
      pr.owned = pr.owned || [];
      const costs = { police: 200, gold: 500, weapon_gold: 300, weapon_biryani: 150 };
      const outfitCost = av.outfit === "police" ? costs.police : av.outfit === "gold" ? costs.gold : 0;
      const weaponCost = av.weapon === "gold" ? costs.weapon_gold : av.weapon === "biryani" ? costs.weapon_biryani : 0;
      let total = 0;
      if (!pr.elite) {
        if (outfitCost && !pr.owned.includes(av.outfit)) total += outfitCost;
        if (weaponCost && !pr.owned.includes("weapon_" + av.weapon)) total += weaponCost;
      }
      if (total > 0) {
        if (HYD.Player.coins < total) {
          HYD.UI.toast("Not enough Chai-Coins (" + total + " needed). Earn them in missions or buy in the Shop.", "bad");
          HYD.Audio.error();
          return;
        }
        HYD.Player.coins -= total;
        if (outfitCost) pr.owned.push(av.outfit);
        if (weaponCost) pr.owned.push("weapon_" + av.weapon);
        pr.owned = [...new Set(pr.owned)];
      }
      this.avatar = av;
      pr.avatar = av;
      pr.name = av.name;
      HYD.Player.skin = av.weapon;
      HYD.Player.buildWeaponModel();
      this.saveProgress();
      HYD.UI.toast("Avatar saved — " + av.name + " is ready to rule the streets!", "good");
      HYD.Audio.ui();
      HYD.UI.back();
      HYD.UI.openCustomizer();
    },

    // ---------------- loop ----------------
    loop() {
      requestAnimationFrame(() => this.loop());
      const dt = Math.min(0.05, this.clock.getDelta());
      const t = this.clock.elapsedTime;
      if (this.mode === "playing" && !this.paused) {
        HYD.World.updateAutos(dt);
        HYD.World.updateNPCs(dt);
        HYD.World.updateLights(dt, t);
        HYD.World.updateDust(dt);
        const collected = HYD.World.updatePickups(dt);
        for (const kind of collected) HYD.Player.give(kind);
        HYD.Player.update(dt, HYD.Input);
        HYD.Input.dx = 0; HYD.Input.dy = 0;
        if (HYD.Input.firePressed) { HYD.Player.tryFire(); HYD.Input.firePressed = false; }
        if (HYD.Input.mouseDown && HYD.Player.weapons[HYD.Player.current].auto) HYD.Player.tryFire();
        if (HYD.Missions.current && HYD.Missions.current.id === "rampage") {
          HYD.Missions.rampageUpdate(dt);
        }
        HYD.Missions.update(dt, t);
        HYD.World.updateMarkers(dt, t);
        if (this.freeMode && !this.signedUp) {
          this.freeTime -= dt;
          if (this.freeTime <= 0 && !this.gateShown) this.showSignupGate();
        }
      }
      HYD.Effects.update(dt);
      HYD.UI.updateHUD(dt);
      this.renderer.render(this.scene, this.camera);
    },

    toggleMusic() {
      this.settings.music = !this.settings.music;
      HYD.Audio.setEnabled(this.settings.music, this.settings.sfx);
      this.saveProgress();
      HYD.UI.updateAudioLabels();
      HYD.UI.toast(this.settings.music ? "Music on" : "Music muted", this.settings.music ? "good" : "warn");
    },

    toggleSfx() {
      this.settings.sfx = !this.settings.sfx;
      HYD.Audio.setEnabled(this.settings.music, this.settings.sfx);
      this.saveProgress();
      HYD.UI.updateAudioLabels();
      HYD.UI.toast(this.settings.sfx ? "Sound effects on" : "Sound effects muted", this.settings.sfx ? "good" : "warn");
    },

    // ---------------- smoke test ----------------
    async runSmoke() {
      const log = (s) => { $("#debug-out").textContent += s + "\n"; };
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const checks = [];
      const check = (name, ok) => { checks.push({ name, ok }); log((ok ? "PASS " : "FAIL ") + name); };
      try {
        log("=== SMOKE TEST ===");
        HYD.Auth.logout();
        localStorage.removeItem("hydfps.progress.v1.smoke@test.dev");
        try {
          const accs = JSON.parse(localStorage.getItem("hydfps.accounts.v1") || "{}");
          delete accs["smoke@test.dev"];
          localStorage.setItem("hydfps.accounts.v1", JSON.stringify(accs));
        } catch (e) {}
        check("three.js loaded", typeof THREE !== "undefined" && !!HYD.World.scene);
        this.startFreePlay();
        await sleep(150);
        check("audio context created on start", !!HYD.Audio.ctx);
        check("soundtrack scheduler running", !!HYD.Audio.scheduler && HYD.Audio.track === "game");
        check("scene has environment lighting", !!this.scene.environment);
        check("tone mapping enabled", this.renderer.toneMapping !== THREE.NoToneMapping);
        check("freeplay started, tutorial active", HYD.Missions.current && HYD.Missions.current.id === "tutorial");
        const M = HYD.Missions;
        if (M.current && M.current.id === "tutorial") {
          M.state.phase = "shoot";
          for (const e of [...M.enemies]) M.damageEnemy(e, 99, e.position);
          await sleep(50);
          check("tutorial dummies cleared", M.state.dummies === 0 && M.finished);
        }
        const en = M.spawnEnemy("goon", 8, 8);
        const killsBefore = HYD.Player.kills;
        M.damageEnemy(en, 999, en.position);
        check("enemy spawn + kill", HYD.Player.kills === killsBefore + 1);
        const magBefore = HYD.Player.weapons.pistol.mag;
        HYD.Player.fire();
        check("weapon fire consumes ammo", HYD.Player.weapons.pistol.mag === magBefore - 1);
        check("stats tracked", HYD.Game.stats.shots >= 1);
        this.freeTime = 0.001;
        await sleep(80);
        check("signup gate shown at 60s", !HYD.UI.els.signup.classList.contains("hidden") && this.gateShown);
        await this.doSignup("Smoke Tester", "smoke@test.dev", "secret123");
        check("signed in", HYD.Auth.isSignedIn());
        check("progress persisted", !!localStorage.getItem("hydfps.progress.v1.smoke@test.dev"));
        // avatar save
        $("#cz-name").value = "SmokeSaar";
        $("#cz-outfit").value = "pathani";
        $("#cz-weapon").value = "classic";
        this.saveAvatar();
        check("avatar saved", this.avatar && this.avatar.name === "SmokeSaar");
        // monetize demo
        HYD.UI.prompt = async () => true;
        const beforeCoins = HYD.Player.coins;
        await HYD.Monetize.buy("coins500");
        await sleep(900);
        check("demo purchase grants coins", HYD.Player.coins === beforeCoins + 500);
        // reload persistence check via fresh load
        this.loadProgressIntoGame("smoke@test.dev");
        check("progress reloads (money/kills)", this.progress.kills >= 1 && this.progress.avatar.name === "SmokeSaar");
        const allPass = checks.every(c => c.ok);
        window.__SMOKE__ = allPass ? "PASS" : "FAIL";
        log("SMOKE RESULT: " + window.__SMOKE__);
      } catch (err) {
        window.__SMOKE__ = "FAIL";
        log("SMOKE EXCEPTION: " + err.message + "\n" + (err.stack || "").split("\n").slice(0, 4).join("\n"));
      }
    }
  };

  HYD.Game = Game;

  // ---------------- effects ----------------
  HYD.Effects = {
    parts: [],
    tracers: [],
    flashes: [],

    sparks(pos, color, n = 6, spread = 1.4) {
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.08, 0.08),
          new THREE.MeshBasicMaterial({ color })
        );
        m.position.copy(pos);
        HYD.Game.scene.add(m);
        this.parts.push({
          mesh: m,
          vel: new THREE.Vector3((Math.random() - 0.5) * spread, Math.random() * spread * 0.8, (Math.random() - 0.5) * spread),
          life: 0.35 + Math.random() * 0.4,
          max: 0.75
        });
      }
    },

    blood(pos) {
      this.sparks(pos, 0xc0392b, 7, 1.2);
    },

    tracer(from, to, color) {
      const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
      HYD.Game.scene.add(line);
      this.tracers.push({ line, life: 0.09 });
    },

    explosion(pos) {
      this.sparks(pos, 0xffaa33, 18, 4);
      this.sparks(pos, 0x666666, 10, 3);
      const flash = new THREE.PointLight(0xffa040, 26, 26);
      flash.position.copy(pos);
      HYD.Game.scene.add(flash);
      this.flashes.push({ light: flash, life: 0.25 });
    },

    update(dt) {
      for (let i = this.parts.length - 1; i >= 0; i--) {
        const p = this.parts[i];
        p.life -= dt;
        p.vel.y -= 9 * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        const s = Math.max(0.05, p.life / p.max);
        p.mesh.scale.setScalar(s);
        if (p.life <= 0) {
          HYD.Game.scene.remove(p.mesh);
          p.mesh.geometry.dispose();
          p.mesh.material.dispose();
          this.parts.splice(i, 1);
        }
      }
      for (let i = this.tracers.length - 1; i >= 0; i--) {
        const tr = this.tracers[i];
        tr.life -= dt;
        tr.line.material.opacity = Math.max(0, tr.life / 0.09);
        if (tr.life <= 0) {
          HYD.Game.scene.remove(tr.line);
          tr.line.geometry.dispose();
          tr.line.material.dispose();
          this.tracers.splice(i, 1);
        }
      }
      for (let i = this.flashes.length - 1; i >= 0; i--) {
        const f = this.flashes[i];
        f.life -= dt;
        f.light.intensity = Math.max(0, f.life * 100);
        if (f.life <= 0) {
          HYD.Game.scene.remove(f.light);
          this.flashes.splice(i, 1);
        }
      }
    }
  };

  // error trap (also feeds the headless smoke test)
  window.addEventListener("error", (e) => {
    const d = $("#debug-out");
    if (d) d.textContent += "ERR: " + e.message + "\n";
  });
  window.addEventListener("unhandledrejection", (e) => {
    const d = $("#debug-out");
    if (d) d.textContent += "ERR(promise): " + (e.reason && e.reason.message ? e.reason.message : e.reason) + "\n";
  });

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", () => Game.init());
  } else {
    Game.init();
  }
})();
