
require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");

if (!process.env.SUPABASE_URL ||
    !process.env.SUPABASE_SECRET_KEY) {
  throw new Error("Faltan las credenciales de Supabase");
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

module.exports = supabase;
