const express = require('express');
const mysql = require('mysql2');
const path = require('path');

const app = express();

app.use(express.json());

// MySQL configuration: Railway provides these MYSQL* environment variables.
const db = mysql.createPool({
  host: process.env.MYSQLHOST,
  port: Number(process.env.MYSQLPORT || 3306),
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test database connection
db.query('SELECT 1', (err) => {
  if (err) {
    console.error('❌ MySQL connection error:', err.message);
  } else {
    console.log('✅ MySQL connected successfully!');
  }
});

// Health check
app.get('/api/health', (req, res) => {
  db.query('SELECT 1', (err) => {
    if (err) {
      return res.status(500).json({
        ok: false,
        database: 'disconnected',
        error: err.message
      });
    }
    res.json({ ok: true, database: 'connected' });
  });
});

// CREATE PLAYER
app.post('/api/players', (req, res) => {
  const { name, token, color, money } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Player name is required.' });
  }

  const playerName = String(name).trim();
  const playerToken = token || 'V';
  const playerColor = color || '#FF6B00';
  const startingMoney = money ?? 1500;

  const sql = `
    INSERT INTO players
      (name, token, color, money, net_worth, position, in_jail, jail_turns)
    VALUES (?, ?, ?, ?, ?, 0, 0, 0)
  `;

  db.query(
    sql,
    [playerName, playerToken, playerColor, startingMoney, startingMoney],
    (err, result) => {
      if (err) {
        console.error('❌ Player Insert Error:', err.message);

        // Fallback for schemas without the optional game-state columns.
        const fallbackSql = `
          INSERT INTO players (name, token, color, money, net_worth)
          VALUES (?, ?, ?, ?, ?)
        `;

        db.query(
          fallbackSql,
          [playerName, playerToken, playerColor, startingMoney, startingMoney],
          (fallbackErr, fallbackResult) => {
            if (fallbackErr) {
              return res.status(500).json({
                error: fallbackErr.message,
                original: err.message
              });
            }

            res.json({
              player_id: fallbackResult.insertId,
              message: 'Player inserted'
            });
          }
        );
        return;
      }

      res.json({
        player_id: result.insertId,
        message: 'Player inserted'
      });
    }
  );
});

// READ PLAYERS
app.get('/api/players', (req, res) => {
  db.query('SELECT * FROM players ORDER BY player_id ASC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// UPDATE PLAYER MONEY / NET WORTH
app.put('/api/players/:id', (req, res) => {
  const { money, net_worth } = req.body;

  db.query(
    'UPDATE players SET money=?, net_worth=? WHERE player_id=?',
    [money, net_worth, req.params.id],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(result);
    }
  );
});

// DELETE PLAYER
app.delete('/api/players/:id', (req, res) => {
  db.query(
    'DELETE FROM players WHERE player_id=?',
    [req.params.id],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(result);
    }
  );
});

// CREATE TRANSACTION
app.post('/api/transactions', (req, res) => {
  const {
    game_id,
    from_player,
    to_player,
    amount,
    type,
    property_id,
    description
  } = req.body;

  const safeGameId = game_id ?? 1;
  const safeFrom = from_player ?? null;
  const safeTo = to_player ?? null;
  const safeAmount = amount ?? 0;
  const safeType = type || 'BUY';
  const safePropertyId = property_id ?? null;
  const safeDescription = description || `${safeType} transaction`;

  db.query(
    `INSERT INTO transactions
      (game_id, from_player, to_player, amount, type, property_id, description)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      safeGameId,
      safeFrom,
      safeTo,
      safeAmount,
      safeType,
      safePropertyId,
      safeDescription
    ],
    (err, result) => {
      if (err) {
        console.error('❌ Transaction Insert Error:', err.message);
        return res.status(500).json({ error: err.message });
      }
      res.json(result);
    }
  );
});

// READ RECENT TRANSACTIONS
app.get('/api/transactions', (req, res) => {
  db.query(
    'SELECT * FROM transactions ORDER BY timestamp DESC LIMIT 50',
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// READ PROPERTIES
app.get('/api/properties', (req, res) => {
  db.query(
    'SELECT * FROM properties ORDER BY property_id ASC',
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// UPDATE PROPERTY
app.put('/api/properties/:id', (req, res) => {
  const { owner_id, houses, mortgaged } = req.body;

  db.query(
    `UPDATE properties
     SET owner_id=?, houses=?, mortgaged=?
     WHERE property_id=?`,
    [
      owner_id ?? null,
      houses ?? 0,
      mortgaged ?? 0,
      req.params.id
    ],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(result);
    }
  );
});

// CREATE GAME
app.post('/api/games', (req, res) => {
  db.query(
    'INSERT INTO games (status) VALUES (?)',
    ['ACTIVE'],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ game_id: result.insertId });
    }
  );
});

// Serve frontend from the same Express server
const frontendPath = path.join(__dirname, '../frontend');

app.use(express.static(frontendPath));

app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, '../frontend/index.html'));
});

// Railway provides PORT; 3000 is used locally.
const PORT = Number(process.env.PORT || 3000);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Property Empire server running on port ${PORT}`);
});
