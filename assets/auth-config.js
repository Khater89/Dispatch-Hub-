// Unified Finder Hub — Login/Auth config
// Replace ONLY the anon key below, then deploy.
// The allowed email list keeps the app owner-only even if other Auth users exist.
window.UFH_AUTH_CONFIG = Object.assign({
  appName: "Unified Finder Hub",
  ownerUsername: "khater",
  allowedEmails: ["akhater@acuative.com"],
  supabaseUrl: "https://whocxxcqnjhvqmsldbkz.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indob2N4eGNxbmpodnFtc2xkYmt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxNDU0NjMsImV4cCI6MjA4NDcyMTQ2M30.1WQtuJvmqdUFOWz6ANMTAaGgrkJGcvF02yi8Z0R7pk0"
}, window.UFH_AUTH_CONFIG || {});
