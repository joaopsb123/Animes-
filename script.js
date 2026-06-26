// =============================================
// CORD - REDE SOCIAL COMPLETA
// JavaScript Principal com Sistema de Perfis
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
db.enablePersistence().catch(() => {});

// ============ VARIÁVEIS GLOBAIS ============
let currentUser = null;
let currentServer = null;
let currentChannel = null;
let unsubMessages = null;
let currentView = 'chat';
let activeDM = null;
let currentProfileUserId = null;

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
    if (unsubMessages) { unsubMessages(); unsubMessages = null; }
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
        'auth/network-request-failed': 'Erro de rede. Verifica a tua ligação à internet.'
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
        addProfileStyles();
        setupProfileClicks();
        try {
            await db.collection('users').doc(user.uid).update({
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (err) {}
    } else {
        currentUser = null;
        document.getElementById('auth-container').style.display = 'flex';
        document.getElementById('app-container').style.display = 'none';
        if (unsubMessages) { unsubMessages(); unsubMessages = null; }
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
    messageDiv._messageData = msg; // Guardar dados para o perfil
    
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
    
    // Nome clicável (abre perfil)
    const clickableName = (msg.userId && msg.userId !== 'system') 
        ? `<span class="message-username ${nitroNameClass}" onclick="openUserProfile('${msg.userId}')" style="cursor:pointer;" title="Ver perfil">${escapeHtml(msg.autor)}</span>`
        : `<span class="message-username ${nitroNameClass}">${escapeHtml(msg.autor)}</span>`;
    
    messageDiv.innerHTML = `
        <div class="message-avatar" style="background: ${avatarColor};">
            <div class="avatar-frame ${nitroFrameClass}"></div>${avatarLetter}
        </div>
        <div class="message-content">
            <div class="message-header">
                ${clickableName}${badgesHtml}
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
        showToast('Erro ao enviar mensagem. Tenta novamente.', true);
    }
}

function handleCommands(texto) {
    const lower = texto.toLowerCase().trim();
    const commands = {
        '!ping': () => sendSystemMessage('🏓 Pong!'),
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
        '!help': () => {
            sendSystemMessage('**📖 Comandos:** `!ping` `!hora` `!dado` `!moeda` `!coins` `!rank` `!serverinfo` `!help`');
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
                setTimeout(() => sendBotMessage(bot.commands[lower], bot.name, doc.id), 300);
            }
        });
    } catch (error) {}
}

function sendSystemMessage(texto) {
    if (!currentServer || !currentChannel) return;
    db.collection('servers').doc(currentServer).collection('channels').doc(currentChannel)
        .collection('messages').add({
            autor: 'Sistema', texto, userId: 'system', isBot: false, isSystem: true,
            hasNitro: false, badges: [], reactions: {}, timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
}

function sendBotMessage(texto, botName, botId) {
    if (!currentServer || !currentChannel) return;
    db.collection('servers').doc(currentServer).collection('channels').doc(currentChannel)
        .collection('messages').add({
            autor: botName, texto, userId: botId || 'system', isBot: true, isSystem: false,
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
            friendsList.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:15px;">Ainda não tens amigos.</p>';
        } else {
            for (const friendId of friends) {
                const friendDoc = await db.collection('users').doc(friendId).get();
                const friendData = friendDoc.data() || {};
                const friendElement = document.createElement('div');
                friendElement.className = 'list-item';
                friendElement.innerHTML = `
                    <div class="list-item-avatar" style="background:${stringToColor(friendData.username || '?')};cursor:pointer;" onclick="openUserProfile('${friendId}')">
                        ${(friendData.username || '?')[0].toUpperCase()}
                    </div>
                    <div class="list-item-info" style="cursor:pointer;" onclick="openUserProfile('${friendId}')">
                        <div class="list-item-name">${escapeHtml(friendData.username || 'Desconhecido')}</div>
                        <div class="list-item-sub">${friendData.nitro ? '⭐ Nitro' : ''}</div>
                    </div>
                    <div class="list-item-actions">
                        <button class="btn btn-xs btn-primary" onclick="openDM('${friendId}')">💬</button>
                        <button class="btn btn-xs" style="background:#52525b;color:white;" onclick="openUserProfile('${friendId}')">👤</button>
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
            <div class="list-item-avatar" style="background:${stringToColor(friendData.username || '?')};">
                ${(friendData.username || '?')[0].toUpperCase()}
            </div>
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
            resultElement.textContent = 'Código inválido.';
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
        resultElement.textContent = '✅ Amigo adicionado!';
        resultElement.style.color = 'var(--green)';
        codeInput.value = '';
        showToast('Amigo adicionado! 🎉');
        loadFriendsPanel();
    } catch (error) {
        resultElement.textContent = 'Erro. Tenta novamente.';
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
                chatBox.innerHTML = '<div class="empty-state"><span class="icon">💬</span><span class="empty-title">Conversa Privada</span><span class="empty-desc">Nenhuma mensagem ainda.</span></div>';
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
            texto, userId: currentUser.uid,
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
// SISTEMA DE PERFIS
// =============================================

async function openUserProfile(userId) {
    if (!userId || userId === 'system') return;
    currentProfileUserId = userId;
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) { showToast('Utilizador não encontrado.', true); return; }
        const userData = userDoc.data();
        const isOwnProfile = userId === currentUser?.uid;
        const isFriend = (userData.friends || []).includes(currentUser?.uid);
        const modalContent = buildProfileModal(userData, userId, isOwnProfile, isFriend);
        showProfileModal(modalContent);
        loadProfileBadges(userId, userData);
        loadMutualFriends(userId, userData);
        loadMutualServers(userId, userData);
    } catch (error) { showToast('Erro ao carregar perfil.', true); }
}

function buildProfileModal(userData, userId, isOwnProfile, isFriend) {
    const username = userData.username || 'Utilizador';
    const bio = userData.bio || 'Sem bio.';
    const nitro = userData.nitro || false;
    const balance = userData.balance || 0;
    const friendCode = userData.friendCode || '----';
    const createdAt = userData.createdAt ? userData.createdAt.toDate() : null;
    const lastSeen = userData.lastSeen ? userData.lastSeen.toDate() : null;
    const avatarColor = stringToColor(username);
    const initial = username[0].toUpperCase();
    const memberSince = createdAt ? formatDate(createdAt) : 'Desconhecido';
    const lastSeenStr = lastSeen ? formatLastSeen(lastSeen) : 'Desconhecido';
    
    let actionButtons = '';
    if (isOwnProfile) {
        actionButtons = `<button class="btn btn-sm btn-primary" onclick="closeProfileModal(); switchView('settings');">✏️ Editar Perfil</button>`;
    } else if (isFriend) {
        actionButtons = `
            <button class="btn btn-sm btn-primary" onclick="openDM('${userId}'); closeProfileModal();">💬 Mensagem</button>
            <button class="btn btn-sm btn-danger" onclick="removeFriend('${userId}'); closeProfileModal();">❌ Remover</button>`;
    } else {
        actionButtons = `<button class="btn btn-sm btn-primary" onclick="addFriendById('${userId}');">➕ Adicionar Amigo</button>`;
    }
    
    return `
        <div class="profile-modal-content">
            <div class="profile-header" style="background: linear-gradient(180deg, ${avatarColor} 0%, var(--bg-secondary) 70%);">
                <div class="profile-avatar-container">
                    <div class="profile-avatar" style="background: ${avatarColor};">${initial}</div>
                    <div class="profile-status-dot ${lastSeen && (new Date() - lastSeen) < 300000 ? 'online' : 'offline'}"></div>
                </div>
                <h2 class="profile-username ${nitro ? 'nitro-name' : ''}">${escapeHtml(username)}</h2>
            </div>
            <div class="profile-body">
                <div class="profile-section"><h4>📝 Sobre Mim</h4><p class="profile-bio">${escapeHtml(bio)}</p></div>
                <div class="profile-section">
                    <h4>📊 Estatísticas</h4>
                    <div class="profile-stats">
                        <div class="stat-item"><span class="stat-icon">💰</span><span class="stat-value">${balance}</span><span class="stat-label">CordCoins</span></div>
                        <div class="stat-item"><span class="stat-icon">#</span><span class="stat-value">${friendCode}</span><span class="stat-label">Código</span></div>
                    </div>
                </div>
                <div class="profile-section"><h4>🏅 Badges</h4><div id="profile-badges-list">A carregar...</div></div>
                <div class="profile-section"><h4>👥 Amigos em Comum</h4><div id="profile-mutual-friends">A carregar...</div></div>
                <div class="profile-section"><h4>🌐 Servidores em Comum</h4><div id="profile-mutual-servers">A carregar...</div></div>
                <div class="profile-section">
                    <h4>📅 Datas</h4>
                    <div class="profile-dates">
                        <div class="date-item"><span>📆 Membro desde:</span><span>${memberSince}</span></div>
                        <div class="date-item"><span>🟢 Visto:</span><span>${lastSeenStr}</span></div>
                    </div>
                </div>
                <div class="profile-actions">${actionButtons}</div>
            </div>
        </div>`;
}

function showProfileModal(content) {
    let modal = document.getElementById('profile-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'profile-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `<div class="modal profile-modal-wrapper"><button class="profile-close-btn" onclick="closeProfileModal()">✕</button><div id="profile-modal-content"></div></div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', function(e) { if (e.target === this) closeProfileModal(); });
    }
    document.getElementById('profile-modal-content').innerHTML = content;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeProfileModal() {
    const modal = document.getElementById('profile-modal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
    currentProfileUserId = null;
}

async function loadProfileBadges(userId, userData) {
    const badgesList = document.getElementById('profile-badges-list');
    if (!badgesList) return;
    const badges = userData.badges || [];
    const inventory = userData.inventory || [];
    const allBadges = [];
    if (userData.nitro) allBadges.push({ name: '⭐ Nitro', icon: '⭐' });
    if (badges.includes('vip')) allBadges.push({ name: '💎 VIP', icon: '💎' });
    if (badges.includes('og')) allBadges.push({ name: '👑 OG', icon: '👑' });
    if (badges.includes('botmaster')) allBadges.push({ name: '🤖 Bot Master', icon: '🤖' });
    if (inventory.includes('effect_glow')) allBadges.push({ name: '✨ Glow', icon: '✨' });
    if (inventory.includes('effect_rainbow')) allBadges.push({ name: '🌈 Arco-Íris', icon: '🌈' });
    if (allBadges.length === 0) {
        badgesList.innerHTML = '<span style="color:var(--text-muted);font-size:11px;">Nenhum badge.</span>';
        return;
    }
    badgesList.innerHTML = allBadges.map(b => `<span class="badge-item">${b.icon} ${b.name}</span>`).join(' ');
}

async function loadMutualFriends(userId, userData) {
    const container = document.getElementById('profile-mutual-friends');
    if (!container || !currentUser) return;
    try {
        const targetFriends = userData.friends || [];
        const myDoc = await db.collection('users').doc(currentUser.uid).get();
        const myFriends = (myDoc.data() || {}).friends || [];
        const mutual = targetFriends.filter(f => myFriends.includes(f));
        if (mutual.length === 0) { container.innerHTML = '<span style="color:var(--text-muted);font-size:11px;">Nenhum.</span>'; return; }
        let html = '';
        for (const fid of mutual.slice(0, 5)) {
            const fDoc = await db.collection('users').doc(fid).get();
            const fData = fDoc.data() || {};
            html += `<div class="mutual-item" onclick="openUserProfile('${fid}'); closeProfileModal();"><div class="mutual-avatar" style="background:${stringToColor(fData.username || '?')};">${(fData.username||'?')[0]}</div><span>${escapeHtml(fData.username||'?')}</span></div>`;
        }
        container.innerHTML = html;
    } catch (error) { container.innerHTML = '<span style="color:var(--text-muted);">Erro.</span>'; }
}

async function loadMutualServers(userId, userData) {
    const container = document.getElementById('profile-mutual-servers');
    if (!container || !currentUser) return;
    try {
        const targetSnap = await db.collection('servers').where('members', 'array-contains', userId).get();
        const targetIds = targetSnap.docs.map(d => d.id);
        const mySnap = await db.collection('servers').where('members', 'array-contains', currentUser.uid).get();
        const mutual = mySnap.docs.filter(d => targetIds.includes(d.id));
        if (mutual.length === 0) { container.innerHTML = '<span style="color:var(--text-muted);font-size:11px;">Nenhum.</span>'; return; }
        container.innerHTML = mutual.slice(0, 5).map(d => `<div class="mutual-item" onclick="selectServer('${d.id}','${escapeHtml(d.data().name)}'); closeProfileModal();"><span class="server-dot" style="background:var(--green);width:8px;height:8px;border-radius:50%;"></span>${escapeHtml(d.data().name)}</div>`).join('');
    } catch (error) { container.innerHTML = '<span style="color:var(--text-muted);">Erro.</span>'; }
}

async function addFriendById(friendId) {
    if (!currentUser || !friendId) return;
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const friends = (userDoc.data() || {}).friends || [];
        if (friends.includes(friendId)) { showToast('Já são amigos!'); return; }
        await db.collection('users').doc(currentUser.uid).update({ friends: firebase.firestore.FieldValue.arrayUnion(friendId) });
        await db.collection('users').doc(friendId).update({ friends: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) });
        showToast('Amigo adicionado! 🎉');
        closeProfileModal();
        loadFriendsPanel();
    } catch (error) { showToast('Erro.', true); }
}

async function removeFriend(friendId) {
    if (!currentUser || !friendId) return;
    if (!confirm('Remover este amigo?')) return;
    try {
        await db.collection('users').doc(currentUser.uid).update({ friends: firebase.firestore.FieldValue.arrayRemove(friendId) });
        await db.collection('users').doc(friendId).update({ friends: firebase.firestore.FieldValue.arrayRemove(currentUser.uid) });
        showToast('Amigo removido.');
        loadFriendsPanel();
    } catch (error) { showToast('Erro.', true); }
}

function formatDate(date) {
    const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function formatLastSeen(date) {
    const diff = Math.floor((new Date() - date) / 1000);
    if (diff < 60) return 'Agora';
    if (diff < 3600) return `Há ${Math.floor(diff/60)}min`;
    if (diff < 86400) return `Há ${Math.floor(diff/3600)}h`;
    return formatDate(date);
}

function addProfileStyles() {
    if (document.getElementById('profile-styles')) return;
    const style = document.createElement('style');
    style.id = 'profile-styles';
    style.textContent = `
        .profile-modal-wrapper { max-width: 500px; padding: 0; overflow: hidden; max-height: 90vh; overflow-y: auto; }
        .profile-close-btn { position: absolute; top: 12px; right: 12px; z-index: 10; background: rgba(0,0,0,0.5); color: white; border: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; }
        .profile-header { padding: 30px 20px 20px; text-align: center; }
        .profile-avatar-container { position: relative; display: inline-block; margin-bottom: 12px; }
        .profile-avatar { width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 36px; font-weight: 700; color: white; border: 4px solid var(--bg-secondary); box-shadow: 0 4px 15px rgba(0,0,0,0.3); margin: 0 auto; }
        .profile-status-dot { position: absolute; bottom: 2px; right: 2px; width: 16px; height: 16px; border-radius: 50%; border: 3px solid var(--bg-secondary); }
        .profile-status-dot.online { background: var(--green); }
        .profile-status-dot.offline { background: #747f8d; }
        .profile-username { font-size: 22px; font-weight: 700; color: var(--text-bright); margin-top: 8px; }
        .profile-body { padding: 16px 20px; }
        .profile-section { margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px solid var(--border-subtle); }
        .profile-section h4 { font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
        .profile-bio { color: var(--text-normal); font-size: 14px; line-height: 1.6; }
        .profile-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .stat-item { background: var(--bg-tertiary); border-radius: 8px; padding: 10px; text-align: center; }
        .stat-icon { font-size: 18px; display: block; margin-bottom: 2px; }
        .stat-value { font-size: 16px; font-weight: 700; color: var(--text-bright); display: block; }
        .stat-label { font-size: 9px; color: var(--text-muted); text-transform: uppercase; }
        .badge-item { display: inline-flex; align-items: center; gap: 4px; background: var(--bg-tertiary); padding: 4px 8px; border-radius: 12px; margin: 2px; font-size: 11px; color: var(--text-bright); }
        .mutual-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; cursor: pointer; font-size: 13px; color: var(--text-bright); }
        .mutual-item:hover { background: var(--bg-hover); }
        .mutual-avatar { width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: white; }
        .profile-dates { font-size: 12px; }
        .date-item { display: flex; justify-content: space-between; padding: 5px 0; color: var(--text-muted); }
        .date-item span:last-child { color: var(--text-bright); font-weight: 500; }
        .profile-actions { display: flex; gap: 8px; flex-wrap: wrap; padding-top: 8px; }
        .profile-actions .btn { flex: 1; min-width: 100px; }
    `;
    document.head.appendChild(style);
}

function setupProfileClicks() {
    document.getElementById('chat-box').addEventListener('click', function(e) {
        const usernameEl = e.target.closest('.message-username');
        if (usernameEl && usernameEl.onclick) return;
    });
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
        if ((userData.balance || 0) < 500) return showToast('Precisas de 500 🪙!', true);
        if (userData.nitro) return showToast('Já tens Nitro! ⭐', true);
        await db.collection('users').doc(currentUser.uid).update({
            nitro: true, balance: firebase.firestore.FieldValue.increment(-500)
        });
        showToast('Nitro ativado! ⭐');
        loadNitroPanel();
    } catch (error) { showToast('Erro.', true); }
}

async function buyEffect(effectType, price) {
    if (!currentUser) return;
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const userData = userDoc.data() || {};
        if ((userData.balance || 0) < price) return showToast('Precisas de ' + price + ' 🪙!', true);
        const effectId = 'effect_' + effectType;
        if ((userData.inventory || []).includes(effectId)) return showToast('Já tens este efeito!', true);
        await db.collection('users').doc(currentUser.uid).update({
            balance: firebase.firestore.FieldValue.increment(-price),
            inventory: firebase.firestore.FieldValue.arrayUnion(effectId)
        });
        showToast('Efeito comprado! ✨');
        loadNitroPanel();
    } catch (error) { showToast('Erro.', true); }
}

async function buyBadge(badgeType, price) {
    if (!currentUser) return;
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const userData = userDoc.data() || {};
        if ((userData.balance || 0) < price) return showToast('Precisas de ' + price + ' 🪙!', true);
        if ((userData.badges || []).includes(badgeType)) return showToast('Já tens este badge!', true);
        await db.collection('users').doc(currentUser.uid).update({
            balance: firebase.firestore.FieldValue.increment(-price),
            badges: firebase.firestore.FieldValue.arrayUnion(badgeType)
        });
        showToast('Badge comprado! 🏅');
        loadNitroPanel();
    } catch (error) { showToast('Erro.', true); }
}

async function dailyReward() {
    if (!currentUser) return;
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const userData = userDoc.data() || {};
        const now = new Date();
        const lastDaily = userData.lastDaily ? userData.lastDaily.toDate() : null;
        if (lastDaily && now.toDateString() === lastDaily.toDateString()) {
            return showToast('Já recebeste hoje! Volta amanhã.', true);
        }
        const reward = 50 + Math.floor(Math.random() * 51);
        await db.collection('users').doc(currentUser.uid).update({
            balance: firebase.firestore.FieldValue.increment(reward),
            lastDaily: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('🎁 Recebeste ' + reward + ' 🪙!');
        loadNitroPanel();
    } catch (error) { showToast('Erro.', true); }
}

// =============================================
// PAINEL DE MEMBROS
// =============================================

async function loadMembersPanel() {
    if (!currentServer) {
        document.getElementById('members-list').innerHTML = '<p style="color:var(--text-muted);">Seleciona um servidor.</p>';
        return;
    }
    try {
        const serverDoc = await db.collection('servers').doc(currentServer).get();
        if (!serverDoc.exists) return;
        const serverData = serverDoc.data();
        const members = serverData.members || [];
        document.getElementById('invite-code-display').textContent = (serverData.invites || []).slice(-1)[0] || 'Nenhum';
        const membersList = document.getElementById('members-list');
        membersList.innerHTML = '';
        for (const memberId of members) {
            const userDoc = await db.collection('users').doc(memberId).get();
            const userData = userDoc.data() || {};
            const memberElement = document.createElement('div');
            memberElement.className = 'list-item';
            memberElement.style.cursor = 'pointer';
            memberElement.onclick = () => openUserProfile(memberId);
            memberElement.innerHTML = `
                <div class="list-item-avatar" style="background:${stringToColor(userData.username || '?')};">${(userData.username||'?')[0]}</div>
                <div class="list-item-info">
                    <div class="list-item-name">${escapeHtml(userData.username||'?')} ${memberId===serverData.ownerId?'👑':''}</div>
                </div>`;
            membersList.appendChild(memberElement);
        }
        loadRolesList(serverData.roles || []);
    } catch (error) {}
}

function loadRolesList(roles) {
    const rolesList = document.getElementById('roles-list');
    if (!roles || roles.length === 0) {
        rolesList.innerHTML = '<p style="color:var(--text-muted);">Nenhum cargo.</p>';
        return;
    }
    rolesList.innerHTML = roles.map(r => `
        <div class="shop-item">
            <span style="color:${r.color};">● ${escapeHtml(r.name)}</span>
            <button class="btn btn-xs btn-primary" onclick="assignRoleToMember('${r.id}')">Atribuir</button>
        </div>`).join('');
}

async function generateInvite() {
    if (!currentServer) return showToast('Seleciona um servidor!', true);
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    await db.collection('servers').doc(currentServer).update({ invites: firebase.firestore.FieldValue.arrayUnion(code) });
    document.getElementById('invite-code-display').textContent = code;
    showToast('Convite: ' + code);
}

function copyInviteCode() {
    const code = document.getElementById('invite-code-display').textContent;
    if (code === 'Nenhum') return showToast('Gera um convite!', true);
    navigator.clipboard.writeText(code).then(() => showToast('Copiado! 📋'));
}

async function joinServerByInvite() {
    const code = document.getElementById('join-invite-code').value.trim().toUpperCase();
    if (!code) return showToast('Insere um código!', true);
    const snapshot = await db.collection('servers').where('invites', 'array-contains', code).limit(1).get();
    if (snapshot.empty) return showToast('Inválido!', true);
    const doc = snapshot.docs[0];
    if ((doc.data().members||[]).includes(currentUser.uid)) return showToast('Já estás!');
    await db.collection('servers').doc(doc.id).update({ members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) });
    document.getElementById('join-invite-code').value = '';
    showToast('Entraste! 🎉');
    loadServers();
}

async function addRole() {
    if (!currentServer) return showToast('Seleciona servidor!', true);
    const name = prompt('Nome do cargo:');
    if (!name) return;
    const color = prompt('Cor (ex: #ff0000):', '#6366f1');
    const roles = (await db.collection('servers').doc(currentServer).get()).data().roles || [];
    roles.push({ id: 'role_'+Date.now(), name, color });
    await db.collection('servers').doc(currentServer).update({ roles });
    loadMembersPanel();
}

async function assignRoleToMember(roleId) {
    const memberId = prompt('ID do membro:');
    if (!memberId) return;
    await db.collection('users').doc(memberId).update({ roles: firebase.firestore.FieldValue.arrayUnion(roleId) });
    showToast('Cargo atribuído!');
}

// =============================================
// PAINEL DE BOTS
// =============================================

function loadBotsPanel() { loadMyBots(); loadBotServerSelects(); }

function loadMyBots() {
    if (!currentUser) return;
    db.collection('bots').where('ownerId', '==', currentUser.uid).onSnapshot((snapshot) => {
        const botsList = document.getElementById('my-bots-list');
        botsList.innerHTML = '';
        if (snapshot.empty) { botsList.innerHTML = '<p style="color:var(--text-muted);">Nenhum bot.</p>'; return; }
        snapshot.forEach((doc) => {
            const bot = doc.data();
            const el = document.createElement('div');
            el.className = 'shop-item';
            el.innerHTML = `
                <div class="shop-item-info">
                    <div class="shop-item-name">🤖 ${escapeHtml(bot.name)}</div>
                    <div class="token-display" onclick="copyBotToken('${doc.id}',this)">${(bot.token||'').substring(0,15)}...<span class="copied-tooltip">Copiado!</span></div>
                </div>
                <div style="display:flex;gap:4px;">
                    <button class="btn btn-xs btn-primary" onclick="editBot('${doc.id}')">✏️</button>
                    <button class="btn btn-xs btn-danger" onclick="deleteBot('${doc.id}')">🗑️</button>
                </div>`;
            botsList.appendChild(el);
        });
    });
}

async function loadBotServerSelects() {
    const bs = document.getElementById('select-bot-to-add');
    const ss = document.getElementById('select-server-to-add');
    bs.innerHTML = '<option value="">Bot...</option>';
    ss.innerHTML = '<option value="">Servidor...</option>';
    const bots = await db.collection('bots').where('ownerId','==',currentUser.uid).get();
    bots.forEach(d => { const b=d.data(); bs.innerHTML+=`<option value="${d.id}" ${b.serverId?'disabled':''}>${b.name}</option>`; });
    const servers = await db.collection('servers').where('members','array-contains',currentUser.uid).get();
    servers.forEach(d => { ss.innerHTML+=`<option value="${d.id}">${d.data().name}</option>`; });
}

async function createBot() {
    const name = document.getElementById('new-bot-name').value.trim();
    if (!name) return showToast('Dá um nome!', true);
    const token = 'bot_' + Math.random().toString(36).substring(2,15);
    await db.collection('bots').add({ name, desc: document.getElementById('new-bot-desc').value.trim(), token, ownerId: currentUser.uid, active: true, serverId: null, commands: {}, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    document.getElementById('new-bot-name').value = '';
    document.getElementById('new-bot-desc').value = '';
    showToast('Bot criado! 🤖');
    loadBotsPanel();
}

async function addBotToServer() {
    const bid = document.getElementById('select-bot-to-add').value;
    const sid = document.getElementById('select-server-to-add').value;
    if (!bid||!sid) return showToast('Seleciona ambos!', true);
    await db.collection('bots').doc(bid).update({ serverId: sid });
    showToast('Adicionado!');
    loadBotsPanel();
}

async function editBot(id) {
    const name = prompt('Nome:');
    if (!name) return;
    const cmds = prompt('Comandos (!cmd=resp):');
    const commands = {};
    if (cmds) cmds.split(',').forEach(p => { const [c,r] = p.split('='); if(c&&r) commands[c.trim().toLowerCase()]=r.trim(); });
    await db.collection('bots').doc(id).update({ name, commands });
    showToast('Atualizado!');
}

async function deleteBot(id) { if (confirm('Apagar?')) { await db.collection('bots').doc(id).delete(); showToast('Apagado!'); } }

async function copyBotToken(id, el) {
    const doc = await db.collection('bots').doc(id).get();
    await navigator.clipboard.writeText(doc.data().token);
    const tt = el.querySelector('.copied-tooltip');
    if (tt) { tt.classList.add('show'); setTimeout(() => tt.classList.remove('show'), 1500); }
    showToast('Copiado! 📋');
}

// =============================================
// PAINEL DE DEFINIÇÕES
// =============================================

async function loadSettingsPanel() {
    if (!currentUser) return;
    const doc = await db.collection('users').doc(currentUser.uid).get();
    const d = doc.data() || {};
    document.getElementById('settings-username').value = d.username || '';
    document.getElementById('settings-bio').value = d.bio || '';
    const inv = d.inventory || [];
    const names = { 'effect_glow':'✨ Glow', 'effect_rainbow':'🌈 Arco-Íris', 'effect_crystal':'💎 Cristal', 'badge_vip':'💎 VIP', 'badge_og':'👑 OG', 'badge_botmaster':'🤖 Bot Master' };
    document.getElementById('inventory-list').innerHTML = inv.length ? inv.map(i => `<div style="padding:6px;background:var(--bg-tertiary);border-radius:4px;margin:2px;">${names[i]||i}</div>`).join('') : '<p style="color:var(--text-muted);">Vazio</p>';
}

async function saveProfile() {
    const name = document.getElementById('settings-username').value.trim();
    if (!name) return showToast('Nome obrigatório!', true);
    await currentUser.updateProfile({ displayName: name });
    await db.collection('users').doc(currentUser.uid).update({ username: name, bio: document.getElementById('settings-bio').value.trim() });
    document.getElementById('username-footer').textContent = name;
    showToast('Guardado! 💾');
}

function changeTheme(t) {
    const themes = {
        dark: {'--bg-primary':'#1a1b1e','--bg-secondary':'#1f2024','--bg-tertiary':'#2a2b30','--bg-card':'#25262b','--bg-input':'#1a1b20','--text-normal':'#e4e4e7','--text-muted':'#a1a1aa','--text-bright':'#ffffff'},
        light: {'--bg-primary':'#f4f4f5','--bg-secondary':'#ffffff','--bg-tertiary':'#e4e4e7','--bg-card':'#fafafa','--bg-input':'#ffffff','--text-normal':'#18181b','--text-muted':'#71717a','--text-bright':'#09090b'},
        midnight: {'--bg-primary':'#09090b','--bg-secondary':'#0f0f14','--bg-tertiary':'#1a1a24','--bg-card':'#12121a','--bg-input':'#0a0a10','--text-normal':'#d4d4d8','--text-muted':'#71717a','--text-bright':'#fafafa'}
    };
    for (const [p,v] of Object.entries(themes[t]||themes.dark)) document.documentElement.style.setProperty(p,v);
    showToast('Tema: ' + t);
}

// =============================================
// MODAIS
// =============================================

function showServerModal() { document.getElementById('server-modal').style.display = 'flex'; document.getElementById('server-name').focus(); }
function showChannelModal() { if (!currentServer) return showToast('Seleciona servidor!', true); document.getElementById('channel-modal').style.display = 'flex'; document.getElementById('channel-name').focus(); }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

async function createServer() {
    const name = document.getElementById('server-name').value.trim();
    if (!name || !currentUser) return;
    const ref = await db.collection('servers').add({ name, ownerId: currentUser.uid, members: [currentUser.uid], invites: [], roles: [], createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    await db.collection('servers').doc(ref.id).collection('channels').add({ name: 'geral', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    closeModal('server-modal');
    document.getElementById('server-name').value = '';
    showToast('Servidor criado! 🎉');
}

async function createChannel() {
    const name = document.getElementById('channel-name').value.trim();
    if (!name || !currentServer) return;
    await db.collection('servers').doc(currentServer).collection('channels').add({ name, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    closeModal('channel-modal');
    document.getElementById('channel-name').value = '';
    showToast('Canal criado!');
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
    toast.className = 'toast' + (isError ? ' error' : '');
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
    return text;
}

// =============================================
// EVENT LISTENERS
// =============================================

document.getElementById('server-modal').addEventListener('click', function(e) { if (e.target === this) closeModal('server-modal'); });
document.getElementById('channel-modal').addEventListener('click', function(e) { if (e.target === this) closeModal('channel-modal'); });
document.getElementById('msg-input').addEventListener('input', function() { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 100) + 'px'; });
document.getElementById('sidebar-overlay').addEventListener('click', function() { toggleSidebar(); });

document.addEventListener('click', function(e) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar.classList.contains('open')) return;
    if (window.innerWidth > 768) return;
    const clickedItem = e.target.closest('.server-item') || e.target.closest('.channel-item');
    if (clickedItem) setTimeout(() => toggleSidebar(), 150);
});

document.addEventListener('gesturestart', function(e) { e.preventDefault(); });

console.log('🐺 Cord - Rede Social Completa com Perfis - Inicializado!');
