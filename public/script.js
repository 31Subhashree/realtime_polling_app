const socket = io();

async function register() {
    const username = document.getElementById('registerUsername').value;
    const email = document.getElementById('registerEmail').value;
    const mobile = document.getElementById('registerMobile').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (!username || !email || !mobile || !password) {
        alert('Please fill in all fields');
        return;
    }

    if (password !== confirmPassword) {
        alert('Passwords do not match');
        return;
    }

    const response = await fetch('/register', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, email, mobile, password })
    });

    if (response.ok) {
        const data = await response.json();
        localStorage.setItem('userId', data.userId);
        loginSuccess(data.username);
    } else {
        alert('Registration failed');
    }
}

function showLogin() {
    document.querySelector('.register-container').style.display = 'none';
    document.querySelector('.login-container').style.display = 'block';
}

async function login() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    const response = await fetch('/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
    });

    if (response.ok) {
        const data = await response.json();
        localStorage.setItem('userId', data.userId);
        loginSuccess(data.username);
    } else {
        alert('Login failed');
    }
}

function loginSuccess(username) {
    document.querySelector('.register-container').style.display = 'none';
    document.querySelector('.login-container').style.display = 'none';
    document.querySelector('.poll-container').style.display = 'block';
    document.querySelector('.chat-container').style.display = 'block';
    socket.emit('login', localStorage.getItem('userId'));
}

function vote(option) {
    const userId = localStorage.getItem('userId');
    if (userId) {
        socket.emit('vote', { userId, option });
    } else {
        alert('You must be logged in to vote.');
    }
}

socket.on('updatePoll', (pollData) => {
    Object.keys(pollData).forEach(option => {
        document.getElementById(`${option}Count`).textContent = pollData[option];
    });
});

socket.on('chatHistory', (messages) => {
    const messagesDiv = document.getElementById('messages');
    messages.forEach(msg => {
        addMessageElement(msg);
    });
});

socket.on('newChatMessage', (msg) => {
    addMessageElement(msg);
});

function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value;
    if (message) {
        socket.emit('chatMessage', message);
        input.value = '';
    }
}

function showTypingIndicator() {
    socket.emit('typing');
}

socket.on('typing', (username) => {
    const typingIndicator = document.getElementById('typingIndicator');
    typingIndicator.textContent = `${username} is typing...`;
    typingIndicator.style.display = 'block';
    setTimeout(() => {
        typingIndicator.style.display = 'none';
    }, 1000);
});

function addMessageElement(msg) {
    const messagesDiv = document.getElementById('messages');
    const messageElement = document.createElement('div');
    messageElement.innerHTML = `
        <p>
            <strong>${msg.user}:</strong> 
            <span id="message-text-${msg.id}">${msg.text}</span>
            <button onclick="editMessage(${msg.id})">Edit</button>
            <button onclick="deleteMessage(${msg.id})">Delete</button>
        </p>
    `;
    messageElement.id = `message-${msg.id}`;
    messagesDiv.appendChild(messageElement);
}

function editMessage(id) {
    const newText = prompt('Edit your message:');
    if (newText) {
        socket.emit('editChatMessage', { id, text: newText });
    }
}

socket.on('editChatMessage', (data) => {
    const messageTextElement = document.getElementById(`message-text-${data.id}`);
    if (messageTextElement) {
        messageTextElement.textContent = data.text;
    }
});

function deleteMessage(id) {
    socket.emit('deleteChatMessage', id);
}

socket.on('deleteChatMessage', (id) => {
    const messageElement = document.getElementById(`message-${id}`);
    if (messageElement) {
        messageElement.remove();
    }
});

function logout() {
    localStorage.removeItem('userId');
    location.reload();
}
