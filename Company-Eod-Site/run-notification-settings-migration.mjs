import pg from 'pg';
import { readFileSync } from 'fs';

const client = new pg.Client({
  connectionString: 'postgresql://postgres:Shiny@08@localhost:5432/eod_db'
});

async function runMigration() {
  try {
    await client.connect();
    console.log('✅ Connected to database');

    const sql = readFileSync('migrations/create_notification_settings.sql', 'utf8');
    
    console.log('📝 Running migration...');
    await client.query(sql);
    
    console.log('✅ Migration completed successfully!');
    
    // Verify the table was created
    const result = await client.query(`
      SELECT COUNT(*) as count FROM notification_settings
    `);
    
    console.log(`✅ notification_settings table has ${result.rows[0].count} rows`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
