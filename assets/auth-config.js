// Unified Finder Hub — Login/Auth config
// Multi-user Free-plan auth: email/password, allowlist signup, device lock via Edge Function.
window.UFH_AUTH_CONFIG = Object.assign({
  appName: "Unified Finder Hub",
  ownerUsername: "khater",
  ownerEmails: ["akhater@acuative.com"],
  companyDomain: "acuative.com",
  allowSelfSignup: true,
  apiBaseUrl: "https://whocxxcqnjhvqmsldbkz.supabase.co/functions/v1/api",
  supabaseUrl: "https://whocxxcqnjhvqmsldbkz.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indob2N4eGNxbmpodnFtc2xkYmt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxNDU0NjMsImV4cCI6MjA4NDcyMTQ2M30.1WQtuJvmqdUFOWz6ANMTAaGgrkJGcvF02yi8Z0R7pk0"
}, window.UFH_AUTH_CONFIG || {});
