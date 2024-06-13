const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const db = new sqlite3.Database('database.db');

app.use(express.static('public'));
app.use(bodyParser.json());

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT, email TEXT, mobile TEXT, password TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, userId TEXT, text TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS votes (option TEXT PRIMARY KEY, count INTEGER)");

    // Initialize the poll data if it doesn't exist
    db.run("INSERT OR IGNORE INTO votes (option, count) VALUES ('Climate_Change', 0), ('Rise_In_Temperature', 0), ('Sustainable_Development', 0)");
});

let users = {};

app.post('/register', async (req, res) => {
    const { username, email, mobile, password } = req.body;

    if (!username || !email || !mobile || !password) {
        return res.status(400).send('Please fill in all fields');
    }

    db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
        if (user) {
            return res.status(400).send('Username already taken');
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = uuidv4();

        db.run("INSERT INTO users (id, username, email, mobile, password) VALUES (?, ?, ?, ?, ?)", [userId, username, email, mobile, hashedPassword], function(err) {
            if (err) return res.status(500).send('Error registering user');
            res.status(200).send({ userId, username });
        });
    });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;

    db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
        if (err) return res.status(500).send('Error logging in');
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).send('Invalid username or password');
        }

        res.status(200).send({ userId: user.id, username: user.username });
    });
});

io.on('connection', (socket) => {
    console.log('a user connected');

    // Send the initial poll data
    db.all("SELECT * FROM votes", [], (err, rows) => {
        if (err) throw err;
        const pollData = {};
        rows.forEach(row => {
            pollData[row.option] = row.count;
        });
        socket.emit('updatePoll', pollData);
    });
    
    db.all("SELECT messages.id, users.username, messages.text FROM messages JOIN users ON messages.userId = users.id", [], (err, rows) => {
        if (err) throw err;
        socket.emit('chatHistory', rows);
    });

    socket.on('login', (userId) => {
        db.get("SELECT * FROM users WHERE id = ?", [userId], (err, user) => {
            if (err) throw err;
            if (user) {
                users[socket.id] = { userId: user.id, username: user.username };
                socket.emit('loginSuccess', user.username);
            }
        });
    });

    socket.on('vote', (option) => {
        db.get("SELECT count FROM votes WHERE option = ?", [option], (err, row) => {
            if (row) {
                const newCount = row.count + 1;
                db.run("UPDATE votes SET count = ? WHERE option = ?", [newCount, option], (err) => {
                    if (err) throw err;
                    db.all("SELECT * FROM votes", [], (err, rows) => {
                        if (err) throw err;
                        const updatedPollData = {};
                        rows.forEach(row => {
                            updatedPollData[row.option] = row.count;
                        });
                        io.emit('updatePoll', updatedPollData);
                    });
                });
            }
        });
    });

    socket.on('chatMessage', (msg) => {
        const user = users[socket.id];
        if (user) {
            db.run("INSERT INTO messages (userId, text) VALUES (?, ?)", [user.userId, msg], function(err) {
                if (err) throw err;
                const message = { id: this.lastID, user: user.username, text: msg };
                io.emit('newChatMessage', message);
            });
        }
    });

    socket.on('editChatMessage', (data) => {
        const user = users[socket.id];
        if (user) {
            db.run("UPDATE messages SET text = ? WHERE id = ? AND userId = ?", [data.text, data.id, user.userId], function(err) {
                if (err) throw err;
                if (this.changes > 0) {
                    io.emit('editChatMessage', data);
                }
            });
        }
    });

    socket.on('deleteChatMessage', (id) => {
        const user = users[socket.id];
        if (user) {
            db.run("DELETE FROM messages WHERE id = ? AND userId = ?", [id, user.userId], function(err) {
                if (err) throw err;
                if (this.changes > 0) {
                    io.emit('deleteChatMessage', id);
                }
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('user disconnected');
        delete users[socket.id];
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

