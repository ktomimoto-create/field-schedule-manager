const { createClient } = require('./frontend/node_modules/@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// .env.local から接続情報を取得
const envLocalPath = path.join(__dirname, 'frontend', '.env.local');
const envContent = fs.readFileSync(envLocalPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    envVars[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const supabaseUrl = envVars.VITE_SUPABASE_URL;
const supabaseAnonKey = envVars.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const originalStaff = [
  { "id": 1, "email": "hiramoto@example.com" },
  { "id": 2, "email": "tsukiji@example.com" },
  { "id": 3, "email": "fujii@example.com" },
  { "id": 4, "email": "kanzaki@example.com" },
  { "id": 5, "email": "hara@example.com" },
  { "id": 6, "email": "dobashi@example.com" },
  { "id": 7, "email": "fujita@example.com" },
  { "id": 8, "email": "sato@example.com" },
  { "id": 9, "email": "yoshinuma@example.com" },
  { "id": 10, "email": "koyama@example.com" },
  { "id": 11, "email": "takahashi@example.com" },
  { "id": 12, "email": "unezaki@example.com" },
  { "id": 13, "email": "foogy@example.com" },
  { "id": 14, "email": "matsushita@example.com" },
  { "id": 15, "email": "asanuma@example.com" },
  { "id": 16, "email": "yamauchi@example.com" },
  { "id": 17, "email": "nakagawa@example.com" },
  { "id": 18, "email": "abe@example.com" },
  { "id": 19, "email": "fujisaki@example.com" },
  { "id": 20, "email": "homma@example.com" },
  { "id": 21, "email": "maruyama@example.com" },
  { "id": 22, "email": "shimizu@example.com" },
  { "id": 23, "email": "hanawa@example.com" },
  { "id": 24, "email": "ibi@example.com" },
  { "id": 25, "email": "ishiyama@example.com" },
  { "id": 26, "email": "hirai@example.com" },
  { "id": 27, "email": "takeda@example.com" },
  { "id": 28, "email": "hamada@example.com" },
  { "id": 29, "email": "okazaki@example.com" },
  { "id": 30, "email": "tsuchiya@example.com" },
  { "id": 31, "email": "miyamoto@example.com" },
  { "id": 32, "email": "kanaya@example.com" }
];

async function restoreEmails() {
  console.log('Restoring original dummy emails for staff table...');
  let successCount = 0;
  let failCount = 0;

  for (const staff of originalStaff) {
    const { error } = await supabase
      .from('staff')
      .update({ email: staff.email })
      .eq('id', staff.id);

    if (error) {
      console.error(`Failed to restore staff ID ${staff.id}:`, error.message);
      failCount++;
    } else {
      successCount++;
    }
  }

  console.log(`Restore completed. Success: ${successCount}, Failed: ${failCount}`);
}

restoreEmails();
