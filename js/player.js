// HYD.Player — first-person controller, weapons & combat.
(function () {
  const HYD = window.HYD = window.HYD || {};

  const P = {
    pos: null, vel: null, yaw: 0, pitch: 0,
    hp: 100, armor: 0, money: 500, coins: 0,
    eye: 1.62, radius: 0.45,
    onGround: true, vy: 0,
    sprinting: false, crouch: 0,
    weapons: null, current: "pistol",
    reloading: false, reloadT: 0, fireCd: 0,
    shakeT: 0, shakeAmp: 0,
    wanted: 0, wantedDistT: 0,
    kills: 0,
    weaponGroup: null, muzzleLight: null,
    walkT: 0, lastGrounded: true,
    skin: "classic",

    init(camera, scene) {
      this.camera = camera;
      this.scene = scene;
      this.weapons = {
        pistol: {
          name: "Nizam 9mm", dmg: 34, rof: 0.28, mag: 12, magSize: 12, reserve: 96,
          spread: 0.012, auto: false, reloadT: 1.1, unlocked: true
        },
        ak: {
          name: "AK-56", dmg: 22, rof: 0.09, mag: 30, magSize: 30, reserve: 90,
          spread: 0.045, auto: true, reloadT: 1.8, unlocked: false
        }
      };
      this.spawnPoint = new THREE.Vector3(0, 0, 20);
      this.pos = this.spawnPoint.clone();
      this.vel = new THREE.Vector3();
      this.yaw = 0; this.pitch = 0;
      this.buildWeaponModel();
      camera.add(this.weaponGroup);
    },

    buildWeaponModel() {
      if (this.weaponGroup) {
        this.camera.remove(this.weaponGroup);
        this.weaponGroup.traverse(c => {
          if (c.geometry) c.geometry.dispose();
          if (c.material) c.material.dispose();
        });
      }
      const g = new THREE.Group();
      g.position.set(0.33, -0.27, -0.55);
      const steel = new THREE.MeshLambertMaterial({ color: this.skin === "gold" ? 0xd4a017 : this.skin === "biryani" ? 0x6d3a1f : 0x4b4b50 });
      const dark = new THREE.MeshLambertMaterial({ color: this.skin === "gold" ? 0xb8860b : 0x222222 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.42), steel);
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.34), dark);
      slide.position.y = 0.08; slide.position.z = -0.02;
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.09), dark);
      grip.position.set(0, -0.1, 0.1);
      grip.rotation.x = 0.35;
      g.add(body, slide, grip);
      this.weaponGroup = g;
      this.muzzle = new THREE.Vector3(0, 0.06, -0.3);
      if (!this.muzzleLight) this.muzzleLight = new THREE.PointLight(0xffc65c, 0, 9);
      this.weaponGroup.add(this.muzzleLight);
      this.applySkin();
    },

    applySkin() {
      const steel = this.skin === "gold" ? 0xd4a017 : this.skin === "biryani" ? 0x6d3a1f : 0x4b4b50;
      const dark = this.skin === "gold" ? 0xb8860b : 0x222222;
      if (!this.weaponGroup) return;
      this.weaponGroup.children.forEach(c => {
        if (c.isMesh && c.material && c.material.color) {
          const cname = c.geometry && c.geometry.type;
          if (cname === "BoxGeometry") {
            // box0 slide/grip are dark
          }
          c.material.color.set(c === this.weaponGroup.children[0] ? steel : dark);
        }
      });
      // muzzle light glow color
      if (this.muzzleLight) this.muzzleLight.color.set(this.skin === "gold" ? 0xffd86b : 0xffc65c);
    },

    // ---------------- movement ----------------
    update(dt, input) {
      const w = this.weapons[this.current];
      // look
      const sens = (HYD.Game && HYD.Game.settings ? HYD.Game.settings.sens : 1) * 0.0022;
      this.yaw -= input.dx * sens;
      this.pitch -= input.dy * sens;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));

      const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      let mx = 0, mz = 0;
      if (input.keys["KeyW"]) { mx += fwd.x; mz += fwd.z; }
      if (input.keys["KeyS"]) { mx -= fwd.x; mz -= fwd.z; }
      if (input.keys["KeyA"]) { mx -= right.x; mz -= right.z; }
      if (input.keys["KeyD"]) { mx += right.x; mz += right.z; }
      const len = Math.hypot(mx, mz);
      this.sprinting = !!input.keys["ShiftLeft"] && len > 0;
      const speed = this.sprinting ? 8.6 : 5.2;
      const accel = this.onGround ? 14 : 2.5;
      const tvx = len ? (mx / len) * speed : 0;
      const tvz = len ? (mz / len) * speed : 0;
      this.vel.x += (tvx - this.vel.x) * Math.min(1, accel * dt);
      this.vel.z += (tvz - this.vel.z) * Math.min(1, accel * dt);

      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      HYD.World.resolveCircle(this.pos, this.radius);

      // gravity & jump
      if (input.keys["Space"] && this.onGround) {
        this.vy = 7.6;
        this.onGround = false;
        HYD.Audio.jump();
      }
      this.vy -= 22 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= 0) {
        if (!this.onGround && this.vy < -5) HYD.Audio.land();
        this.pos.y = 0; this.vy = 0; this.onGround = true;
      }

      // camera
      this.camera.rotation.order = "YXZ";
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch;
      this.camera.position.copy(this.pos);
      this.camera.position.y += this.eye;
      HYD.camPos = this.camera.position.clone();

      // footsteps
      const moving = len > 0 && this.onGround;
      if (moving) {
        this.walkT += dt * (this.sprinting ? 13 : 8.5);
        if (this.walkT >= 1) { this.walkT = 0; HYD.Audio.foot(); }
      }

      // FOV
      const targetFov = HYD.Game.settings.fov + (this.sprinting ? 9 : 0);
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 8);
      this.camera.updateProjectionMatrix();

      // weapon bob & recoil
      const bobAmp = moving ? (this.sprinting ? 0.035 : 0.022) : 0;
      const bobX = Math.sin(this.walkT * 6.3) * bobAmp;
      const bobY = Math.abs(Math.cos(this.walkT * 6.3)) * bobAmp;
      this.weaponGroup.position.set(0.33 + bobX, -0.27 + bobY, -0.55 + this.recoilKick * 0.35);
      this.recoilKick += (0 - this.recoilKick) * Math.min(1, dt * 9);

      // timers
      this.fireCd -= dt;
      if (this.reloading) {
        this.reloadT -= dt;
        if (this.reloadT <= 0) {
          this.reloading = false;
          const need = w.magSize - w.mag;
          const take = Math.min(need, w.reserve);
          w.mag += take; w.reserve -= take;
          if (HYD.UI) HYD.UI.toast("Reloaded — " + w.name, "good");
        }
      }
      this.shakeT = Math.max(0, this.shakeT - dt);
      if (this.shakeT > 0) {
        const s = this.shakeAmp * (this.shakeT * 2);
        this.camera.position.x += (Math.random() - 0.5) * s;
        this.camera.position.y += (Math.random() - 0.5) * s * 0.6;
      }

      // wanted decay
      if (this.wanted > 0) {
        const cop = HYD.Missions.nearestCop();
        const d = cop ? Math.hypot(cop.position.x - this.pos.x, cop.position.z - this.pos.z) : 999;
        if (d > 110) {
          this.wantedDistT += dt;
          if (this.wantedDistT > 12) {
            this.wantedDistT = 0;
            this.wanted--;
            HYD.UI.toast("Wanted level dropped. ", "good");
            if (this.wanted <= 0) HYD.Missions.clearCops();
          }
        } else this.wantedDistT = 0;
      }
    },

    // ---------------- weapons ----------------
    canFire() {
      const w = this.weapons[this.current];
      return !this.reloading && this.fireCd <= 0 && w.mag > 0;
    },

    tryFire() {
      const w = this.weapons[this.current];
      if (this.reloading) return;
      if (this.fireCd > 0) return;
      if (w.mag <= 0) {
        HYD.Audio.empty();
        this.startReload();
        return;
      }
      this.fire();
    },

    fire() {
      const w = this.weapons[this.current];
      w.mag--;
      this.fireCd = w.rof;
      this.recoilKick = 1;
      this.shakeT = 0.09; this.shakeAmp = this.current === "ak" ? 0.05 : 0.03;
      this.pitch += this.current === "ak" ? 0.012 : 0.009;
      HYD.Audio.gun(this.current);
      if (HYD.Game.stats) HYD.Game.stats.shots++;

      // muzzle flash
      this.muzzleLight.intensity = this.current === "ak" ? 2.2 : 1.6;
      setTimeout(() => { if (this.muzzleLight) this.muzzleLight.intensity = 0; }, 45);

      // raycast
      const dir = new THREE.Vector3(0, 0, -1).applyEuler(this.camera.rotation);
      const spread = w.spread;
      dir.x += (Math.random() - 0.5) * spread;
      dir.y += (Math.random() - 0.5) * spread;
      dir.z += (Math.random() - 0.5) * spread;
      dir.normalize();
      const origin = this.camera.position.clone();
      const allTargets = HYD.World.solidMeshes.concat(HYD.World.hittable);
      HYD.World.raycaster.set(origin, dir);
      HYD.World.raycaster.far = 220;
      const hits = HYD.World.raycaster.intersectObjects(allTargets, true);
      let obj = null, point = null;
      if (hits.length) {
        point = hits[0].point;
        // climb to the owner carrying userData (enemy/npc/auto groups)
        let o = hits[0].object;
        while (o && !o.userData.kind) o = o.parent;
        obj = o;
      }
      const end = point ? point : origin.clone().addScaledVector(dir, 220);
      HYD.Effects.tracer(origin, end, this.current === "ak" ? 0xffaa44 : 0xffe08a);

      if (obj) {
        const ud = obj.userData || {};
        if (ud.kind === "enemy") {
          HYD.Missions.damageEnemy(obj, w.dmg, point);
          HYD.Effects.blood(point);
          HYD.Audio.hit();
          if (HYD.Game.stats) HYD.Game.stats.hits++;
          HYD.UI.hitMarker();
        } else if (ud.kind === "auto") {
          HYD.Missions.damageAuto(obj, w.dmg, point);
          HYD.Effects.sparks(point, 0xffcc44);
        } else if (ud.kind === "npc") {
          HYD.Missions.hurtCivilian(obj, w.dmg, point);
          HYD.Effects.blood(point);
          HYD.Audio.hit();
          HYD.UI.hitMarker();
        } else {
          HYD.Effects.sparks(point, 0xcccccc);
        }
      }
    },

    startReload() {
      const w = this.weapons[this.current];
      if (this.reloading || w.mag >= w.magSize || w.reserve <= 0) return;
      this.reloading = true;
      this.reloadT = w.reloadT;
      HYD.Audio.reload();
    },

    switchWeapon(name) {
      if (name === this.current) return;
      if (!this.weapons[name].unlocked) {
        HYD.UI.toast("AK-56 locked — finish 'Auto Recovery' to unlock it.", "warn");
        return;
      }
      this.current = name;
      HYD.Audio.ui();
    },

    // ---------------- damage ----------------
    takeDamage(d) {
      if (HYD.Game.god) return;
      if (this.armor > 0) {
        const absorbed = d * 0.55;
        this.armor = Math.max(0, this.armor - absorbed);
        d -= absorbed;
      }
      this.hp = Math.max(0, this.hp - d);
      HYD.UI.damageFlash(d / 20);
      HYD.Audio.hurt();
      if (this.hp <= 0) this.die();
    },

    die() {
      this.hp = 100; this.armor = 0;
      this.money = Math.max(0, this.money - 100);
      this.pos.copy(this.spawnPoint);
      this.pos.y = 0.5;
      this.vel.set(0, 0, 0);
      HYD.UI.toast("You blacked out in the bazaar. Lost ₹100. ", "bad");
      HYD.Effects.sparks(this.pos.clone().setY(1), 0xff3333, 14);
    },

    give(kind) {
      if (kind === "ammo") {
        this.weapons.pistol.reserve += 36;
        this.weapons.ak.reserve += 30;
        HYD.UI.toast("Ammo picked up (+9mm, +AK-56)", "good");
      } else if (kind === "med") {
        this.hp = Math.min(100, this.hp + 50);
        HYD.UI.toast("Medkit — +50 HP", "good");
      } else if (kind === "armor") {
        this.armor = Math.min(100, this.armor + 50);
        HYD.UI.toast("Body armour — +50", "good");
      } else if (kind === "biryani") {
        return HYD.Missions.onBiryaniPickup();
      } else if (kind === "loot") {
        this.money += 1000;
        HYD.UI.toast("Recovered the loot! +₹1,000", "good");
        return HYD.Missions.onLootCollected();
      }
      HYD.Audio.pickup();
      return null;
    }
  };

  HYD.Player = P;
})();
