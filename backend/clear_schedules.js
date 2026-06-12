const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
  console.log('Connected to database at:', dbPath);
});

db.serialize(() => {
  db.run('DELETE FROM schedules', function(err) {
    if (err) {
      console.error('Error clearing schedules:', err.message);
    } else {
      console.log(`Successfully cleared schedules table. Rows affected: ${this.changes}`);
    }
  });
  db.run('DELETE FROM audit_logs', function(err) {
    if (err) {
      console.error('Error clearing audit_logs:', err.message);
    } else {
      console.log(`Successfully cleared audit_logs table. Rows affected: ${this.changes}`);
    }
  });
});

db.close((err) => {
  if (err) {
    console.error('Error closing database:', err.message);
  } else {
    console.log('Database connection closed.');
  }
});
