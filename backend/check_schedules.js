const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
});

db.serialize(() => {
  db.all('SELECT * FROM schedules', (err, rows) => {
    if (err) {
      console.error('Error querying schedules:', err.message);
    } else {
      console.log(JSON.stringify(rows, null, 2));
    }
  });
});

db.close();
