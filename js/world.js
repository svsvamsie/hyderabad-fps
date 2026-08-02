// HYD.World — procedural Hyderabad cityscape (no external assets).
(function () {
  const HYD = window.HYD = window.HYD || {};

  const W = {
    scene: null,
    solids: [],          // AABB {minX,maxX,minZ,maxZ}
    solidMeshes: [],     // flat list for raycasting
    autos: [],
    npcs: [],
    pickups: [],
    markers: [],
    radarBlocks: [],     // {x,z,w,d} for minimap
    hittable: [],        // dynamic targets (enemy/npc/auto groups)
    bounds: 192,

    init(scene) {
      this.scene = scene;
      this.raycaster = new THREE.Raycaster();
      this.buildSky();
      this.buildGround();
      this.buildRoads();
      this.buildPlaza();
      this.buildCharminar();
      this.buildCity();
      this.buildHussainSagar();
      this.buildGolconda();
      this.buildLandmarks();
      this.buildProps();
      this.buildAutos();
      this.buildNPCs();
      this.initialPickups();
    },

    // ---------------- helpers ----------------
    box(o) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(o.w, o.h, o.d),
        new THREE.MeshLambertMaterial({ color: o.color })
      );
      mesh.position.set(o.x, o.y + (o.h / 2), o.z);
      if (o.rotY) mesh.rotation.y = o.rotY;
      mesh.castShadow = o.cast !== false;
      mesh.receiveShadow = o.receive !== false;
      this.scene.add(mesh);
      if (o.solid) this.addSolid(o.x, o.z, o.w, o.d, o.solidPad || 0);
      if (o.hittable) this.solidMeshes.push(mesh);
      if (o.radar) this.radarBlocks.push({ x: o.x, z: o.z, w: o.w, d: o.d });
      return mesh;
    },

    cyl(o) {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(o.r, o.r2 !== undefined ? o.r2 : o.r, o.h, o.seg || 10),
        new THREE.MeshLambertMaterial({ color: o.color })
      );
      mesh.position.set(o.x, o.y + (o.h / 2), o.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      if (o.solid) this.addSolid(o.x, o.z, o.r * 2.2, o.r * 2.2);
      return mesh;
    },

    sphere(o) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(o.r, o.seg || 12, o.seg || 12),
        new THREE.MeshLambertMaterial({ color: o.color })
      );
      mesh.position.set(o.x, o.y + o.r * (o.scaleY || 1), o.z);
      mesh.scale.y = o.scaleY || 1;
      mesh.castShadow = true;
      this.scene.add(mesh);
      return mesh;
    },

    addSolid(x, z, w, d, pad = 0) {
      this.solids.push({
        minX: x - w / 2 - pad, maxX: x + w / 2 + pad,
        minZ: z - d / 2 - pad, maxZ: z + d / 2 + pad
      });
    },

    // Circle vs AABB collision: push position out.
    resolveCircle(pos, radius) {
      let p = pos;
      for (const s of this.solids) {
        const cx = Math.max(s.minX, Math.min(p.x, s.maxX));
        const cz = Math.max(s.minZ, Math.min(p.z, s.maxZ));
        let dx = p.x - cx, dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < radius * radius) {
          if (d2 > 0.0001) {
            const d = Math.sqrt(d2);
            p.x = cx + (dx / d) * radius;
            p.z = cz + (dz / d) * radius;
          } else {
            // center inside box: push along smallest penetration
            const pl = p.x - s.minX, pr = s.maxX - p.x, pt = p.z - s.minZ, pb = s.maxZ - p.z;
            const m = Math.min(pl, pr, pt, pb);
            if (m === pl) p.x = s.minX - radius;
            else if (m === pr) p.x = s.maxX + radius;
            else if (m === pt) p.z = s.minZ - radius;
            else p.z = s.maxZ + radius;
          }
        }
      }
      p.x = Math.max(-this.bounds, Math.min(this.bounds, p.x));
      p.z = Math.max(-this.bounds, Math.min(this.bounds, p.z));
      return p;
    },

    pointBlocked(x, z) {
      for (const s of this.solids) {
        if (x > s.minX && x < s.maxX && z > s.minZ && z < s.maxZ) return true;
      }
      return false;
    },

    // Line-of-sight (ground-level) against building AABBs.
    losClear(ax, az, bx, bz) {
      const steps = 24;
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        if (this.pointBlocked(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
      }
      return true;
    },

    textTexture(text, opts = {}) {
      const w = opts.w || 512, h = opts.h || 128;
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      ctx.fillStyle = opts.bg || "#6b1f1f";
      ctx.fillRect(0, 0, w, h);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = opts.fg || "#ffd97a";
      ctx.font = `800 ${opts.size || 54}px Mukta, sans-serif`;
      ctx.fillText(text, w / 2, opts.sub ? h * 0.38 : h / 2);
      if (opts.sub) {
        ctx.fillStyle = "#fff";
        ctx.font = `600 ${opts.subSize || Math.round((opts.size || 54) * 0.42)}px Mukta, sans-serif`;
        ctx.fillText(opts.sub, w / 2, h * 0.76);
      }
      if (opts.stroke) {
        ctx.strokeStyle = opts.stroke; ctx.lineWidth = 8;
        ctx.strokeRect(8, 8, w - 16, h - 16);
      }
      const tex = new THREE.CanvasTexture(c);
      tex.anisotropy = 4;
      return tex;
    },

    sign(text, x, y, z, opts = {}) {
      const w = opts.w || 11, h = opts.h || 2.6;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshLambertMaterial({
          map: this.textTexture(text, { sub: opts.sub }),
          emissive: 0x221100, emissiveMap: this.textTexture(text, { sub: opts.sub })
        })
      );
      mesh.position.set(x, y, z);
      if (opts.rotY) mesh.rotation.y = opts.rotY;
      this.scene.add(mesh);
      return mesh;
    },

    // ---------------- environment ----------------
    buildSky() {
      this.scene.background = new THREE.Color(0xf3d9a7);
      this.scene.fog = new THREE.Fog(0xf3d9a7, 70, 280);
      const hemi = new THREE.HemisphereLight(0xfff4d6, 0x5b4a33, 0.75);
      this.scene.add(hemi);
      const sun = new THREE.DirectionalLight(0xffd9a0, 1.15);
      sun.position.set(80, 140, 60);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.left = -170; sun.shadow.camera.right = 170;
      sun.shadow.camera.top = 170; sun.shadow.camera.bottom = -170;
      sun.shadow.camera.far = 400;
      sun.shadow.bias = -0.001;
      this.scene.add(sun);
      this.sun = sun;
    },

    buildGround() {
      const g = new THREE.Mesh(
        new THREE.PlaneGeometry(520, 520),
        new THREE.MeshLambertMaterial({ color: 0xbfa26b })
      );
      g.rotation.x = -Math.PI / 2;
      g.position.y = -0.05;
      g.receiveShadow = true;
      this.scene.add(g);
    },

    buildRoads() {
      const roadC = document.createElement("canvas");
      roadC.width = 128; roadC.height = 128;
      const rctx = roadC.getContext("2d");
      rctx.fillStyle = "#4a4a4e"; rctx.fillRect(0, 0, 128, 128);
      rctx.fillStyle = "#e8e3d5";
      for (let i = 16; i < 128; i += 40) rctx.fillRect(0, i, 20, 4);
      const roadTex = new THREE.CanvasTexture(roadC);
      roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
      roadTex.repeat.set(1, 14);

      const coords = [-120, -60, 0, 60, 120];
      this.roads = coords;
      for (const c of coords) {
        const hRoad = new THREE.Mesh(
          new THREE.PlaneGeometry(300, 14),
          new THREE.MeshLambertMaterial({ map: roadTex })
        );
        hRoad.rotation.x = -Math.PI / 2;
        hRoad.position.set(c, 0.01, 0);
        hRoad.receiveShadow = true;
        this.scene.add(hRoad);

        const vRoad = new THREE.Mesh(
          new THREE.PlaneGeometry(14, 300),
          new THREE.MeshLambertMaterial({ map: roadTex })
        );
        vRoad.rotation.x = -Math.PI / 2;
        vRoad.position.set(0, 0.01, c);
        vRoad.receiveShadow = true;
        this.scene.add(vRoad);
      }
      // sidewalks
      for (const c of coords) {
        for (const side of [9, -9]) {
          const sw = new THREE.Mesh(
            new THREE.PlaneGeometry(300, 2.4),
            new THREE.MeshLambertMaterial({ color: 0x9b9b93 })
          );
          sw.rotation.x = -Math.PI / 2;
          sw.position.set(c + side * (c === 0 ? 1 : 1), 0.015, 0);
          sw.receiveShadow = true;
          this.scene.add(sw);
          const sw2 = new THREE.Mesh(
            new THREE.PlaneGeometry(2.4, 300),
            new THREE.MeshLambertMaterial({ color: 0x9b9b93 })
          );
          sw2.rotation.x = -Math.PI / 2;
          sw2.position.set(0, 0.015, c + side);
          sw2.receiveShadow = true;
          this.scene.add(sw2);
        }
      }
      this.roadCoords = coords;
    },

    buildPlaza() {
      // Charminar maidan: paved square
      const plaza = new THREE.Mesh(
        new THREE.PlaneGeometry(34, 34),
        new THREE.MeshLambertMaterial({ color: 0xcbb28a })
      );
      plaza.rotation.x = -Math.PI / 2;
      plaza.position.y = 0.02;
      plaza.receiveShadow = true;
      this.scene.add(plaza);
      // crosswalk stripes around plaza edge
      for (let i = -12; i <= 12; i += 4) {
        const s = new THREE.Mesh(
          new THREE.PlaneGeometry(2, 0.8),
          new THREE.MeshLambertMaterial({ color: 0xefefe7 })
        );
        s.rotation.x = -Math.PI / 2;
        s.position.set(i, 0.03, 17.4);
        this.scene.add(s);
        const s2 = s.clone();
        s2.position.set(i, 0.03, -17.4);
        this.scene.add(s2);
      }
    },

    buildCharminar() {
      const cream = 0xe9d9b2, gold = 0xd9a62e, stone = 0xcdb585;
      this.box({ x: 0, z: 0, w: 21, h: 1.2, d: 21, y: 0, color: stone, solid: true, radar: true });
      this.box({ x: 0, z: 0, w: 13.5, h: 8.6, d: 13.5, y: 1.2, color: cream, solid: true });
      // arches (pillars + lintel)
      for (let i = -4.4; i <= 4.4; i += 4.4) {
        for (const [px, pz] of [[i, 6.8], [i, -6.8], [6.8, i], [-6.8, i]]) {
          this.box({ x: px, z: pz, w: 1.1, h: 6.2, d: 1.1, y: 1.4, color: cream, solid: true });
        }
      }
      this.box({ x: 0, z: 0, w: 15, h: 2.2, d: 15, y: 9.4, color: stone, solid: true });
      this.box({ x: 0, z: 0, w: 12, h: 6.4, d: 12, y: 11.6, color: cream, solid: true });
      this.box({ x: 0, z: 0, w: 13.6, h: 1.8, d: 13.6, y: 18, color: stone, solid: true });
      // balconies
      for (const [px, pz] of [[-7.6, 0], [7.6, 0], [0, -7.6], [0, 7.6]]) {
        this.box({ x: px, z: pz, w: 2.2, h: 0.7, d: 6.4, y: 18.4, color: gold });
      }
      // central onion dome
      const dome = this.sphere({ x: 0, y: 19.5, r: 3.1, color: gold, scaleY: 1.35 });
      this.cyl({ x: 0, y: 23.5, r: 0.12, h: 2.2, color: gold });
      // four minarets
      const corners = [[-8.6, -8.6], [8.6, -8.6], [-8.6, 8.6], [8.6, 8.6]];
      for (const [cx, cz] of corners) {
        this.cyl({ x: cx, z: cz, r: 1.35, h: 20, y: 1.2, color: cream, solid: true });
        this.box({ x: cx, z: cz, w: 3.6, h: 0.8, d: 3.6, y: 9, color: gold });
        this.box({ x: cx, z: cz, w: 3.6, h: 0.8, d: 3.6, y: 18.4, color: gold });
        const td = this.sphere({ x: cx, y: 21.6, z: cz, r: 1.7, color: gold, scaleY: 1.5 });
        this.cyl({ x: cx, z: cz, y: 24.4, r: 0.09, h: 1.8, color: gold });
      }
      // name plaque
      this.sign("CHARMINAR", 0, 8.4, 10.9, { w: 8, h: 1.5 });
    },

    buildCity() {
      const palette = [0xe8d9b0, 0xc98f5f, 0xc9a227, 0xf2ead8, 0xa5544f, 0xd7b98c, 0x2f6d68, 0x8a4b3a, 0xe0c08f, 0x6f7f8c];
      const shopSigns = [
        "Bawarchi Biryani", "Karachi Bakery", "Irani Chai", "Laad Bazaar", "Charminar Masala",
        "Paigah Jewellers", "Moazzam Jahi Market", "Golconda Ice Cream", "Shadab Hotel", "Paan Corner"
      ];
      const R = this.roadCoords;
      let si = 0;
      for (let bi = 0; bi < R.length - 1; bi++) {
        for (let bj = 0; bj < R.length - 1; bj++) {
          const cx = (R[bi] + R[bi + 1]) / 2;
          const cz = (R[bj] + R[bj + 1]) / 2;
          // plaza clearance + lake + fort
          if (Math.hypot(cx, cz) < 34) continue;
          if (Math.hypot(cx + 130, cz + 130) < 60) continue;
          if (Math.hypot(cx - 130, cz - 130) < 46) continue;
          // special landmark zones
          if (Math.hypot(cx + 66, cz - 40) < 30) continue; // Bawarchi
          if (Math.hypot(cx - 66, cz + 40) < 30) continue; // chai street
          if (Math.hypot(cx - 40, cz + 70) < 34) continue; // Laad Bazaar

          const seed = (bi * 7 + bj * 13) % 10;
          const bcount = 1 + (seed % 3);
          let placed = [];
          for (let k = 0; k < bcount; k++) {
            const bw = 12 + ((seed + k * 3) % 18);
            const bd = 12 + ((seed + k * 5 + 2) % 18);
            const bx = cx + ((seed + k) % 5 - 2) * 4;
            const bz = cz + ((seed + k * 2) % 5 - 2) * 4;
            if (Math.hypot(bx, bz) < 26) continue;
            const bh = 8 + ((seed * 3 + k * 7) % 22);
            const col = palette[(seed + k) % palette.length];
            const hasSign = (bi + bj + k) % 3 === 0 && placed.length < 2;
            this.box({ x: bx, z: bz, w: bw, h: bh, d: bd, y: 0, color: col, solid: true, radar: true });
            // roof detail
            if (bh > 14) this.box({ x: bx + 2, z: bz + 2, w: 2.4, h: 1.6, d: 2.4, y: bh, color: 0x6f7f8c });
            if (hasSign) {
              const sText = shopSigns[si % shopSigns.length]; si++;
              const face = (k % 4);
              const yPos = Math.min(bh, 14);
              if (face === 0) this.sign(sText, bx, yPos, bz - bd / 2 - 0.2, { sub: "HYDERABAD • SINCE 1956" });
              else if (face === 1) this.sign(sText, bx, yPos, bz + bd / 2 + 0.2, { sub: "HYDERABAD • SINCE 1956", rotY: Math.PI });
              else if (face === 2) { this.sign(sText, bx - bw / 2 - 0.2, yPos, bz, { sub: "HYDERABAD • SINCE 1956", rotY: Math.PI / 2 }); }
              else this.sign(sText, bx + bw / 2 + 0.2, yPos, bz, { sub: "HYDERABAD • SINCE 1956", rotY: -Math.PI / 2 });
            }
            placed.push(1);
          }
        }
      }
    },

    buildHussainSagar() {
      const lakeX = -130, lakeZ = -130;
      const water = new THREE.Mesh(
        new THREE.CircleGeometry(58, 28),
        new THREE.MeshStandardMaterial({ color: 0x2c7a9e, transparent: true, opacity: 0.88, roughness: 0.3, metalness: 0.15 })
      );
      water.rotation.x = -Math.PI / 2;
      water.position.set(lakeX, 0.05, lakeZ);
      this.scene.add(water);
      // ghat steps
      for (let i = 0; i < 5; i++) {
        this.box({ x: lakeX + 34, z: lakeZ, w: 3, h: 0.45, d: 26 - i * 4, y: i * 0.45, color: 0x9a8d74, solid: false });
      }
      // island + Buddha statue
      this.cyl({ x: lakeX, z: lakeZ + 30, r: 6.5, h: 1, y: 0, color: 0x8f8169, solid: true });
      this.box({ x: lakeX, z: lakeZ + 30, w: 6, h: 0.8, d: 6, y: 1, color: 0xd8b56a, solid: true });
      const robe = this.cyl({ x: lakeX, z: lakeZ + 30, r2: 1.2, r: 2.3, h: 5.2, y: 1.8, color: 0xd8b56a, solid: true });
      this.box({ x: lakeX, z: lakeZ + 30, w: 2.8, h: 2, d: 2.4, y: 7, color: 0xd8b56a, solid: true });
      this.sphere({ x: lakeX, y: 9.6, z: lakeZ + 30, r: 1.15, color: 0xe6c57a });
      this.sphere({ x: lakeX, y: 11.2, z: lakeZ + 30, r: 0.42, color: 0xe6c57a, scaleY: 1.3 });
      this.box({ x: lakeX, z: lakeZ + 30, w: 0.18, h: 1.1, d: 2.8, y: 8.4, color: 0xe6c57a });
      this.sign("HUSSAIN SAGAR", lakeX - 20, 2, lakeZ, { w: 8, h: 1.3, rotY: Math.PI / 2 });
    },

    buildGolconda() {
      const hx = 130, hz = 130;
      const hill = new THREE.Mesh(
        new THREE.ConeGeometry(42, 12, 20),
        new THREE.MeshLambertMaterial({ color: 0x8a6a45 })
      );
      hill.position.set(hx, 6, hz);
      hill.receiveShadow = true;
      this.scene.add(hill);
      // fort walls
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const rx = hx + Math.cos(a) * 34;
        const rz = hz + Math.sin(a) * 34;
        this.box({ x: rx, z: rz, w: 9, h: 4.5, d: 2.2, y: 12, color: 0x9c7a4e, solid: true, rotY: a });
        for (let c = -3; c <= 3; c += 3) {
          this.box({ x: rx + Math.cos(a) * c, z: rz + Math.sin(a) * c, w: 1.4, h: 1.1, d: 1.6, y: 16.2, color: 0x9c7a4e });
        }
      }
      // gate
      this.box({ x: hx - 30, z: hz, w: 8, h: 7, d: 3, y: 14, color: 0x9c7a4e, solid: true });
      this.box({ x: hx - 30, z: hz, w: 8, h: 1.6, d: 3, y: 18.4, color: 0x9c7a4e });
      // cannons
      for (const dz of [-6, 0, 6]) {
        const canon = this.cyl({ x: hx - 26, z: hz + dz, r: 0.42, h: 3.4, y: 15.4, color: 0x3d3d3d, solid: false, seg: 8 });
        canon.rotation.z = Math.PI / 2.6;
        this.cyl({ x: hx - 28, z: hz + dz, r: 0.85, h: 0.5, y: 15.2, color: 0x2c2c2c });
      }
      this.sign("GOLCONDA FORT", hx - 14, 4, hz + 36, { w: 10, h: 1.5 });
    },

    buildLandmarks() {
      // Bawarchi Biryani restaurant (west-north)
      const rx = -66, rz = -40;
      this.box({ x: rx, z: rz, w: 22, h: 10, d: 16, y: 0, color: 0x8c2f2f, solid: true, radar: true });
      this.box({ x: rx, z: rz, w: 24, h: 2, d: 18, y: 10, color: 0x6b1f1f });
      this.box({ x: rx, z: rz, w: 3, h: 6, d: 3, y: 10.5, color: 0xd9a62e });
      this.sign("BAWARCHI BIRYANI", rx, 13.4, rz - 8.4, { sub: "HYDERABADI DUM • SINCE 1965" });
      this.sign("BAWARCHI BIRYANI", rx, 5.6, rz - 8.3, { w: 7, h: 1.6, sub: "EAT • TAKE • DELIVER" });
      // counter crates area
      this.box({ x: rx + 5, z: rz + 3, w: 4, h: 1.1, d: 3, y: 0, color: 0x4f6d3a, solid: true });

      // Irani chai street (east-south)
      const cx = 66, cz = 40;
      for (let i = -1; i <= 1; i++) {
        const sx = cx + i * 7;
        this.box({ x: sx, z: cz, w: 5.4, h: 2.6, d: 3.2, y: 0, color: 0x2f6d68, solid: true });
        this.box({ x: sx, z: cz - 1.2, w: 6, h: 1.1, d: 0.25, y: 2.3, color: 0xd9a62e });
        this.cyl({ x: sx, z: cz + 0.2, r: 0.14, h: 2.3, y: 2.6, color: 0x7a4b2a, solid: false });
      }
      this.sign("IRANI CHAI • OSMANIA BISCUIT", cx, 5.2, cz - 1.9, { w: 10, h: 1.8, rotY: 0 });

      // Laad Bazaar bangle stalls (east-north)
      const lx = 40, lz = -70;
      for (let i = -2; i <= 2; i++) {
        const sx = lx + i * 5.5;
        this.box({ x: sx, z: lz, w: 4.8, h: 2.3, d: 2.8, y: 0, color: 0x7a2f6d, solid: true });
        const hues = [0xe74c3c, 0xf1c40f, 0x2ecc71, 0x3498db, 0xe67e22];
        this.box({ x: sx, z: lz - 1, w: 5.2, h: 0.7, d: 0.2, y: 2.25, color: hues[i + 2] });
      }
      this.sign("LAAD BAZAAR • BANGLES", lx, 5.2, lz - 1.8, { w: 12, h: 1.7 });
    },

    buildProps() {
      // street lamps
      const lampRoads = [-60, 0, 60];
      for (const r of lampRoads) {
        for (let i = -2; i <= 2; i++) {
          const z = i * 45;
          this.lamp(r + 10, z);
          this.lamp(r - 10, z);
          this.lamp(z, r + 10);
          this.lamp(z, r - 10);
        }
      }
      // trees
      const trees = [[-30, -30], [30, 30], [-90, 90], [90, -90], [-90, -90], [90, 90], [-30, 90], [30, -90], [-150, -30], [150, 30], [-30, 150], [30, -150]];
      for (const [tx, tz] of trees) {
        if (Math.hypot(tx, tz) < 20 || Math.hypot(tx + 130, tz + 130) < 55) continue;
        this.cyl({ x: tx, z: tz, r: 0.28, h: 2.2, y: 0, color: 0x6d4a2f, solid: true });
        this.sphere({ x: tx, y: 2.8, z: tz, r: 1.5, color: 0x2e7d32 });
        this.sphere({ x: tx + 0.7, y: 3.4, z: tz + 0.4, r: 1.0, color: 0x388e3c });
      }
      // billboards
      const ads = [
        ["CHARMINAR MASALA", "SOO TRUE TO TASTE"],
        ["HYDERABADI DUM BIRYANI", "HUNGER KI BAAT KARO"],
        ["GOLCONDA PREMIUM CEMENT", "BUILT TO LAST 400 YEARS"],
        ["OSMANIA BISCUITS", "DIP IT IN CHAI"],
        ["MOAZZAM JAHI MARKET", "EVERYTHING ₹99"],
        ["PAAN + SUPARI CORNER", "AFTER EVERY MEAL"]
      ];
      const bpos = [[-95, 95], [95, -95], [-150, 0], [150, 0], [0, -150], [0, 150]];
      for (let i = 0; i < bpos.length; i++) {
        const [bx, bz] = bpos[i];
        this.cyl({ x: bx, z: bz, r: 0.25, h: 7, y: 0, color: 0x555, solid: false });
        const board = new THREE.Mesh(
          new THREE.PlaneGeometry(16, 6),
          new THREE.MeshLambertMaterial({ map: this.textTexture(ads[i][0], { w: 512, h: 192, size: 58, sub: ads[i][1], bg: "#173a5e", fg: "#ffe08a" }) })
        );
        board.position.set(bx, 10.5, bz);
        board.rotation.y = Math.atan2(0 - bx, 0 - bz) + Math.PI;
        board.lookAt(0, 10.5, 0);
        this.scene.add(board);
        this.addSolid(bx, bz, 2.2, 2.2, 1);
      }
    },

    lamp(x, z) {
      this.cyl({ x, z, r: 0.18, h: 5.2, y: 0, color: 0x3f3f3f, solid: true });
      const arm = this.box({ x: x + 0.75, z, w: 0.9, h: 0.18, d: 0.18, y: 5.1, color: 0x3f3f3f, solid: false });
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xfff3b0 })
      );
      bulb.position.set(x + 1.1, 5.05, z);
      this.scene.add(bulb);
    },

    // ---------------- autos ----------------
    makeAuto(o) {
      const g = new THREE.Group();
      const color = o.color || 0x2e9e4f;
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.55, 2.25), new THREE.MeshLambertMaterial({ color }));
      body.position.y = 0.85; body.castShadow = true;
      g.add(body);
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.62, 1.35), new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.8) }));
      canopy.position.set(0, 1.45, -0.15); canopy.castShadow = true;
      g.add(canopy);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.72), new THREE.MeshLambertMaterial({ color: 0x2b2b2b }));
      seat.position.set(0, 1.22, -0.1);
      g.add(seat);
      const ws = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.5, 0.06), new THREE.MeshLambertMaterial({ color: 0xbfe8ff }));
      ws.position.set(0, 1.32, 0.74);
      g.add(ws);
      const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.16, 10);
      wheelGeo.rotateZ(Math.PI / 2);
      const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
      for (const [wx, wz] of [[-0.5, 0.95], [0.5, 0.95], [0, -1.0]]) {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.position.set(wx, 0.3, wz);
        g.add(wheel);
      }
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.1), new THREE.MeshBasicMaterial({ color: 0xfff2a8 }));
      head.position.set(0, 0.95, 1.14);
      g.add(head);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.04), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
      plate.position.set(0, 0.55, -1.13);
      g.add(plate);
      g.userData = {
        kind: "auto", hp: o.hp || 60, maxHp: o.hp || 60, stolen: !!o.stolen,
        axis: o.axis, dir: o.dir, lane: o.lane, speed: o.speed || 5.5,
        honkT: Math.random() * 8, dead: false
      };
      g.position.set(o.x, 0, o.z);
      this.scene.add(g);
      this.autos.push(g);
      this.hittable.push(g);
      return g;
    },

    buildAutos() {
      const colors = [0x2e9e4f, 0xf4d03f, 0x7d3c98, 0x16a085, 0x2980b9, 0xcb4335];
      const R = this.roadCoords;
      for (let i = 0; i < 10; i++) {
        const axis = i % 2 === 0 ? "x" : "z";
        const road = R[i % R.length];
        const lane = (i % 3) - 1;
        const pos = { x: axis === "x" ? (Math.random() * 300 - 150) : road + lane * 3.2, z: axis === "z" ? (Math.random() * 300 - 150) : road + lane * 3.2 };
        if (Math.hypot(pos.x - 0, pos.z - 0) < 22) continue;
        const a = this.makeAuto({
          x: pos.x, z: pos.z, axis, dir: Math.random() > 0.5 ? 1 : -1, lane,
          speed: 4.5 + Math.random() * 2.5, color: colors[i % colors.length]
        });
        a.position.y = 0;
      }
    },

    updateAutos(dt) {
      const player = HYD.Player;
      for (const a of this.autos) {
        if (a.userData.dead) continue;
        const ud = a.userData;
        if (ud.axis === "x") a.position.x += ud.dir * ud.speed * dt;
        else a.position.z += ud.dir * ud.speed * dt;
        // orientation
        if (ud.axis === "x") a.rotation.y = ud.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
        else a.rotation.y = ud.dir > 0 ? 0 : Math.PI;
        // wrap at bounds
        if (a.position.x > this.bounds) a.position.x = -this.bounds;
        if (a.position.x < -this.bounds) a.position.x = this.bounds;
        if (a.position.z > this.bounds) a.position.z = -this.bounds;
        if (a.position.z < -this.bounds) a.position.z = this.bounds;
        ud.honkT -= dt;
        if (ud.honkT <= 0) {
          ud.honkT = 5 + Math.random() * 9;
          if (player && player.pos && Math.hypot(player.pos.x - a.position.x, player.pos.z - a.position.z) < 30) {
            HYD.Audio.autoHorn();
          }
        }
      }
    },

    destroyAuto(a) {
      a.userData.dead = true;
      if (HYD.Effects) HYD.Effects.explosion(a.position);
      HYD.Audio.explode();
      this.scene.remove(a);
      const i = this.autos.indexOf(a); if (i >= 0) this.autos.splice(i, 1);
      const j = this.hittable.indexOf(a); if (j >= 0) this.hittable.splice(j, 1);
    },

    // ---------------- NPCs ----------------
    makeNPC(x, z) {
      const g = new THREE.Group();
      const skin = Math.random() > 0.5 ? 0xc68642 : 0x8d5524;
      const kurta = [0x4f6d3a, 0x7d3c98, 0x2e86c1, 0xd35400, 0x7f8c8d, 0xc0392b, 0x2980b9][Math.floor(Math.random() * 7)];
      const legs = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.85, 0.3), new THREE.MeshLambertMaterial({ color: 0x3c3c3c }));
      legs.position.y = 0.42;
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.34), new THREE.MeshLambertMaterial({ color: kurta }));
      torso.position.y = 1.26;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 10), new THREE.MeshLambertMaterial({ color: skin }));
      head.position.y = 1.9;
      const turban = Math.random() > 0.45;
      const headwear = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.2, 8), new THREE.MeshLambertMaterial({ color: turban ? 0xd9a62e : 0x2b2b2b }));
      if (turban) { headwear.position.y = 2.13; } else { headwear.position.y = 1.72; headwear.scale.y = 0.35; }
      g.add(legs, torso, head, headwear);
      g.traverse(m => { m.castShadow = true; });
      g.position.set(x, 0, z);
      g.userData = {
        kind: "npc", hp: 100, maxHp: 100, npc: true,
        dir: new THREE.Vector2(Math.random() > 0.5 ? 1 : -1, Math.random() > 0.5 ? 1 : -1).normalize(),
        speed: 1.1, turnT: 2 + Math.random() * 4, bubbleT: 6 + Math.random() * 10,
        bubble: null, panic: 0, dead: false
      };
      this.scene.add(g);
      this.npcs.push(g);
      this.hittable.push(g);
      return g;
    },

    buildNPCs() {
      const spots = [[-25, -25], [25, 25], [-95, 10], [10, -95], [65, -68], [-64, -38], [64, 38], [-130, -118], [128, 128], [25, -25], [-25, 25], [-60, 60], [60, -60], [-90, -90], [90, 90], [0, -65]];
      for (const [x, z] of spots) {
        if (Math.hypot(x, z) < 19) continue;
        this.makeNPC(x + (Math.random() * 6 - 3), z + (Math.random() * 6 - 3));
      }
    },

    updateNPCs(dt) {
      const quips = [
        "Biryani khake jao!", "Kya haal hai?", "Chai garam hai!", "Paisa de, paisa de!",
        "Arre yaar!", "Salaam alaikum!", "Timepass mat kar!", "Miya, jaldi karo!",
        "Ekdum desi!", "Idhar aa re!", "Khana khao, khana khao!", "Aaraam se, bhai!"
      ];
      for (const n of this.npcs) {
        if (n.userData.dead) continue;
        const ud = n.userData;
        if (ud.panic > 0) {
          ud.panic -= dt;
          ud.speed = 4.2;
        } else {
          ud.speed += (1.1 - ud.speed) * dt * 2;
        }
        ud.turnT -= dt;
        if (ud.turnT <= 0) {
          ud.turnT = 2 + Math.random() * 5;
          ud.dir.set(Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
        }
        const nx = n.position.x + ud.dir.x * ud.speed * dt;
        const nz = n.position.z + ud.dir.y * ud.speed * dt;
        if (!this.pointBlocked(nx, nz) && Math.abs(nx) < this.bounds && Math.abs(nz) < this.bounds) {
          n.position.x = nx; n.position.z = nz;
        } else {
          ud.dir.set(Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
        }
        n.rotation.y = Math.atan2(ud.dir.x, ud.dir.y);
        // speech bubbles
        ud.bubbleT -= dt;
        const player = HYD.Player;
        if (ud.bubbleT <= 0 && player && Math.hypot(player.pos.x - n.position.x, player.pos.z - n.position.z) < 18) {
          ud.bubbleT = 8 + Math.random() * 12;
          this.say(n, quips[Math.floor(Math.random() * quips.length)]);
        }
        if (ud.bubble) {
          ud.bubble.lookAt(HYD.camPos || new THREE.Vector3());
        }
      }
    },

    say(npc, text) {
      if (npc.userData.bubble) {
        this.scene.remove(npc.userData.bubble);
        npc.userData.bubble = null;
      }
      const c = document.createElement("canvas");
      c.width = 256; c.height = 64;
      const ctx = c.getContext("2d");
      ctx.font = "700 30px Mukta, sans-serif";
      const tw = ctx.measureText(text).width + 40;
      const bw = Math.max(150, tw);
      c.width = bw; c.height = 64;
      const ctx2 = c.getContext("2d");
      ctx2.fillStyle = "rgba(255,255,255,0.92)";
      ctx2.beginPath(); ctx2.roundRect(4, 4, bw - 8, 44, 12); ctx2.fill();
      ctx2.fillStyle = "#111";
      ctx2.font = "700 28px Mukta, sans-serif";
      ctx2.textAlign = "center"; ctx2.textBaseline = "middle";
      ctx2.fillText(text, bw / 2, 26);
      const tex = new THREE.CanvasTexture(c);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
      sprite.scale.set(bw / 40, 1.6, 1);
      sprite.position.set(0, 2.7, 0);
      npc.add(sprite);
      npc.userData.bubble = sprite;
      setTimeout(() => {
        if (npc.userData.bubble === sprite) {
          npc.remove(sprite);
          npc.userData.bubble = null;
        }
      }, 3200);
    },

    // ---------------- pickups ----------------
    addPickup(kind, x, z) {
      const g = new THREE.Group();
      const mat = { ammo: 0x8a5a2b, med: 0xf1f1f1, armor: 0x2f6fa3, biryani: 0x2e7d32, loot: 0xd4a017 }[kind] || 0x888;
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.55, 0.5), new THREE.MeshLambertMaterial({ color: mat }));
      body.position.y = 0.35; body.castShadow = true;
      g.add(body);
      if (kind === "med" || kind === "armor") {
        const mark = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.4, 0.02), new THREE.MeshLambertMaterial({ color: kind === "med" ? 0xc0392b : 0xe8e8e8 }));
        mark.position.set(0, 0.42, 0.26);
        g.add(mark);
      }
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(0.55, 0.24),
        new THREE.MeshBasicMaterial({ map: this.textTexture(kind.toUpperCase(), { w: 128, h: 64, size: 34, bg: "#333", fg: "#ffe08a" }) })
      );
      label.position.set(0, 0.45, 0.26);
      g.add(label);
      g.position.set(x, 0, z);
      g.userData = { pickup: kind, baseY: 0, taken: false };
      this.scene.add(g);
      this.pickups.push(g);
      return g;
    },

    initialPickups() {
      this.addPickup("ammo", 18, 8);
      this.addPickup("ammo", -18, -8);
      this.addPickup("ammo", 8, -18);
      this.addPickup("med", -8, 18);
      this.addPickup("armor", -62, -36);
      this.addPickup("med", 62, 36);
    },

    updatePickups(dt) {
      const player = HYD.Player;
      const collected = [];
      for (const p of this.pickups) {
        if (p.userData.taken) continue;
        p.rotation.y += dt * 1.6;
        p.position.y = p.userData.baseY + Math.sin(performance.now() / 450) * 0.08 + 0.05;
        if (player && player.pos) {
          const dx = player.pos.x - p.position.x, dz = player.pos.z - p.position.z;
          if (dx * dx + dz * dz < 1.6) {
            p.userData.taken = true;
            this.scene.remove(p);
            collected.push(p.userData.pickup);
          }
        }
      }
      return collected;
    },

    // ---------------- objective markers ----------------
    addMarker(x, z, color = 0x2ecc71, id) {
      const g = new THREE.Group();
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.24, 16, 8, 1, true),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 })
      );
      beam.position.y = 8;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.6, 2.0, 24),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.15;
      const bob = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), new THREE.MeshBasicMaterial({ color }));
      bob.position.y = 17;
      g.add(beam, ring, bob);
      g.position.set(x, 0, z);
      this.scene.add(g);
      const m = { group: g, id, pos: new THREE.Vector3(x, 0, z) };
      this.markers.push(m);
      return m;
    },

    setMarkerVisible(id, visible) {
      for (const m of this.markers) {
        if (m.id === id) m.group.visible = visible;
      }
    },

    updateMarkers(dt, t) {
      for (const m of this.markers) {
        m.group.children[2].position.y = 17 + Math.sin(t * 3 + m.pos.x) * 0.5;
        m.group.children[0].material.opacity = 0.4 + Math.sin(t * 4) * 0.2;
      }
    }
  };

  HYD.World = W;
})();
