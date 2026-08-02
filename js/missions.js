// HYD.Missions — mission chain, enemies, cops, rampage.
(function () {
  const HYD = window.HYD = window.HYD || {};

  const M = {
    list: [
      { id: "tutorial", title: "Welcome to Hyderabad, Saar!", desc: "Reach Charminar Maidan and knock down the training dummies. Rowdies are watching…", reward: 500, timeLimit: 0 },
      { id: "biryani", title: "Biryani Dangal", desc: "Pick up three Hyderabadi dum biryanis from Bawarchi and deliver them to hungry customers before they cool.", reward: 1200, timeLimit: 240 },
      { id: "auto", title: "Auto Recovery", desc: "A rowdy just stole a brand-new auto from Charminar. Chase it down and recover the loot before he disappears into the old city.", reward: 1500, timeLimit: 150 },
      { id: "bazaar", title: "Laad Bazaar Guard", desc: "Don's men are coming to smash the bangle stalls. Hold the line at Laad Bazaar!", reward: 2000, timeLimit: 0 },
      { id: "boss", title: "Hussain Sagar Showdown", desc: "Final mission: take down Don Sikander at Hussain Sagar. His goons will come in waves — then the Don himself.", reward: 5000, timeLimit: 0 }
    ],
    index: -1,
    current: null,
    enemies: [],
    corpses: [],
    markers: [],
    state: null,
    finished: false,

    init() {
      // nothing to pre-build
    },

    // ---------------- mission control ----------------
    startMission(i) {
      if (this.enemies.length) this.clearAllEnemies();
      this.markers.forEach(m => HYD.World.setMarkerVisible(m, false));
      this.markers = [];
      this.corpses = [];
      this.index = i;
      this.current = this.list[i];
      this.state = {};
      this.finished = false;
      const P = HYD.Player;
      const def = this.list[i];
      if (def.id === "tutorial") this.missionTutorialStart();
      else if (def.id === "biryani") this.missionBiryaniStart();
      else if (def.id === "auto") this.missionAutoStart();
      else if (def.id === "bazaar") this.missionBazaarStart();
      else if (def.id === "boss") this.missionBossStart();
      HYD.UI.banner(def.title, def.desc);
      HYD.Audio.banner();
      if (def.timeLimit) {
        this.state.timeLeft = def.timeLimit;
        HYD.UI.setObjective(def.desc, "");
      }
      HYD.Game.saveProgress();
    },

    update(dt, t) {
      if (!this.current || this.finished) return;
      const def = this.current;
      if (this.state.timeLeft !== undefined) {
        this.state.timeLeft -= dt;
        if (this.state.timeLeft <= 0) {
          this.failMission("Time is up, miya! The biryani got cold / the thief escaped.");
          return;
        }
      }
      if (def.id === "tutorial") this.missionTutorialUpdate(dt, t);
      else if (def.id === "biryani") this.missionBiryaniUpdate(dt);
      else if (def.id === "auto") this.missionAutoUpdate(dt);
      else if (def.id === "bazaar") this.missionBazaarUpdate(dt);
      else if (def.id === "boss") this.missionBossUpdate(dt);
      this.updateEnemies(dt, t);
    },

    endMission(ok, title, body) {
      this.finished = true;
      const def = this.current;
      if (ok) {
        const P = HYD.Player;
        P.money += def.reward;
        HYD.Game.progress.missionsCompleted.push(def.id);
        HYD.Game.progress.missionsCompleted = [...new Set(HYD.Game.progress.missionsCompleted)];
        if (def.id === "auto") {
          P.weapons.ak.unlocked = true;
          HYD.UI.toast("AK-56 unlocked! Press 2 to wield it.", "good");
        }
        if (def.id === "boss") {
          HYD.Game.progress.owned.push("turban_nizam");
          HYD.Game.progress.owned = [...new Set(HYD.Game.progress.owned)];
          HYD.UI.toast("Nizam's Turban unlocked in the Atelier!", "good");
        }
        if (HYD.Game.progress.bestRampage === undefined) HYD.Game.progress.bestRampage = 0;
        if (this.index + 1 < this.list.length) HYD.Game.progress.currentMission = this.index + 1;
      }
      HYD.Game.saveProgress();
      HYD.UI.showResult(ok, title, body);
    },

    failMission(reason) {
      if (this.finished) return;
      this.endMission(false, "MISSION FAILED", reason);
    },

    // ---------------- Tutorial ----------------
    missionTutorialStart() {
      this.state.phase = "goto";
      this.state.dummies = 5;
      this.addMarker(0, 0, "tut_plaza", 0x2ecc71);
      HYD.Player.spawnPoint.set(0, 0, 24);
      const dummies = [[7, 7], [-7, 8], [8, -7], [-8, -7], [12, 0]];
      for (const [dx, dz] of dummies) this.spawnEnemy("dummy", dx, dz);
      HYD.UI.setObjective("Reach Charminar Maidan", "");
    },

    missionTutorialUpdate(dt, t) {
      if (this.state.phase === "goto") {
        const P = HYD.Player;
        if (Math.hypot(P.pos.x, P.pos.z) < 8) {
          this.state.phase = "shoot";
          HYD.World.setMarkerVisible("tut_plaza", false);
          HYD.UI.setObjective("Shoot the 5 training dummies", this.state.dummies + " left");
          HYD.UI.toast("Shoot the striped dummies, saar!", "warn");
        }
      } else if (this.state.phase === "shoot") {
        HYD.UI.setObjective("Shoot the 5 training dummies", this.state.dummies + " left");
        if (this.state.dummies <= 0) {
          HYD.UI.toast("Excellent aim! Tutorial complete.", "good");
          this.endMission(true, "TUTORIAL COMPLETE", "The maidan is yours. +₹500. Sign in any time to keep your progress.");
        }
      }
    },

    // ---------------- Biryani ----------------
    missionBiryaniStart() {
      this.state.phase = "goto";
      this.state.carrying = 0;
      this.state.delivered = 0;
      this.state.spots = [[-66, -40], [-66, -38], [-66, -42]];
      this.state.customers = [[-30, -30], [30, 30], [-66, 30]];
      this.addMarker(-66, -40, "bir_bawarchi", 0xf1c40f);
      HYD.Player.spawnPoint.set(-66, 0, -28);
      HYD.UI.setObjective("Go to Bawarchi Biryani (west)", "");
    },

    missionBiryaniUpdate(dt) {
      const P = HYD.Player;
      if (this.state.phase === "goto") {
        if (Math.hypot(P.pos.x + 66, P.pos.z + 40) < 10) {
          this.state.phase = "carry";
          HYD.World.setMarkerVisible("bir_bawarchi", false);
          this.state.crate = HYD.World.addPickup("biryani", -62, -37);
          HYD.UI.setObjective("Pick up a biryani crate (glowing green)", "");
          HYD.UI.toast("Grab a crate and run it to the customer marker!", "warn");
        }
      } else if (this.state.phase === "carry") {
        if (this.state.carrying > 0) {
          const [cx, cz] = this.state.customers[this.state.delivered];
          HYD.UI.setObjective("Deliver biryani to the customer", "Delivered " + this.state.delivered + "/3");
          if (Math.hypot(P.pos.x - cx, P.pos.z - cz) < 5) {
            this.state.carrying = 0;
            this.state.delivered++;
            P.money += 250;
            HYD.Audio.coin();
            HYD.UI.toast("Biryani delivered! +₹250", "good");
            HYD.World.setMarkerVisible("bir_cust" + this.state.delivered, false);
            if (this.state.delivered >= 3) {
              this.endMission(true, "BIRYANI DANGAL COMPLETE", "The customers are stuffed and happy. +₹1,200!");
            } else {
              this.state.crate = HYD.World.addPickup("biryani", -62, -37);
              this.state.phase = "carry";
              HYD.UI.setObjective("Pick up the next biryani crate", "Delivered " + this.state.delivered + "/3");
            }
          }
        }
      }
    },

    onBiryaniPickup() {
      if (!this.current || this.current.id !== "biryani" || this.state.phase !== "carry") {
        HYD.UI.toast("This is mission biryani — start 'Biryani Dangal' first!", "warn");
        return null;
      }
      if (this.state.carrying > 0) {
        HYD.UI.toast("Deliver the one you're carrying first!", "warn");
        return null;
      }
      this.state.carrying = 1;
      const [cx, cz] = this.state.customers[this.state.delivered];
      this.addMarker(cx, cz, "bir_cust" + (this.state.delivered + 1), 0x2ecc71);
      HYD.Audio.pickup();
      HYD.UI.toast("Biryani crate secured! Run, saar!", "good");
      return "picked";
    },

    // ---------------- Auto recovery ----------------
    missionAutoStart() {
      this.state.phase = "chase";
      this.state.damaged = 0;
      const a = HYD.World.makeAuto({
        x: -110, z: 0, axis: "z", dir: 1, lane: 0, speed: 10.5,
        color: 0x7d1f1f, hp: 130, stolen: true
      });
      this.state.stolenAuto = a;
      this.addMarker(-110, 0, "auto_thief", 0xe74c3c);
      HYD.Player.spawnPoint.set(0, 0, 14);
      HYD.UI.setObjective("Chase the stolen auto and destroy it!", "");
    },

    missionAutoUpdate(dt) {
      const a = this.state.stolenAuto;
      if (!a || a.userData.dead) return;
      const P = HYD.Player;
      // thief drives away from player-ish (keeps forward along axis)
      const far = Math.hypot(a.position.x - P.pos.x, a.position.z - P.pos.z);
      if (far > 175) {
        this.failMission("The auto thief vanished into the old city!");
        return;
      }
      if (this.state.phase === "chase") {
        HYD.UI.setObjective("Destroy the stolen auto (maroon)", Math.round(a.userData.hp) + " HP");
      } else if (this.state.phase === "loot") {
        HYD.UI.setObjective("Collect the recovered loot", "");
      }
    },

    damageAuto(a, dmg, point) {
      const P = HYD.Player;
      const ud = a.userData;
      ud.hp -= dmg;
      HYD.Effects.sparks(point, 0xff8844);
      if (ud.hp <= 0) {
        HYD.World.destroyAuto(a);
        if (ud.stolen) {
          this.state.phase = "loot";
          this.state.loot = HYD.World.addPickup("loot", a.position.x, a.position.z);
          this.addMarker(a.position.x, a.position.z, "auto_loot", 0xf1c40f);
          HYD.UI.toast("Auto wrecked! Grab the loot crate.", "good");
        } else {
          P.money += 150;
          HYD.UI.toast("Auto wrecked. Scrap +₹150", "good");
        }
      } else if (ud.hp < ud.maxHp * 0.4) {
        HYD.Effects.sparks(a.position.clone().setY(1.2), 0x888888, 3);
      }
    },

    onLootCollected() {
      if (this.current && this.current.id === "auto" && this.state.phase === "loot") {
        this.endMission(true, "AUTO RECOVERY COMPLETE", "Loot recovered and AK-56 unlocked! +₹1,500.");
      }
    },

    // ---------------- Laad Bazaar ----------------
    missionBazaarStart() {
      this.state.phase = "waves";
      this.state.wave = 0;
      this.state.waveT = 3;
      this.state.stallHp = 100;
      this.state.stall = { x: 40, z: -70 };
      this.addMarker(40, -70, "bz_stall", 0xe67e22);
      HYD.Player.spawnPoint.set(40, 0, -52);
      HYD.UI.setObjective("Defend the bangle stalls at Laad Bazaar", "Wave incoming…");
    },

    missionBazaarUpdate(dt) {
      const st = this.state;
      if (st.waveT > 0) {
        st.waveT -= dt;
        if (st.waveT <= 0) {
          st.wave++;
          const counts = [4, 6, 8];
          const n = counts[st.wave - 1];
          HYD.UI.toast("Wave " + st.wave + " incoming — " + n + " rowdies!", "warn");
          for (let i = 0; i < n; i++) {
            const ang = (i / n) * Math.PI * 2 + Math.random();
            const r = 20 + Math.random() * 8;
            const x = st.stall.x + Math.cos(ang) * r;
            const z = st.stall.z + Math.sin(ang) * r;
            this.spawnEnemy(i % 2 === 0 ? "goon" : "rowdy", x, z);
          }
        }
      } else {
        const alive = this.enemies.length;
        HYD.UI.setObjective("Defend the stalls", "Wave " + st.wave + "/3 · Stall HP " + Math.max(0, Math.round(st.stallHp)));
        if (alive === 0 && st.wave >= 3) {
          this.endMission(true, "LAAD BAZAAR DEFENDED", "The bangle stalls glow brighter than ever. +₹2,000!");
        } else if (alive === 0 && st.wave < 3) {
          st.waveT = 4;
        }
      }
      // enemies near stall damage it
      for (const e of this.enemies) {
        if (e.userData.etype === "goon" || e.userData.etype === "rowdy") {
          const d = Math.hypot(e.position.x - st.stall.x, e.position.z - st.stall.z);
          if (d < 2.2) {
            st.stallHp -= 1.5 * dt * 30;
            if (st.stallHp <= 0 && !this.finished) {
              this.failMission("The bangle stalls were smashed to bits!");
            }
          }
        }
      }
    },

    // ---------------- Boss ----------------
    missionBossStart() {
      this.state.phase = "waves";
      this.state.wave = 0;
      this.state.waveT = 3;
      this.addMarker(-96, -100, "boss_gate", 0xe74c3c);
      HYD.Player.spawnPoint.set(-96, 0, -78);
      HYD.UI.setObjective("Go to Hussain Sagar gate — Don Sikander awaits", "");
    },

    missionBossUpdate(dt) {
      const st = this.state;
      if (st.phase === "waves") {
        const P = HYD.Player;
        if (st.wave === 0 && Math.hypot(P.pos.x + 96, P.pos.z + 100) < 18) {
          HYD.World.setMarkerVisible("boss_gate", false);
          st.waveT = 2;
        }
        if (st.waveT > 0) {
          st.waveT -= dt;
          if (st.waveT <= 0) {
            st.wave++;
            if (st.wave === 1) {
              HYD.UI.toast("Wave 1: goons incoming!", "warn");
              for (let i = 0; i < 5; i++) this.spawnEnemy("goon", -80 + i * 6, -90);
            } else if (st.wave === 2) {
              HYD.UI.toast("Wave 2: rowdies with pistols!", "warn");
              for (let i = 0; i < 5; i++) this.spawnEnemy("rowdy", -120 + i * 5, -120);
            } else {
              st.phase = "boss";
              const don = this.spawnEnemy("don", -130, -106);
              this.addMarker(-130, -106, "boss_don", 0xff3333);
              HYD.UI.banner("DON SIKANDER", "The Don of the old city. End this.");
              HYD.Audio.banner();
            }
          }
        } else {
          HYD.UI.setObjective("Clear the waves at Hussain Sagar", "Wave " + st.wave + "/2");
          if (this.enemies.length === 0 && st.wave >= 2) st.waveT = 2;
        }
      } else if (st.phase === "boss") {
        HYD.UI.setObjective("Defeat Don Sikander", "Don HP " + Math.max(0, Math.round(this.state.donHp || 0)));
        const don = this.enemies.find(e => e.userData.etype === "don");
        if (!don && !this.finished) {
          HYD.World.setMarkerVisible("boss_don", false);
          this.endMission(true, "HYDERABAD IS YOURS", "Don Sikander has fallen. +₹5,000, Nizam's Turban unlocked. Free roam & Rowdy Rampage await!");
        }
      }
    },

    // ---------------- Rampage ----------------
    startRampage() {
      if (this.enemies.length) this.clearAllEnemies();
      this.markers.forEach(m => HYD.World.setMarkerVisible(m, false));
      this.markers = [];
      this.index = -1;
      this.current = { id: "rampage", title: "Rowdy Rampage", desc: "Endless waves. Survive.", reward: 0, timeLimit: 0 };
      this.state = { wave: 0, waveT: 5, score: 0, startedAt: performance.now() };
      this.finished = false;
      HYD.UI.banner("ROWDY RAMPAGE", "How many can you drop before the Don's crew overwhelms you?");
      HYD.Game.mode = "rampage";
    },

    rampageUpdate(dt) {
      const st = this.state;
      st.score = Math.max(st.score, HYD.Player.kills);
      if (st.waveT > 0) {
        st.waveT -= dt;
        if (st.waveT <= 0) {
          st.wave++;
          const n = 3 + st.wave * 2;
          HYD.UI.toast("Wave " + st.wave + " — " + n + " rowdies!", "warn");
          for (let i = 0; i < n; i++) {
            const ang = (i / n) * Math.PI * 2 + Math.random() * 2;
            const r = 18 + Math.random() * 10;
            this.spawnEnemy(Math.random() > 0.4 ? "rowdy" : "goon", Math.cos(ang) * r, Math.sin(ang) * r);
          }
        }
      } else if (this.enemies.length === 0) {
        st.waveT = 4;
      }
      HYD.UI.setObjective("Rowdy Rampage", "Wave " + st.wave + " · Kills " + HYD.Player.kills);
      if (HYD.Player.hp <= 20 && st.score > HYD.Game.progress.bestRampage) {
        HYD.Game.progress.bestRampage = st.score;
        HYD.Game.saveProgress();
      }
    },

    // ---------------- enemies ----------------
    spawnEnemy(etype, x, z) {
      const g = new THREE.Group();
      const def = {
        goon: { hp: 50, speed: 3.3, dmg: 10, range: 1.8, aggro: 26, rof: 1.3, money: 80, color: 0x6b2f2f, ranged: false },
        rowdy: { hp: 70, speed: 3.0, dmg: 7, range: 24, aggro: 32, rof: 1.15, money: 120, color: 0x2f4b6b, ranged: true },
        don: { hp: 180, speed: 2.7, dmg: 11, range: 32, aggro: 60, rof: 0.65, money: 800, color: 0x4a2c6d, ranged: true },
        cop: { hp: 90, speed: 3.7, dmg: 6, range: 26, aggro: 70, rof: 1.0, money: 0, color: 0x556b2f, ranged: true },
        dummy: { hp: 1, speed: 0, dmg: 0, range: 0, aggro: 0, rof: 0, money: 0, color: 0x8c1f28, ranged: false }
      }[etype];
      if (!def) return null;

      if (etype === "dummy") {
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(1.15, 1.4, 0.6),
          new THREE.MeshLambertMaterial({ color: 0xd9d9d9 })
        );
        body.position.y = 0.7;
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(1.17, 0.35, 0.62),
          new THREE.MeshLambertMaterial({ color: 0x8c1f28 })
        );
        stripe.position.y = 0.85;
        const target = new THREE.Mesh(
          new THREE.CircleGeometry(0.3, 16),
          new THREE.MeshBasicMaterial({ color: 0xc0392b })
        );
        target.position.set(0, 0.9, 0.32);
        const inner = new THREE.Mesh(
          new THREE.CircleGeometry(0.12, 12),
          new THREE.MeshBasicMaterial({ color: 0xfff })
        );
        inner.position.set(0, 0.9, 0.33);
        g.add(body, stripe, target, inner);
      } else {
        const skin = Math.random() > 0.5 ? 0xc68642 : 0x8d5524;
        const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.85, 0.32), new THREE.MeshLambertMaterial({ color: 0x2b2b2b }));
        legs.position.y = 0.42;
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.8, 0.36), new THREE.MeshLambertMaterial({ color: def.color }));
        torso.position.y = 1.28;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 10), new THREE.MeshLambertMaterial({ color: skin }));
        head.position.y = 1.92;
        const turban = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.27, 0.22, 8), new THREE.MeshLambertMaterial({ color: etype === "don" ? 0xd9a62e : 0x2b2b2b }));
        turban.position.y = 2.14;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.5), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
        arm.position.set(0.45, 1.55, 0.2);
        arm.rotation.x = 0.7;
        g.add(legs, torso, head, turban, arm);
        if (def.ranged) {
          const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.42), new THREE.MeshLambertMaterial({ color: 0x111 }));
          gun.position.set(0.5, 1.5, 0.35);
          gun.rotation.x = 0.4;
          g.add(gun);
        } else {
          const club = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.7, 6), new THREE.MeshLambertMaterial({ color: 0x6d3a1f }));
          club.position.set(0.5, 1.35, 0.4);
          club.rotation.x = 0.8;
          g.add(club);
        }
        // HP bar
        const bg = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.1), new THREE.MeshBasicMaterial({ color: 0x111, transparent: true, opacity: 0.8, depthTest: false }));
        bg.position.y = 2.5;
        const fg = new THREE.Mesh(new THREE.PlaneGeometry(0.69, 0.06), new THREE.MeshBasicMaterial({ color: 0xe74c3c, depthTest: false }));
        fg.position.y = 2.5;
        g.add(bg, fg);
      }

      g.position.set(x, 0, z);
      g.traverse(m => { if (m.isMesh) m.castShadow = true; });
      g.userData = {
        kind: "enemy", etype, hp: def.hp, maxHp: def.hp, speed: def.speed, dmg: def.dmg,
        range: def.range, aggro: def.aggro, rof: def.rof, money: def.money, ranged: def.ranged,
        cd: 0, strafeT: Math.random() * 3, strafeDir: 1, dead: false, wander: new THREE.Vector2(Math.random() * 2 - 1, Math.random() * 2 - 1)
      };
      HYD.World.scene.add(g);
      this.enemies.push(g);
      HYD.World.hittable.push(g);
      return g;
    },

    damageEnemy(e, dmg, point) {
      const ud = e.userData;
      if (ud.dead) return;
      if (ud.etype === "dummy") {
        ud.dead = true;
        this.removeEnemy(e, true);
        this.state.dummies = Math.max(0, this.state.dummies - 1);
        HYD.Audio.coin();
        HYD.UI.toast("Dummy down!", "good");
        return;
      }
      ud.hp -= dmg;
      ud.cd = Math.max(ud.cd, 0.15); // flinch
      if (ud.hp <= 0) {
        ud.dead = true;
        const P = HYD.Player;
        P.kills++;
        P.money += ud.money;
        HYD.Game.progress.kills = P.kills;
        HYD.UI.feed(ud.etype === "don" ? "DON SIKANDER HAS FALLEN" : ud.etype === "cop" ? "Cop down — wanted level dropped" : "Rowdy silenced", ud.etype === "don" ? "gold" : "good");
        HYD.Audio.kill();
        this.removeEnemy(e, true);
        if (ud.etype === "cop") {
          P.wanted = Math.max(0, P.wanted - 1);
        }
        if (ud.etype === "don") this.state.donHp = 0;
      } else if (ud.etype === "don") {
        this.state.donHp = ud.hp;
      }
    },

    removeEnemy(e, corpse) {
      this.scene = HYD.World.scene;
      const i = this.enemies.indexOf(e); if (i >= 0) this.enemies.splice(i, 1);
      const j = HYD.World.hittable.indexOf(e); if (j >= 0) HYD.World.hittable.splice(j, 1);
      if (corpse) {
        e.userData.dead = true;
        e.userData.corpseT = 0;
        this.corpses.push(e);
      } else {
        this.scene.remove(e);
      }
    },

    updateCorpses(dt) {
      for (let i = this.corpses.length - 1; i >= 0; i--) {
        const c = this.corpses[i];
        c.userData.corpseT += dt;
        c.rotation.x = Math.min(Math.PI / 2, c.rotation.x + dt * 2.4);
        c.position.y = Math.max(-1, c.position.y - dt * 1.5);
        c.scale.multiplyScalar(1 - dt * 0.7);
        if (c.userData.corpseT > 2.2) {
          this.scene.remove(c);
          this.corpses.splice(i, 1);
        }
      }
    },

    clearAllEnemies() {
      for (const e of this.enemies) {
        HYD.World.scene.remove(e);
        const j = HYD.World.hittable.indexOf(e); if (j >= 0) HYD.World.hittable.splice(j, 1);
      }
      this.enemies = [];
      for (const c of this.corpses) HYD.World.scene.remove(c);
      this.corpses = [];
    },

    updateEnemies(dt, t) {
      const P = HYD.Player;
      for (const e of this.enemies) {
        const ud = e.userData;
        ud.cd -= dt;
        ud.strafeT -= dt;
        if (ud.strafeT <= 0) { ud.strafeT = 1.5 + Math.random() * 2; ud.strafeDir = Math.random() > 0.5 ? 1 : -1; }
        if (!P || P.hp <= 0 || ud.etype === "dummy") continue;
        const dx = P.pos.x - e.position.x, dz = P.pos.z - e.position.z;
        const dist = Math.hypot(dx, dz);
        e.lookAt(P.pos.x, 1.4, P.pos.z);
        // aim HP bar at camera
        const fg = e.children.find(c => c.material && c.material.color && c.material.color.getHex() === 0xe74c3c);
        if (fg) fg.scale.x = Math.max(0.01, ud.hp / ud.maxHp);

        if (dist < ud.aggro || (ud.etype === "cop")) {
          const moveDir = new THREE.Vector2(dx, dz).normalize();
          const strafe = new THREE.Vector2(-dz, dx).normalize().multiplyScalar(ud.strafeDir * (ud.ranged ? 0.55 : 0));
          const desired = new THREE.Vector2().addVectors(moveDir.multiplyScalar(ud.ranged ? 1 : 1), strafe);
          const nx = e.position.x + desired.x * ud.speed * dt;
          const nz = e.position.z + desired.y * ud.speed * dt;
          if (!HYD.World.pointBlocked(nx, nz)) {
            e.position.x = nx; e.position.z = nz;
          } else {
            // slide along wall
            if (!HYD.World.pointBlocked(nx, e.position.z)) e.position.x = nx;
            if (!HYD.World.pointBlocked(e.position.x, nz)) e.position.z = nz;
          }
          // separation
          for (const o of this.enemies) {
            if (o === e) continue;
            const od = Math.hypot(o.position.x - e.position.x, o.position.z - e.position.z);
            if (od > 0.01 && od < 1.1) {
              const push = (1.1 - od) * 0.5;
              e.position.x += ((e.position.x - o.position.x) / od) * push * dt * 5;
              e.position.z += ((e.position.z - o.position.z) / od) * push * dt * 5;
            }
          }
          // attack
          if (ud.cd <= 0 && dist < ud.range) {
            const los = HYD.World.losClear(e.position.x, e.position.z, P.pos.x, P.pos.z);
            if (los) {
              ud.cd = ud.rof;
              if (ud.ranged) {
                HYD.Audio.enemyGun();
                const from = e.position.clone().setY(1.6);
                const to = P.pos.clone().setY(1.5);
                HYD.Effects.tracer(from, to, 0xff6644);
                if (Math.random() < 0.72) {
                  P.takeDamage(ud.dmg);
                  if (ud.etype === "cop" && P.wanted > 0) HYD.UI.feed("Cop shot you", "bad");
                }
              } else if (dist < 2.0) {
                P.takeDamage(ud.dmg);
                HYD.UI.feed("Goon clubbed you", "bad");
              }
            }
          }
        } else if (ud.etype === "dummy") {
          // stationary
        }
      }
      this.updateCorpses(dt);
    },

    hurtCivilian(n, dmg, point) {
      const ud = n.userData;
      if (ud.dead) return;
      ud.hp -= dmg;
      ud.panic = 3;
      if (ud.hp <= 0) {
        ud.dead = true;
        HYD.World.scene.remove(n);
        const i = HYD.World.npcs.indexOf(n); if (i >= 0) HYD.World.npcs.splice(i, 1);
        const j = HYD.World.hittable.indexOf(n); if (j >= 0) HYD.World.hittable.splice(j, 1);
        HYD.Player.money = Math.max(0, HYD.Player.money - 100);
        this.addWanted(1);
        HYD.UI.feed("Civilian down — wanted level up!", "bad");
        HYD.UI.toast("You shot a civilian! -₹100 and the cops are coming.", "bad");
      }
    },

    // ---------------- wanted / cops ----------------
    addWanted(n) {
      const P = HYD.Player;
      if (P.wanted >= 2) return;
      P.wanted = Math.min(2, P.wanted + n);
      this.ensureCops();
    },

    ensureCops() {
      const P = HYD.Player;
      const copCount = this.enemies.filter(e => e.userData.etype === "cop").length;
      const want = P.wanted;
      if (want <= 0 || copCount >= want) return;
      for (let i = copCount; i < want; i++) {
        let x = 0, z = 0, tries = 0;
        do {
          const ang = Math.random() * Math.PI * 2;
          const r = 14 + Math.random() * 8;
          x = P.pos.x + Math.cos(ang) * r;
          z = P.pos.z + Math.sin(ang) * r;
          tries++;
        } while (HYD.World.pointBlocked(x, z) && tries < 12);
        const cop = this.spawnEnemy("cop", x, z);
        if (cop) {
          HYD.Audio.whistle();
          HYD.UI.feed("Police are on the scene!", "warn");
        }
      }
    },

    clearCops() {
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        if (this.enemies[i].userData.etype === "cop") this.removeEnemy(this.enemies[i], false);
      }
    },

    nearestCop() {
      let best = null, bd = Infinity;
      for (const e of this.enemies) {
        if (e.userData.etype === "cop") {
          const d = Math.hypot(e.position.x - HYD.Player.pos.x, e.position.z - HYD.Player.pos.z);
          if (d < bd) { bd = d; best = e; }
        }
      }
      return best;
    },

    // ---------------- markers ----------------
    addMarker(x, z, id, color) {
      const m = HYD.World.addMarker(x, z, color, id);
      this.markers.push(id);
      return m;
    }
  };

  HYD.Missions = M;
})();
