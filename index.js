const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const uuid = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const db = new sqlite3.Database(':memory:');

app.use(bodyParser.json());
app.use(express.static(__dirname + '/public'));

db.serialize(() => {
    db.run("CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, email TEXT, mobile TEXT, password TEXT)");
    db.run("CREATE TABLE votes (option TEXT PRIMARY KEY, count INTEGER)");
    db.run("CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, userId TEXT, text TEXT)");
    db.run("INSERT INTO votes (option, count) VALUES ('Climate_Change', 0), ('Rise_In_Temperature', 0), ('Sustainable_Development', 0)");
});

app.post('/register', async (req, res) => {
    const { username, email, mobile, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const id = uuid.v4();

    db.run("INSERT INTO users (id, username, email, mobile, password) VALUES (?, ?, ?, ?, ?)", [id, username, email, mobile, hashedPassword], (err) => {
        if (err) return res.status(500).send('Error registering');
        res.status(201).send({ userId: id, username });
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
        const userId = users[socket.id].userId;
        db.run("INSERT INTO messages (userId, text) VALUES (?, ?)", [userId, msg], function (err) {
            if (err) throw err;
            const message = { id: this.lastID, user: users[socket.id].username, text: msg };
            io.emit('newChatMessage', message);
        });
    });

    socket.on('editChatMessage', ({ id, text }) => {
        db.run("UPDATE messages SET text = ? WHERE id = ?", [text, id], (err) => {
            if (err) throw err;
            io.emit('editChatMessage', { id, text });
        });
    });

    socket.on('deleteChatMessage', (id) => {
        db.run("DELETE FROM messages WHERE id = ?", [id], (err) => {
            if (err) throw err;
            io.emit('deleteChatMessage', id);
        });
    });

    socket.on('disconnect', () => {
        console.log('user disconnected');
        delete users[socket.id];
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
