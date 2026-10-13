import pg from 'pg';

const client = new pg.Client({
  connectionString: 'postgresql://postgres:Shiny@08@localhost:5432/eod_db'
});

async function getAllUsers() {
  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    const result = await client.query(`
      SELECT 
        id,
        name,
        email,
        role,
        status,
        team_id as "teamId"
      FROM users
      ORDER BY 
        CASE role
          WHEN 'ceo' THEN 1
          WHEN 'manager' THEN 2
          WHEN 'it_manager' THEN 3
          WHEN 'tl' THEN 4
          WHEN 'employee' THEN 5
        END,
        name
    `);

    console.log('👥 ALL USERS IN THE SYSTEM');
    console.log('='.repeat(120));
    console.log('');
    
    const groupedByRole = {
      ceo: [],
      manager: [],
      it_manager: [],
      tl: [],
      employee: []
    };

    result.rows.forEach(user => {
      groupedByRole[user.role].push(user);
    });

    // Display by role
    const roleLabels = {
      ceo: '👔 CEO',
      manager: '👨‍💼 Manager',
      it_manager: '💻 IT Manager',
      tl: '👥 Team Lead',
      employee: '👤 Employee'
    };

    Object.entries(roleLabels).forEach(([role, label]) => {
      const users = groupedByRole[role];
      if (users.length > 0) {
        console.log(`\n${label} (${users.length})`);
        console.log('-'.repeat(120));
        users.forEach(user => {
          console.log(`ID: ${user.id.toString().padEnd(3)} | Email: ${user.email.padEnd(40)} | Name: ${user.name.padEnd(30)} | Status: ${user.status || 'active'}`);
        });
      }
    });

    console.log('\n' + '='.repeat(120));
    console.log(`\n📊 TOTAL USERS: ${result.rows.length}`);
    console.log('\n🔐 DEFAULT PASSWORD FOR ALL USERS: password123');
    console.log('\n💡 LOGIN INSTRUCTIONS:');
    console.log('   1. Go to: http://localhost:3000 (or your frontend URL)');
    console.log('   2. Use email from above');
    console.log('   3. Password: password123');
    console.log('');

    // Create a quick reference table
    console.log('\n📋 QUICK LOGIN REFERENCE:');
    console.log('='.repeat(120));
    console.log('Role'.padEnd(15) + 'Email'.padEnd(45) + 'Password'.padEnd(20) + 'Name');
    console.log('-'.repeat(120));
    
    ['ceo', 'manager', 'it_manager', 'tl', 'employee'].forEach(role => {
      groupedByRole[role].forEach((user, idx) => {
        if (idx === 0 || role === 'employee' && idx < 3) { // Show first of each role, first 3 employees
          console.log(
            role.toUpperCase().padEnd(15) + 
            user.email.padEnd(45) + 
            'password123'.padEnd(20) + 
            user.name
          );
        }
      });
    });
    console.log('='.repeat(120));
    console.log('\n✅ All users have the same password: password123\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

getAllUsers();
