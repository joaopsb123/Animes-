// =============================================
// CORD - REDE SOCIAL COMPLETA
// JavaScript Principal
// =============================================

// ============ INICIALIZAÇÃO DO FIREBASE ============
const firebaseConfig = {
    apiKey: "AIzaSyCnRAOY08ABtG87T2ioDM4lzYgDB6q3rBw",
    authDomain: "cord-c6f05.firebaseapp.com",
    projectId: "cord-c6f05",
    storageBucket: "cord-c6f05.firebasestorage.app",
    messagingSenderId: "777848965663",
    appId: "1:777848965663:web:03c1631fc8899f773c632a"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Ativar persistência offline
db.enablePersistence().catch((err) => {
    console.warn('Persistência offline não disponível:', err.code);
});

// ============ VARIÁVEIS GLOBAIS ============
let currentUser = null;
let currentServer = null;
let currentChannel = null;
let unsubMessages = null;
let currentView = 'chat';
let activeDM = null;

// =============================================
// AUTENTICAÇÃO
// =============================================

function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('form-login').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('form-register').style.display = tab === 'register' ? 'block' : 'none';
    document.getElementById('tab-' + tab).classList.add('active');
    document.getElementById('login-error').style.display = 'none';
    document.getElementById('reg-error').style.display = 'none';
}

async function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errorElement = document.getElementById('login-error');
    errorElement.style.display = 'none';
    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        errorElement.textContent = translateAuthError(error.code);
        errorElement.style.display = 'block';
    }
}

async function handleRegister(event) {
    event.preventDefault();
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const errorElement = document.getElementById('reg-error');
    errorElement.style.display = 'none';
    if (username.length < 3) {
        errorElement.textContent = 'O nome deve ter pelo menos 3 caracteres.';
        errorElement.style.display = 'block';
        return;
    }
    if (password.length < 6) {
        errorElement.textContent = 'A senha deve ter pelo menos 6 caracteres.';
        errorElement.style.display = 'block';
        return;
    }
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        await user.updateProfile({ displayName: username });
        await db.collection('users').doc(user.uid).set({
            username: username,
            email: email,
            balance: 100,
            lastDaily: null,
            bio: '',
            inventory: [],
            friends: [],
            friendCode: generateFriendCode(),
            nitro: false,
            nitroExpiry: null,
            badges: [],
            roles: [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        errorElement.textContent = translateAuthError(error.code);
        errorElement.style.display = 'block';
    }
}

async function loginWithGoogle() {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        const result = await auth.signInWithPopup(provider);
        const user = result.user;
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (!userDoc.exists) {
            await db.collection('users').doc(user.uid).set({
                username: user.displayName || 'Usuário Google',
                email: user.email,
                balance: 100,
                lastDaily: null,
                bio: '',
                inventory: [],
                friends: [],
                friendCode: generateFriendCode(),
                nitro: false,
                nitroExpiry: null,
                badges: [],
                roles: [],
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
                photoURL: user.photoURL || ''
            });
        } else {
            await db.collection('users').doc(user.uid).update({
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    } catch (error) {
        console.error('Erro no login Google:', error);
        showToast('Erro ao entrar com Google. Tenta novamente.', true);
    }
}

function logout() {
    if (unsubMessages) {
        unsubMessages();
        unsubMessages = null;
    }
    currentServer = null;
    currentChannel = null;
    activeDM = null;
    auth.signOut();
}

function translateAuthError(code) {
    const errorMap = {
        'auth/user-not-found': 'Email não encontrado. Verifica o email ou cria uma conta.',
        'auth/wrong-password': 'Senha incorreta. Tenta novamente.',
        'auth/email-already-in-use': 'Este email já está registado. Tenta fazer login.',
        'auth/invalid-email': 'Email inválido. Verifica o formato.',
        'auth/weak-password': 'Senha muito fraca. Usa pelo menos 6 caracteres.',
        'auth/too-many-requests': 'Muitas tentativas. Aguarda um pouco e tenta novamente.',
        'auth/network-request-failed': 'Erro de rede. Verifica a tua ligação à internet.',
        'auth/popup-closed-by-user': 'Login cancelado. Tenta novamente.',
        'auth/operation-not-allowed': 'Este método de login não está disponível.',
        'auth/requires-recent-login': 'Por segurança, faz login novamente.',
        'auth/user-disabled': 'Esta conta foi desativada.',
        'auth/account-exists-with-different-credential': 'Já existe uma conta com este email usando outro método de login.'
    };
    return errorMap[code] || 'Erro desconhecido. Tenta novamente mais tarde.';
}

function generateFriendCode() {
    return Math.floor(1000 + Math.random() * 9000);
}

// =============================================
// OBSERVADOR DE AUTENTICAÇÃO
// =============================================

auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-container').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
        updateUserInterface(user);
        loadServers();
        loadAllPanels();
        try {
            await db.collection('users').doc(user.uid).update({
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (err) {}
    } else {
        currentUser = null;
        document.getElementById('auth-container').style.display = 'flex';
        document.getElementById('app-container').style.display = 'none';
        if (unsubMessages) {
            unsubMessages();
            unsubMessages = null;
        }
        currentServer = null;
        currentChannel = null;
        activeDM = null;
    }
});

function updateUserInterface(user) {
    const displayName = user.displayName || user.email.split('@')[0];
    const initial = displayName[0].toUpperCase();
    const avatarColor = stringToColor(displayName);
    ['avatar-top', 'avatar-footer'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = initial;
            el.style.background = avatarColor;
        }
    });
    document.getElementById('username-footer').textContent = displayName;
    document.getElementById('topbar-title').textContent = displayName;
}

// =============================================
// NAVEGAÇÃO DE VIEWS
// =============================================

function switchView(view) {
    currentView = view;
    const viewIds = ['chat-view', 'friends-view', 'dashboard-view', 'nitro-view', 'members-view', 'settings-view'];
    viewIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    const selectedView = document.getElementById(view + '-view');
    if (selectedView) {
        selectedView.style.display = view === 'chat' ? 'flex' : 'block';
    }
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const navButtons = document.querySelectorAll('.nav-btn');
    const viewIndex = { chat: 0, friends: 1, dashboard: 2, nitro: 3, members: 4, settings: 5 };
    if (navButtons[viewIndex[view]]) navButtons[viewIndex[view]].classList.add('active');
    switch (view) {
        case 'friends': loadFriendsPanel(); break;
        case 'dashboard': loadBotsPanel(); break;
        case 'nitro': loadNitroPanel(); break;
        case 'members': loadMembersPanel(); break;
        case 'settings': loadSettingsPanel(); break;
    }
    if (window.innerWidth <= 768) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar.classList.contains('open')) toggleSidebar();
    }
}

function loadAllPanels() {
    loadFriendsPanel();
    loadBotsPanel();
    loadNitroPanel();
    loadMembersPanel();
    loadSettingsPanel();
}

// =============================================
// SERVIDORES E CANAIS
// =============================================

function loadServers() {
    if (!currentUser) return;
    db.collection('servers')
        .where('members', 'array-contains', currentUser.uid)
        .onSnapshot((snapshot) => {
            const serverList = document.getElementById('server-list');
            serverList.innerHTML = '';
            if (snapshot.empty) {
                serverList.innerHTML = '<p style="color:var(--text-muted);font-size:11px;padding:8px;text-align:center;">Nenhum servidor ainda</p>';
                return;
            }
            snapshot.forEach((doc) => {
                const server = doc.data();
                const serverElement = document.createElement('div');
                serverElement.className = 'server-item';
                serverElement.innerHTML = `<span class="server-dot"></span><span>${escapeHtml(server.name)}</span>`;
                serverElement.onclick = () => selectServer(doc.id, server.name);
                if (currentServer === doc.id) serverElement.classList.add('active');
                serverList.appendChild(serverElement);
            });
        });
}

function selectServer(serverId, serverName) {
    currentServer = serverId;
    currentChannel = null;
    activeDM = null;
    document.getElementById('channel-list').innerHTML = '';
    document.getElementById('chat-box').innerHTML = `<div class="empty-state"><span class="icon">💬</span><span class="empty-title">${escapeHtml(serverName)}</span><span class="empty-desc">Seleciona um canal para começar</span></div>`;
    document.getElementById('current-channel-name').textContent = 'Seleciona um canal';
    if (unsubMessages) { unsubMessages(); unsubMessages = null; }
    loadChannels(serverId);
    switchView('chat');
    if (window.innerWidth <= 768) toggleSidebar();
}

function loadChannels(serverId) {
    db.collection('servers').doc(serverId).collection('channels').orderBy('createdAt')
        .onSnapshot((snapshot) => {
            const channelList = document.getElementById('channel-list');
            channelList.innerHTML = '';
            snapshot.forEach((doc) => {
                const channel = doc.data();
                const channelElement = document.createElement('div');
                channelElement.className = 'channel-item';
                channelElement.innerHTML = `<span class="hash-icon">#</span><span>${escapeHtml(channel.name)}</span>`;
                channelElement.onclick = () => selectChannel(serverId, doc.id, channel.name);
                if (currentChannel === doc.id) channelElement.classList.add('active');
                channelList.appendChild(channelElement);
            });
        });
}

function selectChannel(serverId, channelId, channelName) {
    currentChannel = channelId;
    activeDM = null;
    document.getElementById('current-channel-name').textContent = channelName;
    if (unsubMessages) unsubMessages();
    unsubMessages = db.collection('servers').doc(serverId).collection('channels').doc(channelId)
        .collection('messages').orderBy('timestamp', 'asc')
        .onSnapshot((snapshot) => {
            const chatBox = document.getElementById('chat-box');
            chatBox.innerHTML = '';
            if (snapshot.empty) {
                chatBox.innerHTML = '<div class="empty-state"><span class="icon">📭</span><span class="empty-title">Sem mensagens</span><span class="empty-desc">Sê o primeiro a escrever neste canal!</span></div>';
                return;
            }
            snapshot.forEach((doc) => renderMessage(doc.data(), doc.id));
            chatBox.scrollTop = chatBox.scrollHeight;
        });
    if (window.innerWidth <= 768) toggleSidebar();
}

// =============================================
// MENSAGENS
// =============================================

function renderMessage(msg, msgId) {
    const chatBox = document.getElementById('chat-box');
    const emptyState = chatBox.querySelector('.empty-state');
    if (emptyState) chatBox.innerHTML = '';
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    const avatarColor = msg.isBot ? '#6366f1' : (msg.isSystem ? '#52525b' : stringToColor(msg.autor));
    const avatarLetter = (msg.autor || '?')[0].toUpperCase();
    const nitroNameClass = msg.hasNitro ? ' nitro-name' : '';
    const nitroFrameClass = msg.hasNitro ? ' nitro-glow' : '';
    let badgesHtml = '';
    if (msg.isBot) badgesHtml += '<span class="badge-tag bot">BOT</span>';
    if (msg.isSystem) badgesHtml += '<span class="badge-tag system">SYS</span>';
    if (msg.badges && msg.badges.includes('nitro')) badgesHtml += '<span class="badge-tag nitro">NITRO</span>';
    if (msg.badges && msg.badges.includes('vip')) badgesHtml += '<span class="badge-tag vip">VIP</span>';
    if (msg.badges && msg.badges.includes('og')) badgesHtml += '<span class="badge-tag og">OG</span>';
    if (msg.badges && msg.badges.includes('botmaster')) badgesHtml += '<span class="badge-tag botmaster">BOT MASTER</span>';
    let timeStr = '';
    if (msg.timestamp) {
        timeStr = msg.timestamp.toDate().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
    }
    const reactions = msg.reactions || {};
    let reactionsHtml = '';
    Object.entries(reactions).forEach(([emoji, users]) => {
        const isActive = Array.isArray(users) && users.includes(currentUser?.uid);
        const count = Array.isArray(users) ? users.length : 0;
        reactionsHtml += `<span class="reaction-badge ${isActive ? 'active' : ''}" onclick="toggleReaction('${msgId}', '${emoji}')">${emoji} ${count}</span>`;
    });
    if (reactionsHtml) reactionsHtml = `<div class="reactions-row">${reactionsHtml}</div>`;
    messageDiv.innerHTML = `
        <div class="message-avatar" style="background: ${avatarColor};">
            <div class="avatar-frame ${nitroFrameClass}"></div>${avatarLetter}
        </div>
        <div class="message-content">
            <div class="message-header">
                <span class="message-username ${nitroNameClass}">${escapeHtml(msg.autor)}</span>${badgesHtml}
                <span class="message-time">${timeStr}</span>
            </div>
            <div class="message-text">${formatMessageText(escapeHtml(msg.texto))}</div>${reactionsHtml}
        </div>`;
    chatBox.appendChild(messageDiv);
}

async function sendMsg() {
    const input = document.getElementById('msg-input');
    const texto = input.value.trim();
    if (!texto || !currentUser) return;
    if (activeDM) {
        await sendDirectMessage(activeDM, texto);
    } else if (currentServer && currentChannel) {
        await sendChannelMessage(texto);
    } else {
        showToast('Seleciona um canal ou conversa privada primeiro!', true);
        return;
    }
    input.value = '';
    input.style.height = 'auto';
}

async function sendChannelMessage(texto) {
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const userData = userDoc.data() || {};
        const messageData = {
            autor: currentUser.displayName || currentUser.email.split('@')[0],
            texto: texto,
            userId: currentUser.uid,
            isBot: false,
            isSystem: false,
            hasNitro: userData.nitro || false,
            badges: userData.badges || [],
            reactions: {},
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        await db.collection('servers').doc(currentServer).collection('channels').doc(currentChannel)
            .collection('messages').add(messageData);
        handleCommands(texto);
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        showToast('Erro ao enviar mensagem. Tenta novamente.', true);
    }
}

function handleCommands(texto) {
    const lower = texto.toLowerCase().trim();
    const commands = {
        '!ping': () => sendSystemMessage('🏓 Pong! Latência: ' + Math.floor(Math.random() * 100) + 'ms'),
        '!hora': () => sendSystemMessage('🕐 Hora atual: ' + new Date().toLocaleString('pt-PT')),
        '!dado': () => sendSystemMessage('🎲 O dado caiu em: **' + (Math.floor(Math.random() * 6) + 1) + '**'),
        '!moeda': () => sendSystemMessage('🪙 Resultado: **' + (Math.random() > 0.5 ? 'Cara' : 'Coroa') + '**'),
        '!coins': async () => {
            const doc = await db.collection('users').doc(currentUser.uid).get();
            sendSystemMessage('💰 Tens **' + ((doc.data() || {}).balance || 0) + '** 🪙 CordCoins');
        },
        '!rank': async () => {
            const snapshot = await db.collection('users').orderBy('balance', 'desc').limit(5).get();
            let message = '**🏆 Ranking Global:**';
            snapshot.forEach((doc, i) => {
                const user = doc.data();
                message += '\n' + (i + 1) + '. **' + user.username + '** - ' + (user.balance || 0) + ' 🪙';
            });
            sendSystemMessage(message);
        },
        '!serverinfo': async () => {
            if (!currentServer) return;
            const doc = await db.collection('servers').doc(currentServer).get();
            const server = doc.data() || {};
            const botsSnap = await db.collection('bots').where('serverId', '==', currentServer).get();
            sendSystemMessage('📊 **' + escapeHtml(server.name || 'Servidor') + '**\n👥 Membros: ' + ((server.members || []).length) + '\n🤖 Bots: ' + botsSnap.size + '\n👑 Dono: ' + (server.ownerId === currentUser.uid ? 'Tu' : 'Outro'));
        },
        '!help': () => {
            sendSystemMessage('**📖 Comandos Disponíveis:**\n`!ping` - Verifica latência\n`!hora` - Hora atual\n`!dado` - Lança um dado (1-6)\n`!moeda` - Cara ou coroa\n`!coins` - O teu saldo\n`!rank` - Ranking global\n`!serverinfo` - Informação do servidor\n`!help` - Esta lista de comandos');
        }
    };
    if (commands[lower]) commands[lower]();
    checkCustomBots(texto);
}

async function checkCustomBots(texto) {
    if (!currentServer) return;
    try {
        const botsSnapshot = await db.collection('bots').where('serverId', '==', currentServer).where('active', '==', true).get();
        const lower = texto.toLowerCase().trim();
        botsSnapshot.forEach((doc) => {
            const bot = doc.data();
            if (bot.commands && bot.commands[lower]) {
                setTimeout(() => sendBotMessage(bot.commands[lower], bot.name, doc.id), 300 + Math.random() * 500);
            }
        });
    } catch (error) {}
}

function sendSystemMessage(texto) {
    if (!currentServer || !currentChannel) return;
    db.collection('servers').doc(currentServer).collection('channels').doc(currentChannel)
        .collection('messages').add({
            autor: 'Sistema', texto: texto, userId: 'system', isBot: false, isSystem: true,
            hasNitro: false, badges: [], reactions: {}, timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
}

function sendBotMessage(texto, botName, botId) {
    if (!currentServer || !currentChannel) return;
    db.collection('servers').doc(currentServer).collection('channels').doc(currentChannel)
        .collection('messages').add({
            autor: botName, texto: texto, userId: botId || 'system', isBot: true, isSystem: false,
            hasNitro: false, badges: [], reactions: {}, timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
}

async function toggleReaction(msgId, emoji) {
    if (!currentServer || !currentChannel || !currentUser) return;
    const messageRef = db.collection('servers').doc(currentServer).collection('channels').doc(currentChannel)
        .collection('messages').doc(msgId);
    try {
        const doc = await messageRef.get();
        if (!doc.exists) return;
        const data = doc.data();
        const reactions = data.reactions || {};
        if (!reactions[emoji]) reactions[emoji] = [];
        const userIndex = reactions[emoji].indexOf(currentUser.uid);
        if (userIndex >= 0) reactions[emoji].splice(userIndex, 1);
        else reactions[emoji].push(currentUser.uid);
        if (reactions[emoji].length === 0) delete reactions[emoji];
        await messageRef.update({ reactions });
    } catch (error) {}
}

// =============================================
// AMIGOS E DM
// =============================================

async function loadFriendsPanel() {
    if (!currentUser) return;
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const userData = userDoc.data() || {};
        const friends = userData.friends || [];
        document.getElementById('my-friend-code').textContent = '#' + (userData.friendCode || '----');
        const friendsList = document.getElementById('friends-list');
        friendsList.innerHTML = '';
        if (friends.length === 0) {
            friendsList.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:15px;">Ainda não tens amigos. Adiciona alguém pelo código!</p>';
        } else {
            for (const friendId of friends) {
                const friendDoc = await db.collection('users').doc(friendId).get();
                const friendData = friendDoc.data() || {};
                const friendElement = document.createElement('div');
                friendElement.className = 'list-item';
                friendElement.innerHTML = `
                    <div class="list-item-avatar" style="background:${stringToColor(friendData.username || '?')};">${(friendData.username || '?')[0].toUpperCase()}</div>
                    <div class="list-item-info">
                        <div class="list-item-name">${escapeHtml(friendData.username || 'Desconhecido')}</div>
                        <div class="list-item-sub">${friendData.nitro ? '⭐ Nitro' : ''} ${(friendData.badges || []).includes('vip') ? '💎 VIP' : ''}</div>
                    </div>
                    <div class="list-item-actions">
                        <button class="btn btn-xs btn-primary" onclick="openDM('${friendId}')" title="Mensagem Privada">💬</button>
                    </div>`;
                friendsList.appendChild(friendElement);
            }
        }
        loadDMList(friends);
    } catch (error) {}
}

async function loadDMList(friends) {
    const dmList = document.getElementById('dm-list');
    dmList.innerHTML = '';
    if (!friends || friends.length === 0) {
        dmList.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:15px;">Adiciona amigos para conversar em privado.</p>';
        return;
    }
    for (const friendId of friends) {
        const friendDoc = await db.collection('users').doc(friendId).get();
        const friendData = friendDoc.data() || {};
        const dmElement = document.createElement('div');
        dmElement.className = 'list-item';
        dmElement.style.cursor = 'pointer';
        dmElement.onclick = () => openDM(friendId);
        dmElement.innerHTML = `
            <div class="list-item-avatar" style="background:${stringToColor(friendData.username || '?')};">${(friendData.username || '?')[0].toUpperCase()}</div>
            <div class="list-item-info">
                <div class="list-item-name">${escapeHtml(friendData.username || 'Desconhecido')}</div>
                <div class="list-item-sub">Clique para conversar</div>
            </div>
            <span style="color:var(--text-muted);font-size:11px;">💬</span>`;
        dmList.appendChild(dmElement);
    }
}

async function addFriend() {
    if (!currentUser) return;
    const codeInput = document.getElementById('friend-code-input');
    const code = codeInput.value.replace('#', '').trim();
    const resultElement = document.getElementById('add-friend-result');
    resultElement.textContent = '';
    if (!code) {
        resultElement.textContent = 'Por favor, insere um código.';
        resultElement.style.color = 'var(--red)';
        return;
    }
    try {
        const snapshot = await db.collection('users').where('friendCode', '==', parseInt(code)).limit(1).get();
        if (snapshot.empty) {
            resultElement.textContent = 'Código inválido. Nenhum utilizador encontrado.';
            resultElement.style.color = 'var(--red)';
            return;
        }
        const friendDoc = snapshot.docs[0];
        const friendId = friendDoc.id;
        if (friendId === currentUser.uid) {
            resultElement.textContent = 'Não podes adicionar-te a ti mesmo!';
            resultElement.style.color = 'var(--red)';
            return;
        }
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const friends = (userDoc.data() || {}).friends || [];
        if (friends.includes(friendId)) {
            resultElement.textContent = 'Já são amigos!';
            resultElement.style.color = 'var(--yellow)';
            return;
        }
        await db.collection('users').doc(currentUser.uid).update({ friends: firebase.firestore.FieldValue.arrayUnion(friendId) });
        await db.collection('users').doc(friendId).update({ friends: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) });
        resultElement.textContent = '✅ Amigo adicionado: ' + (friendDoc.data().username || 'Utilizador');
        resultElement.style.color = 'var(--green)';
        codeInput.value = '';
        showToast('Amigo adicionado com sucesso! 🎉');
        loadFriendsPanel();
    } catch (error) {
        resultElement.textContent = 'Erro ao adicionar amigo. Tenta novamente.';
        resultElement.style.color = 'var(--red)';
    }
}

function openDM(friendId) {
    activeDM = friendId;
    currentChannel = null;
    if (unsubMessages) unsubMessages();
    const dmChannelId = [currentUser.uid, friendId].sort().join('_');
    document.getElementById('current-channel-name').textContent = '💬 Mensagem Privada';
    unsubMessages = db.collection('dms').doc(dmChannelId).collection('messages').orderBy('timestamp', 'asc')
        .onSnapshot((snapshot) => {
            const chatBox = document.getElementById('chat-box');
            chatBox.innerHTML = '';
            if (snapshot.empty) {
                chatBox.innerHTML = '<div class="empty-state"><span class="icon">💬</span><span class="empty-title">Conversa Privada</span><span class="empty-desc">Nenhuma mensagem ainda. Diz olá!</span></div>';
                return;
            }
            snapshot.forEach((doc) => renderMessage(doc.data(), doc.id));
            chatBox.scrollTop = chatBox.scrollHeight;
        });
    switchView('chat');
    if (window.innerWidth <= 768) toggleSidebar();
}

async function sendDirectMessage(friendId, texto) {
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const userData = userDoc.data() || {};
        const dmChannelId = [currentUser.uid, friendId].sort().join('_');
        await db.collection('dms').doc(dmChannelId).collection('messages').add({
            autor: currentUser.displayName || currentUser.email.split('@')[0],
            texto: texto,
            userId: currentUser.uid,
            hasNitro: userData.nitro || false,
            badges: userData.badges || [],
            reactions: {},
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        showToast('Erro ao enviar mensagem privada', true);
    }
}

// =============================================
// PAINEL NITRO
// =============================================

async function loadNitroPanel() {
    if (!currentUser) return;
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        document.getElementById('nitro-balance').textContent = (userDoc.data() || {}).balance || 0;
    } catch (error) {}
}

async function buyNitro() {
    if (!currentUser) return;
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const userData = userDoc.data() || {};
        if ((userData.balance || 0) < 500) return showToast('Precisas de 500 🪙 para assinar o Nitro!', true);
        if (userData.nitro) return showToast('Já tens Nitro ativo! ⭐', true);
        const expiry = new Date();
        expiry.setMonth(expiry.getMonth() + 1);
        await db.collection('users').doc(currentUser.uid).update({
            nitro: true,
            nitroExpiry: firebase.firestore.Timestamp.fromDate(expiry),
            balance: firebase.firestore.FieldValue.increment(-500)
        });
        showToast('Nitro ativado! ⭐ Bem-vindo ao clube!');
        loadNitroPanel();
    } catch (error) { showToast('Erro ao processar a compra', true); }
}

async function buyEffect(effectType, price) {
    if (!currentUser) return;
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const userData = userDoc.data() || {};
        if ((userData.balance || 0) < price) return showToast('Precisas de ' + price + ' 🪙 para este efeito!', true);
        const effectId = 'effect_' + effectType;
        if ((userData.inventory || []).includes(effectId)) return showToast('Já tens este efeito!', true);
        await db.collection('users').doc(currentUser.uid).update({
            balance: firebase.firestore.FieldValue.increment(-price),
            inventory: firebase.firestore.FieldValue.arrayUnion(effectId)
        });
        showToast('Efeito comprado com sucesso! ✨');
        loadNitroPanel();
    } catch (error) { showToast('Erro ao processar a compra', true); }
}

async function buyBadge(badgeType, price) {
    if (!currentUser) return;
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const userData = userDoc.data() || {};
        if ((userData.balance || 0) < price) return showToast('Precisas de ' + price + ' 🪙 para este badge!', true);
        if ((userData.badges || []).includes(badgeType)) return showToast('Já tens este badge!', true);
        await db.collection('users').doc(currentUser.uid).update({
            balance: firebase.firestore.FieldValue.increment(-price),
            badges: firebase.firestore.FieldValue.arrayUnion(badgeType)
        });
        showToast('Badge comprado com sucesso! 🏅');
        loadNitroPanel();
    } catch (error) { showToast('Erro ao processar a compra', true); }
}

async function dailyReward() {
    if (!currentUser) return;
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const userData = userDoc.data() || {};
        const now = new Date();
        const lastDaily = userData.lastDaily ? userData.lastDaily.toDate() : null;
        if (lastDaily && now.toDateString() === lastDaily.toDateString()) {
            return showToast('Já recebeste a recompensa hoje! Volta amanhã.', true);
        }
        const reward = 50 + Math.floor(Math.random() * 51);
        await db.collection('users').doc(currentUser.uid).update({
            balance: firebase.firestore.FieldValue.increment(reward),
            lastDaily: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('🎁 Recebeste ' + reward + ' 🪙! Volta amanhã para mais.');
        loadNitroPanel();
    } catch (error) { showToast('Erro ao processar recompensa', true); }
}

// =============================================
// PAINEL DE MEMBROS
// =============================================

async function loadMembersPanel() {
    if (!currentServer) {
        document.getElementById('members-list').innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:15px;">Seleciona um servidor primeiro.</p>';
        document.getElementById('invite-code-display').textContent = 'Nenhum';
        document.getElementById('roles-list').innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:15px;">Seleciona um servidor para gerir cargos.</p>';
        return;
    }
    try {
        const serverDoc = await db.collection('servers').doc(currentServer).get();
        if (!serverDoc.exists) return;
        const serverData = serverDoc.data();
        const members = serverData.members || [];
        const invites = serverData.invites || [];
        const roles = serverData.roles || [];
        document.getElementById('invite-code-display').textContent = invites.length > 0 ? invites[invites.length - 1] : 'Nenhum';
        const membersList = document.getElementById('members-list');
        membersList.innerHTML = '';
        if (members.length === 0) {
            membersList.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:15px;">Nenhum membro no servidor.</p>';
        } else {
            for (const memberId of members) {
                const userDoc = await db.collection('users').doc(memberId).get();
                const userData = userDoc.data() || {};
                const isOwner = memberId === serverData.ownerId;
                const memberElement = document.createElement('div');
                memberElement.className = 'list-item';
                memberElement.innerHTML = `
                    <div class="list-item-avatar" style="background:${stringToColor(userData.username || memberId)};">
                        ${(userData.username || '?')[0].toUpperCase()}
                    </div>
                    <div class="list-item-info">
                        <div class="list-item-name">${escapeHtml(userData.username || 'Desconhecido')} ${isOwner ? '👑' : ''}</div>
                        <div class="list-item-sub">${userData.nitro ? '⭐ Nitro ' : ''}</div>
                    </div>`;
                membersList.appendChild(memberElement);
            }
        }
        loadRolesList(roles);
    } catch (error) {}
}

function loadRolesList(roles) {
    const rolesList = document.getElementById('roles-list');
    if (!roles || roles.length === 0) {
        rolesList.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:10px;">Nenhum cargo criado ainda.</p>';
        return;
    }
    rolesList.innerHTML = '';
    roles.forEach((role) => {
        const roleElement = document.createElement('div');
        roleElement.className = 'shop-item';
        roleElement.innerHTML = `
            <div class="shop-item-info"><div class="shop-item-name" style="color:${role.color};">● ${escapeHtml(role.name)}</div></div>
            <button class="btn btn-xs btn-primary" onclick="assignRoleToMember('${role.id}')">Atribuir</button>`;
        rolesList.appendChild(roleElement);
    });
}

async function generateInvite() {
    if (!currentServer) return showToast('Seleciona um servidor primeiro!', true);
    try {
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        await db.collection('servers').doc(currentServer).update({ invites: firebase.firestore.FieldValue.arrayUnion(code) });
        document.getElementById('invite-code-display').textContent = code;
        showToast('Convite gerado: ' + code);
    } catch (error) { showToast('Erro ao gerar convite', true); }
}

function copyInviteCode() {
    const code = document.getElementById('invite-code-display').textContent;
    if (code === 'Nenhum') return showToast('Gera um convite primeiro!', true);
    navigator.clipboard.writeText(code).then(() => showToast('Código copiado! 📋')).catch(() => showToast('Erro ao copiar', true));
}

async function joinServerByInvite() {
    if (!currentUser) return;
    const code = document.getElementById('join-invite-code').value.trim().toUpperCase();
    if (!code) return showToast('Insere um código de convite!', true);
    try {
        const snapshot = await db.collection('servers').where('invites', 'array-contains', code).limit(1).get();
        if (snapshot.empty) return showToast('Código de convite inválido!', true);
        const serverDoc = snapshot.docs[0];
        if ((serverDoc.data().members || []).includes(currentUser.uid)) return showToast('Já estás neste servidor!', true);
        await db.collection('servers').doc(serverDoc.id).update({ members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) });
        document.getElementById('join-invite-code').value = '';
        showToast('🎉 Entraste no servidor: ' + serverDoc.data().name);
        loadServers();
    } catch (error) { showToast('Erro ao processar convite', true); }
}

async function addRole() {
    if (!currentServer) return showToast('Seleciona um servidor primeiro!', true);
    const roleName = prompt('Nome do cargo:');
    if (!roleName || !roleName.trim()) return;
    const roleColor = prompt('Cor do cargo (ex: #ff0000):', '#6366f1');
    if (!roleColor || !roleColor.trim()) return;
    try {
        const serverDoc = await db.collection('servers').doc(currentServer).get();
        const roles = (serverDoc.data() || {}).roles || [];
        roles.push({ id: 'role_' + Date.now(), name: roleName.trim(), color: roleColor.trim() });
        await db.collection('servers').doc(currentServer).update({ roles });
        showToast('Cargo criado: ' + roleName.trim());
        loadMembersPanel();
    } catch (error) { showToast('Erro ao criar cargo', true); }
}

async function assignRoleToMember(roleId) {
    if (!currentServer) return;
    const memberId = prompt('ID do membro (visível na lista):');
    if (!memberId || !memberId.trim()) return;
    try {
        await db.collection('users').doc(memberId.trim()).update({ roles: firebase.firestore.FieldValue.arrayUnion(roleId) });
        showToast('Cargo atribuído! 🎖️');
        loadMembersPanel();
    } catch (error) { showToast('Erro ao atribuir cargo. Verifica o ID.', true); }
}

// =============================================
// PAINEL DE BOTS
// =============================================

function loadBotsPanel() {
    loadMyBots();
    loadBotServerSelects();
}

function loadMyBots() {
    if (!currentUser) return;
    db.collection('bots').where('ownerId', '==', currentUser.uid).onSnapshot((snapshot) => {
        const botsList = document.getElementById('my-bots-list');
        botsList.innerHTML = '';
        if (snapshot.empty) {
            botsList.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:15px;">Nenhum bot criado ainda.</p>';
            return;
        }
        snapshot.forEach((doc) => {
            const bot = doc.data();
            const botElement = document.createElement('div');
            botElement.className = 'shop-item';
            botElement.innerHTML = `
                <div class="shop-item-info">
                    <div class="shop-item-name">🤖 ${escapeHtml(bot.name)}</div>
                    <div class="shop-item-desc">${bot.active ? '🟢 Ativo' : '⚫ Inativo'} • ${bot.serverId ? 'Em servidor' : 'Sem servidor'}</div>
                    <div class="token-display" onclick="copyBotToken('${doc.id}', this)" title="Clique para copiar o token">${(bot.token || '').substring(0, 15)}...<span class="copied-tooltip">Copiado!</span></div>
                </div>
                <div style="display:flex;gap:4px;flex-shrink:0;">
                    <button class="btn btn-xs btn-primary" onclick="editBot('${doc.id}')">✏️</button>
                    <button class="btn btn-xs btn-danger" onclick="deleteBot('${doc.id}')">🗑️</button>
                </div>`;
            botsList.appendChild(botElement);
        });
    });
}

async function loadBotServerSelects() {
    if (!currentUser) return;
    try {
        const botSelect = document.getElementById('select-bot-to-add');
        const serverSelect = document.getElementById('select-server-to-add');
        botSelect.innerHTML = '<option value="">Seleciona um bot...</option>';
        serverSelect.innerHTML = '<option value="">Seleciona um servidor...</option>';
        const botsSnapshot = await db.collection('bots').where('ownerId', '==', currentUser.uid).get();
        botsSnapshot.forEach((doc) => {
            const bot = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = bot.name + (bot.serverId ? ' (já em servidor)' : '');
            if (bot.serverId) option.disabled = true;
            botSelect.appendChild(option);
        });
        const serversSnapshot = await db.collection('servers').where('members', 'array-contains', currentUser.uid).get();
        serversSnapshot.forEach((doc) => {
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = doc.data().name;
            serverSelect.appendChild(option);
        });
    } catch (error) {}
}

async function createBot() {
    if (!currentUser) return;
    const name = document.getElementById('new-bot-name').value.trim();
    const desc = document.getElementById('new-bot-desc').value.trim();
    if (!name) return showToast('Dá um nome ao bot!', true);
    try {
        const token = 'bot_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 10);
        await db.collection('bots').add({
            name, desc: desc || 'Bot personalizado', token, ownerId: currentUser.uid,
            active: true, serverId: null, channelId: null, commands: {},
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        document.getElementById('new-bot-name').value = '';
        document.getElementById('new-bot-desc').value = '';
        showToast('Bot criado com sucesso! 🤖 Copia o token para usar.');
        loadBotsPanel();
    } catch (error) { showToast('Erro ao criar bot', true); }
}

async function addBotToServer() {
    if (!currentUser) return;
    const botId = document.getElementById('select-bot-to-add').value;
    const serverId = document.getElementById('select-server-to-add').value;
    if (!botId || !serverId) return showToast('Seleciona um bot e um servidor!', true);
    try {
        await db.collection('bots').doc(botId).update({ serverId, channelId: null });
        const botDoc = await db.collection('bots').doc(botId).get();
        const botName = (botDoc.data() || {}).name || 'Bot';
        const channelsSnapshot = await db.collection('servers').doc(serverId).collection('channels').limit(1).get();
        if (!channelsSnapshot.empty) {
            await db.collection('servers').doc(serverId).collection('channels').doc(channelsSnapshot.docs[0].id)
                .collection('messages').add({
                    autor: 'Sistema', texto: `🤖 O bot **${botName}** foi adicionado ao servidor!`,
                    userId: 'system', isBot: false, isSystem: true, hasNitro: false, badges: [],
                    reactions: {}, timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
        }
        showToast('Bot adicionado ao servidor! 🎉');
        loadBotsPanel();
    } catch (error) { showToast('Erro ao adicionar bot', true); }
}

async function editBot(botId) {
    const newName = prompt('Novo nome do bot:');
    if (!newName || !newName.trim()) return;
    const newDesc = prompt('Nova descrição:', '') || '';
    const commandsStr = prompt('Comandos personalizados (formato: !comando=resposta, !cmd2=resp2):\nExemplo: !ola=Olá mundo!, !adeus=Até logo!');
    const commands = {};
    if (commandsStr) {
        commandsStr.split(',').forEach((pair) => {
            const parts = pair.split('=');
            if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
                commands[parts[0].trim().toLowerCase()] = parts[1].trim();
            }
        });
    }
    try {
        await db.collection('bots').doc(botId).update({ name: newName.trim(), desc: newDesc.trim(), commands });
        showToast('Bot atualizado! ✏️');
    } catch (error) { showToast('Erro ao editar bot', true); }
}

async function deleteBot(botId) {
    if (!confirm('Tens a certeza que queres apagar este bot? Esta ação é irreversível.')) return;
    try {
        await db.collection('bots').doc(botId).delete();
        showToast('Bot apagado 🗑️');
        loadBotsPanel();
    } catch (error) { showToast('Erro ao apagar bot', true); }
}

async function copyBotToken(botId, element) {
    try {
        const botDoc = await db.collection('bots').doc(botId).get();
        const token = (botDoc.data() || {}).token || '';
        await navigator.clipboard.writeText(token);
        const tooltip = element.querySelector('.copied-tooltip');
        if (tooltip) { tooltip.classList.add('show'); setTimeout(() => tooltip.classList.remove('show'), 1500); }
        showToast('Token copiado para a área de transferência! 📋');
    } catch (error) { showToast('Erro ao copiar token', true); }
}

// =============================================
// PAINEL DE DEFINIÇÕES
// =============================================

async function loadSettingsPanel() {
    if (!currentUser) return;
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const userData = userDoc.data() || {};
        document.getElementById('settings-username').value = userData.username || '';
        document.getElementById('settings-bio').value = userData.bio || '';
        const inventory = userData.inventory || [];
        const itemNames = {
            'effect_glow': '✨ Efeito Glow', 'effect_rainbow': '🌈 Moldura Arco-Íris',
            'effect_crystal': '💎 Moldura de Cristal', 'badge_vip': '💎 Badge VIP',
            'badge_og': '👑 Badge OG', 'badge_botmaster': '🤖 Badge Bot Master'
        };
        document.getElementById('inventory-list').innerHTML = inventory.length === 0
            ? '<p style="color:var(--text-muted);text-align:center;padding:15px;">O teu inventário está vazio. Visita a loja Nitro!</p>'
            : inventory.map(item => `<div style="padding:8px 12px;background:var(--bg-tertiary);border-radius:var(--radius-sm);margin-bottom:4px;font-size:13px;">${itemNames[item] || item}</div>`).join('');
    } catch (error) {}
}

async function saveProfile() {
    if (!currentUser) return;
    const username = document.getElementById('settings-username').value.trim();
    const bio = document.getElementById('settings-bio').value.trim();
    if (!username) return showToast('O nome de utilizador não pode estar vazio!', true);
    try {
        await currentUser.updateProfile({ displayName: username });
        await db.collection('users').doc(currentUser.uid).update({ username, bio });
        document.getElementById('username-footer').textContent = username;
        document.getElementById('topbar-title').textContent = username;
        showToast('Perfil atualizado com sucesso! 💾');
    } catch (error) { showToast('Erro ao guardar perfil', true); }
}

function changeTheme(theme) {
    const themes = {
        dark: { '--bg-primary': '#1a1b1e', '--bg-secondary': '#1f2024', '--bg-tertiary': '#2a2b30', '--bg-card': '#25262b', '--bg-input': '#1a1b20', '--text-normal': '#e4e4e7', '--text-muted': '#a1a1aa', '--text-bright': '#ffffff', '--border-subtle': 'rgba(255, 255, 255, 0.06)', '--border-medium': 'rgba(255, 255, 255, 0.1)' },
        light: { '--bg-primary': '#f4f4f5', '--bg-secondary': '#ffffff', '--bg-tertiary': '#e4e4e7', '--bg-card': '#fafafa', '--bg-input': '#ffffff', '--text-normal': '#18181b', '--text-muted': '#71717a', '--text-bright': '#09090b', '--border-subtle': 'rgba(0, 0, 0, 0.08)', '--border-medium': 'rgba(0, 0, 0, 0.12)' },
        midnight: { '--bg-primary': '#09090b', '--bg-secondary': '#0f0f14', '--bg-tertiary': '#1a1a24', '--bg-card': '#12121a', '--bg-input': '#0a0a10', '--text-normal': '#d4d4d8', '--text-muted': '#71717a', '--text-bright': '#fafafa', '--border-subtle': 'rgba(255, 255, 255, 0.04)', '--border-medium': 'rgba(255, 255, 255, 0.07)' }
    };
    const themeColors = themes[theme] || themes.dark;
    for (const [property, value] of Object.entries(themeColors)) {
        document.documentElement.style.setProperty(property, value);
    }
    showToast('Tema alterado: ' + (theme === 'dark' ? '🌙 Escuro' : theme === 'light' ? '☀️ Claro' : '🌑 Meia-Noite'));
}

// =============================================
// MODAIS
// =============================================

function showServerModal() {
    document.getElementById('server-modal').style.display = 'flex';
    document.getElementById('server-name').focus();
}

function showChannelModal() {
    if (!currentServer) return showToast('Seleciona um servidor primeiro!', true);
    document.getElementById('channel-modal').style.display = 'flex';
    document.getElementById('channel-name').focus();
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

async function createServer() {
    if (!currentUser) return;
    const name = document.getElementById('server-name').value.trim();
    if (!name) return showToast('Dá um nome ao servidor!', true);
    try {
        const serverRef = await db.collection('servers').add({
            name, ownerId: currentUser.uid, members: [currentUser.uid], invites: [], roles: [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await db.collection('servers').doc(serverRef.id).collection('channels').add({
            name: 'geral', createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        closeModal('server-modal');
        document.getElementById('server-name').value = '';
        showToast('Servidor criado com sucesso! 🎉');
    } catch (error) { showToast('Erro ao criar servidor', true); }
}

async function createChannel() {
    if (!currentServer) return;
    const name = document.getElementById('channel-name').value.trim();
    if (!name) return showToast('Dá um nome ao canal!', true);
    try {
        await db.collection('servers').doc(currentServer).collection('channels').add({
            name, createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        closeModal('channel-modal');
        document.getElementById('channel-name').value = '';
        showToast('Canal #' + name + ' criado!');
    } catch (error) { showToast('Erro ao criar canal', true); }
}

// =============================================
// UI HELPERS
// =============================================

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const isOpen = sidebar.classList.contains('open');
    
    if (isOpen) {
        sidebar.classList.remove('open');
        overlay.classList.remove('show');
        document.body.style.overflow = '';
    } else {
        sidebar.classList.add('open');
        overlay.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
}

function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast';
    if (isError) toast.classList.add('error');
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.remove('show'), 2500);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function stringToColor(str) {
    if (!str) return 'hsl(0, 0%, 50%)';
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash) % 360}, 60%, 55%)`;
}

function formatMessageText(text) {
    if (!text) return '';
    text = text.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
    text = text.replace(/`([^`]+)`/g, '<span class="code-inline">$1</span>');
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
    return text;
}

// =============================================
// EVENT LISTENERS
// =============================================

document.getElementById('server-modal').addEventListener('click', function(e) {
    if (e.target === this) closeModal('server-modal');
});

document.getElementById('channel-modal').addEventListener('click', function(e) {
    if (e.target === this) closeModal('channel-modal');
});

document.getElementById('msg-input').addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 100) + 'px';
});

document.getElementById('sidebar-overlay').addEventListener('click', function() {
    toggleSidebar();
});

// Fechar sidebar ao selecionar item (mobile)
document.addEventListener('click', function(e) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar.classList.contains('open')) return;
    if (window.innerWidth > 768) return;
    
    const clickedItem = e.target.closest('.server-item') || e.target.closest('.channel-item');
    if (clickedItem) {
        setTimeout(() => toggleSidebar(), 150);
    }
});

// Prevenir zoom em mobile
document.addEventListener('gesturestart', function(e) {
    e.preventDefault();
});

console.log('🐺 Cord - Rede Social Completa - Inicializado!');
