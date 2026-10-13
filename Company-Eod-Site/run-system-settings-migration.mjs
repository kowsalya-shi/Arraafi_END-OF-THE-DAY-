import pg from 'pg';
import fs from 'fs';

const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres:Shiny@08@localhost:5432/eod_db'
});

async function runMigration() {
  try {
    await client.connect();
    console.log('✅ Connected to database');

    const sql = fs.readFileSync('./migrations/create_system_settings.sql', 'utf8');
    
    await client.query(sql);
    console.log('✅ System settings table created successfully');
    
    // Verify the setting was inserted
    const result = await client.query(
      "SELECT * FROM system_settings WHERE setting_key = 'global_email_enabled'"
    );
    
    if (result.rows.length > 0) {
      console.log('✅ Global email setting initialized:', result.rows[0]);
    }
    
    console.log('\n🎉 Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  } finally {
    await client.end();
  }
}

runMigration();
