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
    renderer: null,

    init(scene, renderer) {
      this.scene = scene;
      this.renderer = renderer;
      this.raycaster = new THREE.Raycaster();
      this.lampBulbs = [];
      this.windowMats = [];
      this.clouds = [];
      this.aoMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.24, depthWrite: false });
      this.buildSky();
      this.buildEnvironment();
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
    mat(color, opts = {}) {
      return new THREE.MeshStandardMaterial(Object.assign({
        color, roughness: opts.roughness !== undefined ? opts.roughness : 0.82,
        metalness: opts.metalness || 0.05,
        envMapIntensity: 0.5
      }, opts.extra || {}));
    },

    box(o) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(o.w, o.h, o.d),
        o.mat || this.mat(o.color)
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
        o.mat || this.mat(o.color)
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
        o.mat || this.mat(o.color)
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
      this.scene.background = null;
      this.scene.fog = new THREE.Fog(0xf3d9a7, 80, 300);
      this.skySunDir = new THREE.Vector3(0.45, 0.55, 0.38).normalize();
      this.skyMat = new THREE.ShaderMaterial({
        uniforms: {
          topColor: { value: new THREE.Color(0x3b7cc4) },
          midColor: { value: new THREE.Color(0xf3d9a7) },
          botColor: { value: new THREE.Color(0xe8b26a) },
          sunDir: { value: this.skySunDir.clone() },
          sunColor: { value: new THREE.Color(0xfff2c8) }
        },
        vertexShader: `
          varying vec3 vWorld;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorld = wp.xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform vec3 topColor; uniform vec3 midColor; uniform vec3 botColor;
          uniform vec3 sunDir; uniform vec3 sunColor;
          varying vec3 vWorld;
          void main() {
            vec3 nd = normalize(vWorld);
            float y = clamp(nd.y, -1.0, 1.0);
            vec3 col = mix(botColor, midColor, smoothstep(-0.08, 0.32, y));
            col = mix(col, topColor, smoothstep(0.28, 0.72, y));
            float s = pow(max(dot(nd, sunDir), 0.0), 900.0);
            float halo = pow(max(dot(nd, sunDir), 0.0), 7.0);
            col += sunColor * s * 1.4 + sunColor * halo * 0.35;
            gl_FragColor = vec4(col, 1.0);
          }`,
        side: THREE.BackSide,
        fog: false,
        depthWrite: false
      });
      const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(480, 24, 14), this.skyMat);
      skyMesh.renderOrder = -10;
      this.scene.add(skyMesh);

      // sun sprite + glow
      this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.makeGlowTexture(0xfff6d8, 0.0, 0.9),
        transparent: true,
        depthWrite: false
      }));
      this.sunSprite.scale.set(90, 90, 1);
      this.scene.add(this.sunSprite);

      // clouds
      const cloudTex = this.makeGlowTexture(0xffffff, 0.45, 0.75);
      for (let i = 0; i < 11; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({
          map: cloudTex, transparent: true, opacity: 0.5 + Math.random() * 0.25, depthWrite: false
        }));
        sp.position.set((Math.random() - 0.5) * 420, 95 + Math.random() * 70, (Math.random() - 0.5) * 420);
        const s = 70 + Math.random() * 90;
        sp.scale.set(s * 1.7, s * 0.45, 1);
        sp.userData.speed = 0.5 + Math.random() * 0.7;
        this.scene.add(sp);
        this.clouds.push(sp);
      }

      // dust motes
      const dustGeo = new THREE.BufferGeometry();
      const N = 140;
      const pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 380;
        pos[i * 3 + 1] = Math.random() * 26;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 380;
      }
      dustGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
        map: this.makeGlowTexture(0xffe9b8, 0, 0.5),
        size: 1.1, transparent: true, opacity: 0.22, depthWrite: false
      }));
      this.scene.add(dust);
      this.dust = dust;

      const hemi = new THREE.HemisphereLight(0xfff4d6, 0x5b4a33, 0.8);
      this.scene.add(hemi);
      this.hemi = hemi;
      const sun = new THREE.DirectionalLight(0xffd9a0, 1.2);
      sun.position.copy(this.skySunDir).multiplyScalar(170);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.left = -170; sun.shadow.camera.right = 170;
      sun.shadow.camera.top = 170; sun.shadow.camera.bottom = -170;
      sun.shadow.camera.far = 400;
      sun.shadow.bias = -0.001;
      this.scene.add(sun);
      this.sun = sun;
    },

    buildEnvironment() {
      if (!this.renderer) return;
      try {
        const envScene = new THREE.Scene();
        envScene.background = new THREE.Color(0x8fb8dc);
        const gnd = new THREE.Mesh(
          new THREE.CircleGeometry(12, 10),
          new THREE.MeshBasicMaterial({ color: 0xc9a76a })
        );
        gnd.rotation.x = -Math.PI / 2;
        gnd.position.y = -0.4;
        envScene.add(gnd);
        const sunP = new THREE.Mesh(
          new THREE.PlaneGeometry(7, 7),
          new THREE.MeshBasicMaterial({ color: 0xfff2c8 })
        );
        sunP.position.set(0, 5, -7);
        envScene.add(sunP);
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        const rt = pmrem.fromScene(envScene, 0.05);
        this.scene.environment = rt.texture;
        this.scene.environmentIntensity = 0.45;
        pmrem.dispose();
        envScene.traverse(o => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) o.material.dispose();
        });
      } catch (e) {
        // fall back to lighting-only
      }
    },

    makeGlowTexture(hex, innerAlpha, outerAlpha) {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const ctx = c.getContext("2d");
      const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
      const col = "#" + hex.toString(16).padStart(6, "0");
      g.addColorStop(0, col);
      g.addColorStop(0.25, col + "cc");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    },

    buildGround() {
      const tex = this.makeGroundTexture();
      const g = new THREE.Mesh(
        new THREE.PlaneGeometry(520, 520),
        this.mat(0xbfa26b, { roughness: 0.95, extra: { map: tex } })
      );
      g.rotation.x = -Math.PI / 2;
      g.position.y = -0.06;
      g.receiveShadow = true;
      this.scene.add(g);
    },

    makeGroundTexture() {
      const c = document.createElement("canvas");
      c.width = c.height = 512;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#b49a6e";
      ctx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 9000; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? "rgba(90,70,40,0.10)" : "rgba(230,215,175,0.10)";
        ctx.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 4, 2 + Math.random() * 4);
      }
      for (let i = 0; i < 70; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? "rgba(80,60,35,0.16)" : "rgba(240,225,190,0.12)";
        ctx.beginPath();
        ctx.ellipse(Math.random() * 512, Math.random() * 512, 8 + Math.random() * 26, 5 + Math.random() * 14, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(14, 14);
      tex.anisotropy = 4;
      return tex;
    },

    makeAsphaltTexture() {
      const c = document.createElement("canvas");
      c.width = 256; c.height = 256;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#3d3d43";
      ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 7000; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? "rgba(20,20,24,0.16)" : "rgba(120,120,128,0.10)";
        ctx.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
      }
      // centre dashed line running along the road (u axis)
      ctx.fillStyle = "rgba(235,232,220,0.85)";
      for (let x = 8; x < 256; x += 44) ctx.fillRect(x, 120, 20, 16);
      // tyre wear
      ctx.fillStyle = "rgba(20,20,22,0.25)";
      ctx.fillRect(0, 70, 256, 10);
      ctx.fillRect(0, 176, 256, 10);
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 4;
      return tex;
    },

    makeSidewalkTexture() {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#8f8f88";
      ctx.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 1200; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? "rgba(40,40,44,0.14)" : "rgba(200,200,190,0.10)";
        ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
      }
      ctx.strokeStyle = "rgba(60,60,60,0.4)";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 128; i += 32) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 128); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(128, i); ctx.stroke();
      }
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(3, 12);
      return tex;
    },

    makePlasterTexture(baseHex, seed) {
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      const ctx = c.getContext("2d");
      const base = "#" + baseHex.toString(16).padStart(6, "0");
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, 256, 256);
      // weathering
      for (let i = 0; i < 5000; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? "rgba(60,45,30,0.10)" : "rgba(255,245,220,0.08)";
        ctx.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 5, 2 + Math.random() * 5);
      }
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = "rgba(70,55,35,0.10)";
        ctx.fillRect(0, i * 28 + (seed % 5), 256, 1 + Math.random() * 3);
      }
      // windows
      const lit = [];
      ctx.fillStyle = "#17181d";
      for (let r = 0; r < 5; r++) {
        for (let col = 0; col < 4; col++) {
          const x = 30 + col * 55, y = 18 + r * 46;
          ctx.fillRect(x, y, 34, 42);
          if (Math.random() < 0.22) lit.push([x + 4, y + 4]);
        }
      }
      // emissive map
      const ce = document.createElement("canvas");
      ce.width = ce.height = 256;
      const ectx = ce.getContext("2d");
      ectx.clearRect(0, 0, 256, 256);
      ectx.fillStyle = "#ffd98a";
      for (const [x, y] of lit) {
        ectx.fillRect(x, y, 26, 34);
        ectx.fillStyle = "#ffe9b0";
        ectx.fillRect(x + 3, y + 3, 10, 12);
        ectx.fillStyle = "#ffd98a";
      }
      const map = new THREE.CanvasTexture(c);
      const emissive = new THREE.CanvasTexture(ce);
      map.anisotropy = 4; emissive.anisotropy = 4;
      return { map, emissive };
    },

    makeWaterTexture() {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#2f7f9e";
      ctx.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 1600; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.08)" : "rgba(10,40,60,0.12)";
        ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
      }
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 10; i++) {
        ctx.beginPath();
        ctx.moveTo(Math.random() * 128, Math.random() * 128);
        ctx.quadraticCurveTo(Math.random() * 128, Math.random() * 128, Math.random() * 128, Math.random() * 128);
        ctx.stroke();
      }
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(6, 6);
      return tex;
    },

    buildRoads() {
      const roadTex = this.makeAsphaltTexture();
      const roadTexV = roadTex.clone();
      roadTexV.repeat.set(1, 18);
      const sideTex = this.makeSidewalkTexture();

      const coords = [-120, -60, 0, 60, 120];
      this.roads = coords;
      for (const c of coords) {
        const hRoad = new THREE.Mesh(
          new THREE.PlaneGeometry(300, 14),
          this.mat(0x4a4a4e, { roughness: 0.94, extra: { map: roadTex } })
        );
        hRoad.rotation.x = -Math.PI / 2;
        hRoad.position.set(c, 0.01, 0);
        roadTex.repeat.set(18, 1);
        hRoad.receiveShadow = true;
        this.scene.add(hRoad);

        const vRoad = new THREE.Mesh(
          new THREE.PlaneGeometry(14, 300),
          this.mat(0x4a4a4e, { roughness: 0.94, extra: { map: roadTexV } })
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
            this.mat(0x9b9b93, { roughness: 0.9, extra: { map: sideTex } })
          );
          sw.rotation.x = -Math.PI / 2;
          sw.position.set(c + side * (c === 0 ? 1 : 1), 0.015, 0);
          sw.receiveShadow = true;
          this.scene.add(sw);
          const sw2 = new THREE.Mesh(
            new THREE.PlaneGeometry(2.4, 300),
            this.mat(0x9b9b93, { roughness: 0.9, extra: { map: sideTex } })
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
      const plasterSeeds = [[0xe8d9b0, 0], [0xd7b98c, 2], [0xf2ead8, 4], [0xc98f5f, 6]];
      const plasterVariants = plasterSeeds.map(([hex, seed]) => this.makePlasterTexture(hex, seed));
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
            const pv = plasterVariants[(seed + k) % plasterVariants.length];
            const bMat = this.mat(col, {
              roughness: 0.9,
              extra: {
                map: pv.map,
                emissive: 0xffffff,
                emissiveMap: pv.emissive,
                emissiveIntensity: 0.14
              }
            });
            this.windowMats.push(bMat);
            this.box({ x: bx, z: bz, w: bw, h: bh, d: bd, y: 0, color: col, mat: bMat, solid: true, radar: true });
            // fake ambient occlusion plinth
            this.box({ x: bx, z: bz, w: bw + 1.0, h: 0.85, d: bd + 1.0, y: 0, color: 0x000000, mat: this.aoMat, cast: false });
            // roof detail
            if (bh > 14) this.box({ x: bx + 2, z: bz + 2, w: 2.4, h: 1.6, d: 2.4, y: bh, color: 0x6f7f8c, mat: this.mat(0x6f7f8c, { roughness: 0.75, metalness: 0.35 }) });
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
        this.mat(0x2c7a9e, {
          roughness: 0.18, metalness: 0.4,
          extra: { transparent: true, opacity: 0.9, map: this.makeWaterTexture() }
        })
      );
      water.rotation.x = -Math.PI / 2;
      water.position.set(lakeX, 0.05, lakeZ);
      this.waterMat = water.material;
      this.waterTex = water.material.map;
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
      this.box({ x: x + 0.75, z, w: 0.9, h: 0.18, d: 0.18, y: 5.1, color: 0x3f3f3f, solid: false });
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xfff3b0 })
      );
      bulb.position.set(x + 1.1, 5.05, z);
      this.scene.add(bulb);
      this.lampBulbs.push(bulb);
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
      // driver
      const dBody = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.42, 0.22), new THREE.MeshLambertMaterial({ color: 0x3c4a6b }));
      dBody.position.set(0, 1.52, 0.35);
      const dHead = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), new THREE.MeshLambertMaterial({ color: 0xc68642 }));
      dHead.position.set(0, 1.82, 0.36);
      g.add(dBody, dHead);
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
        ud.walkT = (ud.walkT || 0) + dt * ud.speed * 2.8;
        n.position.y = Math.abs(Math.sin(ud.walkT)) * 0.07;
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
    },

    // ---------------- time-of-day lighting ----------------
    updateLights(dt, t) {
      const cycle = (t % 480) / 480;              // 8-minute day
      const dRaw = Math.max(0, Math.min(1, (cycle - 0.52) / 0.42));
      const dusk = dRaw * dRaw * (3 - 2 * dRaw);   // smoothstep
      const az = 0.55 - cycle * 0.95;
      const el = 0.62 - cycle * 0.55;
      const sd = new THREE.Vector3(
        Math.cos(az) * Math.cos(el),
        Math.sin(el),
        Math.sin(az) * Math.cos(el)
      ).normalize();
      this.skySunDir.copy(sd);

      // sun
      this.sun.position.copy(sd).multiplyScalar(175);
      this.sun.intensity = 1.2 - dusk * 0.7;
      this.sun.color.setHex(dusk > 0.35 ? 0xff8c4a : 0xffd9a0);
      // hemisphere
      this.hemi.intensity = 0.8 - dusk * 0.38;
      this.hemi.color.setHex(dusk > 0.3 ? 0x9aa8c8 : 0xfff4d6);
      this.hemi.groundColor.setHex(dusk > 0.3 ? 0x3a2f42 : 0x5b4a33);
      // fog & sky
      const fogC = new THREE.Color(0xf3d9a7).lerp(new THREE.Color(0xc08457), dusk).lerp(new THREE.Color(0x8a5a8a), dusk * dusk * 0.8);
      this.scene.fog.color.copy(fogC);
      const u = this.skyMat.uniforms;
      u.topColor.value.setHex(dusk > 0.3 ? 0x273a5c : 0x3b7cc4);
      u.midColor.value.copy(fogC);
      u.botColor.value.setHex(dusk > 0.4 ? 0x8a4a6d : 0xe8b26a);
      u.sunDir.value.copy(sd);
      // lamps glow at dusk
      for (const b of this.lampBulbs) {
        b.material.color.setHex(0xfff3b0).multiplyScalar(0.25 + dusk * 1.2);
      }
      // windows light up
      for (const m of this.windowMats) {
        m.emissiveIntensity = 0.12 + dusk * 0.95;
      }
      // water shimmer
      if (this.waterTex) {
        this.waterTex.offset.x = (this.waterTex.offset.x + dt * 0.012) % 1;
        this.waterTex.offset.y = (this.waterTex.offset.y + dt * 0.007) % 1;
      }
      // sun sprite follows sun
      this.sunSprite.position.copy(sd).multiplyScalar(430);
      this.sunSprite.material.opacity = 1 - dusk * 0.5;
    },

    updateDust(dt) {
      if (!this.dust) return;
      const pos = this.dust.geometry.attributes.position.array;
      for (let i = 1; i < pos.length; i += 3) {
        pos[i] += 0.16 * dt;
        if (pos[i] > 26) pos[i] = 0.2;
      }
      this.dust.geometry.attributes.position.needsUpdate = true;
      for (const c of this.clouds) {
        c.position.x += c.userData.speed * dt;
        if (c.position.x > 230) c.position.x = -230;
      }
    }
  };

  HYD.World = W;
})();
