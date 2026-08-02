# Hyderabad: Streets of the Nizam 🕌

An open-world, browser-based 3D FPS set in the heart of Hyderabad — think *GTA San Andreas* energy, desi flavour. Charminar maidan, dum-biryani deliveries, auto-rickshaw chases through the old city, Laad Bazaar bangle-stall defence and a final showdown with Don Sikander at Hussain Sagar.

**No signup needed for the first 60 seconds.** After that the game asks you to sign in with email/password or Google — and only then do your avatar, money, weapon unlocks and mission progress get saved (and restored when you come back).

## Play it

```bash
cd <project>
python3 -m http.server 8123
# open http://localhost:8123
```

No build step, no dependencies to install — everything is local, including the vendored Three.js engine, so it even works offline.

## Controls

| Key | Action |
|---|---|
| W A S D | Move |
| Mouse | Look (click canvas to lock pointer) |
| Left click | Shoot |
| R | Reload |
| 1 / 2 | Pistol / AK-56 |
| Shift | Sprint |
| Space | Jump |
| Esc | Pause (customise avatar, audio, shop, rampage) |
| P | Toggle god mode (debug) |

## Missions (Hyderabadi-flavoured)

1. **Welcome to Hyderabad, Saar!** — tutorial: shoot the training dummies at Charminar maidan.
2. **Biryani Dangal** — shuttle three dum-biryanis from Bawarchi to hungry customers before they cool.
3. **Auto Recovery** — chase down the maroon stolen auto and recover the loot. Unlocks the famous **AK-56**.
4. **Laad Bazaar Guard** — survive three waves of rowdies at the bangle stalls.
5. **Hussain Sagar Showdown** — clear the waves, then defeat **Don Sikander**.

After that: **free roam** and **Rowdy Rampage** (endless waves + local high score).

Killing civilians raises a **wanted level** and brings khaki cops. Money (`₹`) comes from missions and kills; **Chai-Coins** buy premium cosmetics in the Avatar Atelier.

## Gameplay & world

- Procedurally generated city: Charminar, Hussain Sagar + Buddha statue, Golconda fort, Bawarchi Biryani, Irani chai street, Laad Bazaar stalls, autos driving and honking, pedestrians chatting in Deccani ("Biryani khake jao!", "Chai garam hai!").
- First-person shooting with hitscan bullets, tracers, muzzle flash, recoil, blood/spark particles, enemy HP bars and simple AI (chase / strafe / shoot with line-of-sight).
- Radar, health/armour, objective markers, mission banners, kill feed, toasts.
- Fully procedural audio (WebAudio): gunshots, auto horns, chai sizzle, tabla/tanpura-style ambient loop. No audio files needed.

## Audio & soundtrack

- **Two composed soundtracks** generated live with WebAudio — *Charminar Dusk* (menus: slow mystical drone + melody) and *Biryani Beat* (gameplay: driving tabla rhythm at 112 BPM). They crossfade automatically when you enter or leave a mission.
- **City ambience bed**: a low traffic-hum loop with random auto honks, chai sizzles, bird calls and whistles.
- Audio starts on your **first click or keypress** (browsers require a user gesture), and you can toggle **Music / SFX** from the pause menu — the setting is saved with your profile.

## Visuals

- PBR materials with a procedurally generated environment map (PMREM), filmic ACES tone mapping, a dynamic sky shader with sun + halo, drifting clouds and dust motes.
- Procedural textures for roads (lane markings, tyre wear), sidewalks, dusty earth, plaster walls with weathered stains and **windows that light up at dusk**, plus shimmering water.
- A slow **day → sunset lighting cycle** (about 8 minutes): the sun sinks, lamps and windows glow, and the sky and fog warm to dusk purple.

## Signup & saving

- **Email/password** — accounts are stored on-device (localStorage) with salted SHA-256 hashes. Demo-grade: data lives in the browser.
- **Continue with Google** — currently a *simulated consent flow* so the full game loop is testable. To make it real, add your OAuth client ID in `js/config.js` and replace `HYD.Auth.googleSignIn` with Google Identity Services (`google.accounts.id`), then verify the ID token server-side. Recommended: Firebase Auth or a tiny backend (see roadmap).
- Progress (missions, money, kills, avatar, cosmetics, settings, rampage score) auto-saves under the signed-in email.

## Monetisation (wired, ready to go live)

Payments are implemented with **Razorpay** (UPI, cards, netbanking, wallets — the natural fit for an Indian audience). The shop has:

- **Elite Pass — ₹199 one-time**: all premium cosmetics unlocked, ad-free, +25% mission cash.
- **Chai-Coins packs** — ₹49 / ₹99 / ₹199.
- **Rewarded ad** — ₹250 in-game cash (AdSense in production).

Until you add a key, the game runs in **DEMO mode** where purchases are simulated so you can test the whole flow.

### Go live with payments

1. Create a [Razorpay merchant account](https://dashboard.razorpay.com) (KYC needed for live mode).
2. In the dashboard, get your **Key ID** (and keep the **Key Secret on your server — never ship it**).
3. Put the Key ID in `js/config.js` → `razorpayKey`.
4. **Production security**: the current checkout calls Razorpay client-side, which works but lets users forge success callbacks. For a real product, create a tiny backend (`/create-order`, `/verify-payment`) that:
   - creates orders server-side with your Key Secret,
   - verifies the `razorpay_signature` (HMAC-SHA256 of `order_id|payment_id`) before granting items,
   - and handles webhooks for payment/refund events.
5. Test with Razorpay's test keys first, then flip to live.

### Ad revenue

Put your AdSense publisher ID in `js/config.js` → `adsenseClient` (and an ad slot ID). The reserved slots in the menu and shop will render AdSense units; the rewarded ad can be switched to an AdMob-style rewarded flow later.

## Deployment

The game is a pure static site — deploy anywhere:

**GitHub Pages**
```bash
gh auth login          # one-time
gh repo create hyderabad-fps --public --source=. --push
gh api repos/<you>/hyderabad-fps/pages -X POST -f "source[branch]=main" -f "source[path]=/"
```
`.nojekyll` is included so the vendor file ships untouched.

**Netlify / Vercel / Cloudflare Pages** — drag the folder in, or:
```bash
npx netlify deploy --prod --dir=.
npx vercel --prod
```

## Project layout

```
index.html          game shell + all UI overlays
css/style.css       Hyderabad-gold/green UI theme
js/main.js          boot, input, game loop, freeplay gate, effects, smoke test
js/world.js         procedural city: Charminar, lake, fort, roads, autos, NPCs
js/player.js        FPS controller, weapons, combat
js/missions.js      mission chain, enemy AI, cops, rampage
js/ui.js            HUD, radar, menus, avatar atelier
js/auth.js          device-local accounts + save/load
js/monetize.js      Razorpay checkout + AdSense slots (demo fallback)
js/config.js        ← your Razorpay / AdSense / Google keys go here
vendor/three.min.js Three.js r160 (MIT, vendored for offline)
```

## Roadmap

- Real Google OAuth + backend-verified Razorpay orders
- Driving (auto-rickshaw missions), day/night cycle, more of the old city (Chowmahalla, Falaknuma, Tank Bund)
- Multiplayer lobby + cloud saves + leaderboards
- Mobile controls & PWA install

## Credits

- [Three.js](https://threejs.org) (MIT) — 3D engine
- Google Fonts "Mukta" — UI typography
- All art, audio and code are procedurally generated in-project (no external assets)

---

*"Biryani khake jao!" — every NPC in Hyderabad, probably.*
