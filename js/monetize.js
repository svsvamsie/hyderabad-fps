// HYD.Monetize — Razorpay checkout + rewarded ads. Demo fallback when no key is configured.
(function () {
  const HYD = window.HYD = window.HYD || {};

  const MON = {
    config: window.HYD_CONFIG || {},
    key: "",
    demo: true,

    init() {
      this.key = this.config.razorpayKey || "";
      this.demo = !this.key;
      if (this.config.adsenseClient) this.loadAdSense();
    },

    plans() {
      return {
        elite: { name: "Elite Pass", amount: 199, grant: () => HYD.Game.grantElite() },
        coins500: { name: "500 Chai-Coins", amount: 49, grant: () => HYD.Player.coins += 500 },
        coins1200: { name: "1,200 Chai-Coins", amount: 99, grant: () => HYD.Player.coins += 1200 },
        coins3000: { name: "3,000 Chai-Coins", amount: 199, grant: () => HYD.Player.coins += 3000 },
        watchad: { name: "Rewarded Ad (₹250)", amount: 0, grant: () => HYD.Player.money += 250 }
      };
    },

    async buy(planId) {
      const plan = this.plans()[planId];
      if (!plan) return;
      HYD.Audio.ui();
      if (planId === "watchad") {
        const ok = await HYD.UI.prompt("Rewarded Ad", "Watch a 15s ad to earn ₹250 in-game cash. (Demo: instant credit)");
        if (!ok) return;
        plan.grant();
        HYD.Game.saveProgress();
        HYD.UI.toast("+₹250 from the ad!", "good");
        HYD.UI.refreshShop();
        return;
      }
      if (this.demo) {
        const ok = await HYD.UI.prompt("DEMO PURCHASE", plan.name + " — ₹" + plan.amount + ".\n\nPayments are not wired yet: this will grant the item for free so you can test the flow. Connect Razorpay in js/config.js to charge real money (see README).");
        if (!ok) return;
        setTimeout(() => {
          plan.grant();
          HYD.Game.saveProgress();
          HYD.UI.toast(plan.name + " unlocked (demo)", "good");
          HYD.UI.refreshShop();
        }, 700);
        return;
      }
      await this.razorpayCheckout(plan);
    },

    razorpayCheckout(plan) {
      return new Promise((resolve) => {
        const load = () => {
          if (window.Razorpay) return start();
          const s = document.createElement("script");
          s.src = "https://checkout.razorpay.com/v1/checkout.js";
          s.onload = start;
          s.onerror = () => { HYD.UI.toast("Could not load Razorpay. Try again.", "bad"); resolve(); };
          document.head.appendChild(s);
        };
        const start = () => {
          const options = {
            key: this.key,
            amount: plan.amount * 100,
            currency: "INR",
            name: "Hyderabad: Streets of the Nizam",
            description: plan.name,
            image: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgdmlld0JveD0iMCAwIDY0IDY0Ij48cmVjdCB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHJ4PSIxMiIgZmlsbD0iIzBjM2QyZSIvPjx0ZXh0IHg9IjMyIiB5PSI0MiIgZm9udC1zaXplPSIzMiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iI2YwYjQyOSI+wqc8L3RleHQ+PC9zdmc+",
            handler: (res) => {
              HYD.UI.toast("Payment success: " + res.razorpay_payment_id + " (verify server-side!)", "good");
              plan.grant();
              HYD.Game.saveProgress();
              HYD.UI.refreshShop();
              resolve();
            },
            modal: { ondismiss: () => resolve() },
            theme: { color: "#0b3d2e" },
            prefill: { email: HYD.Auth.currentEmail() || "" }
          };
          const rzp = new window.Razorpay(options);
          rzp.open();
        };
        load();
      });
    },

    loadAdSense() {
      if (!this.config.adsenseClient) return;
      const s = document.createElement("script");
      s.async = true;
      s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + this.config.adsenseClient;
      s.crossOrigin = "anonymous";
      document.head.appendChild(s);
      document.querySelectorAll(".ad-slot").forEach(slot => {
        slot.innerHTML = '<ins class="adsbygoogle" style="display:block" data-ad-client="' + this.config.adsenseClient + '" data-ad-slot="' + (this.config.adsenseSlot || "0000000000") + '" data-ad-format="auto"></ins>';
      });
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
    }
  };

  HYD.Monetize = MON;
})();
