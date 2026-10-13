import pg from 'pg';
import { createHash } from 'crypto';

const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres:Shiny@08@localhost:5432/eod_db'
});

function hashPassword(password) {
  return createHash("sha256").update(password + "eod-salt-2024").digest("hex");
}

async function resetPasswords() {
  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Hash the new passwords
    const ceoPassword = hashPassword('ceo123');
    const managerPassword = hashPassword('manager123');

    // Update CEO password
    const ceoResult = await client.query(
      `UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id, email, name, role`,
      [ceoPassword, 'thaseenakhanum@arraafiinfotech.com']
    );

    // Update Manager password
    const managerResult = await client.query(
      `UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id, email, name, role`,
      [managerPassword, 'aap@arraafiinfotech.com']
    );

    console.log('\n🔐 PASSWORDS RESET SUCCESSFULLY');
    console.log('========================================================');
    
    if (ceoResult.rows.length > 0) {
      const ceo = ceoResult.rows[0];
      console.log(`✅ CEO Updated:`);
      console.log(`   Name: ${ceo.name}`);
      console.log(`   Email: ${ceo.email}`);
      console.log(`   Password: ceo123`);
    }
    
    if (managerResult.rows.length > 0) {
      const manager = managerResult.rows[0];
      console.log(`\n✅ Manager Updated:`);
      console.log(`   Name: ${manager.name}`);
      console.log(`   Email: ${manager.email}`);
      console.log(`   Password: manager123`);
    }
    
    console.log('\n========================================================');
    console.log('💡 You can now login with:');
    console.log('   CEO: thaseenakhanum@arraafiinfotech.com / ceo123');
    console.log('   Manager: aap@arraafiinfotech.com / manager123');
    console.log('========================================================\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

resetPasswords();
