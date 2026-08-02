// Deployment configuration — edit these before going live (see README).
// To use real payments and ads, add your own keys. Until then the game runs
// in DEMO mode where purchases are simulated so you can test the full flow.
window.HYD_CONFIG = {
  // Razorpay test/live Key ID, e.g. "rzp_test_xxxxxxxxxxxx". Keep your Key
  // Secret on the server — never ship it. Checkout calls the Razorpay API
  // client-side; for production verify payment signatures server-side.
  razorpayKey: "",

  // Google AdSense publisher ID, e.g. "ca-pub-XXXXXXXXXXXXXXXX".
  adsenseClient: "",
  adsenseSlot: "",

  // Optional Google OAuth client ID for real "Continue with Google".
  // See README for the full integration notes.
  googleClientId: ""
};
