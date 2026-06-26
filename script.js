// =============================================
// 🐺 CORD - REDE SOCIAL COMPLETA v2.0
// JavaScript Principal
// =============================================

// ============ INICIALIZAÇÃO FIREBASE ============
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
let currentFriendsTab = 'all';

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
    if (username.length < 3) { errorElement.textContent = 'Nome muito curto (mín. 3).'; errorElement.style.display = 'block'; return; }
    if (password.length < 6) { errorElement.textContent = 'Senha muito curta (mín. 6).'; errorElement.style.display = 'block'; return; }
    try {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        await cred.user.updateProfile({ displayName: username });
        await db.collection('users').doc(cred.user.uid).set({
            username, email, balance: 100, lastDaily: null, bio: '', inventory: [], friends: [],
            friendCode: generateFriendCode(), nitro: false, nitroExpiry: null, badges: [], roles: [],
            isOnline: true, createdAt: firebase.firestore.FieldValue.serverTimestamp(),
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
                username: user.displayName || 'Usuário Google', email: user.email,
                balance: 100, lastDaily: null, bio: '', inventory: [], friends: [],
                friendCode: generateFriendCode(), nitro: false, badges: [], roles: [],
                isOnline: true, createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            await db.collection('users').doc(user.uid).update({ lastSeen: firebase.firestore.FieldValue.serverTimestamp(), isOnline: true });
        }
    } catch (error) { showToast('Erro ao entrar com Google.', true); }
}

function logout() {
    if (currentUser) db.collection('users').doc(currentUser.uid).update({ isOnline: false, lastSeen: firebase.firestore.FieldValue.serverTimestamp() });
    if (unsubMessages) { unsubMessages(); unsubMessages = null; }
    currentServer = null; currentChannel = null; activeDM = null;
    auth.signOut();
}

function translateAuthError(code) {
    const m = {
        'auth/user-not-found': 'Email não encontrado.', 'auth/wrong-password': 'Senha incorreta.',
        'auth/email-already-in-use': 'Email já registado.', 'auth/invalid-email': 'Email inválido.',
        'auth/weak-password': 'Senha fraca (mín. 6).', 'auth/too-many-requests': 'Muitas tentativas.',
        'auth/network-request-failed': 'Erro de rede.'
    };
    return m[code] || 'Erro. Tenta novamente.';
}

function generateFriendCode() { return Math.floor(1000 + Math.random() * 9000); }

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
        loadDMPanels();
        addProfileStyles();
        try { await db.collection('users').doc(user.uid).update({ isOnline: true, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }); } catch (e) {}
    } else {
        currentUser = null;
        document.getElementById('auth-container').style.display = 'flex';
        document.getElementById('app-container').style.display = 'none';
        if (unsubMessages) { unsubMessages(); unsubMessages = null; }
        currentServer = null; currentChannel = null; activeDM = null;
    }
});

function updateUserInterface(user) {
    const displayName = user.displayName || user.email.split('@')[0];
    const initial = displayName[0].toUpperCase();
    const avatarColor = stringToColor(displayName);
    ['avatar-top', 'avatar-footer'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.textContent = initial; el.style.background = avatarColor; }
    });
    document.getElementById('username-footer').textContent = displayName;
    document.getElementById('topbar-title').textContent = displayName;
}

// =============================================
// NAVEGAÇÃO DE VIEWS
// =============================================

function switchView(view) {
    currentView = view;
    document.querySelectorAll('.view-container').forEach(el => el.style.display = 'none');
    const selectedView = document.getElementById(view + '-view');
    if (selectedView) selectedView.style.display = view === 'chat' ? 'flex' : 'block';
    
    // Atualizar navegação rápida
    document.querySelectorAll('.quick-nav-item').forEach(item => item.classList.remove('active'));
    const navItem = document.querySelector(`[data-nav="${view}"]`);
    if (navItem) navItem.classList.add('active');
    
    // Atualizar header da sidebar
    if (currentServer && view === 'chat') {
        document.getElementById('sidebar-server-name').textContent = '🐺 ' + (getServerName(currentServer) || 'Servidor');
    }
    
    switch (view) {
        case 'friends': loadFriendsPanel(); break;
        case 'dashboard': loadBotsPanel(); break;
        case 'nitro': loadNitroPanel(); break;
        case 'members': loadMembersPanel(); break;
        case 'settings': loadSettingsPanel(); break;
    }
}

async function getServerName(serverId) {
    try {
        const doc = await db.collection('servers').doc(serverId).get();
        return doc.exists ? doc.data().name : null;
    } catch (e) { return null; }
}

function loadAllPanels() {
    loadFriendsPanel();
    loadBotsPanel();
    loadNitroPanel();
    loadMembersPanel();
    loadSettingsPanel();
}

// =============================================
// SERVIDORES (NOVA INTERFACE)
// =============================================

function loadServers() {
    if (!currentUser) return;
    db.collection('servers').where('members', 'array-contains', currentUser.uid)
        .onSnapshot((snapshot) => {
            const serverIconsList = document.getElementById('server-icons-list');
            serverIconsList.innerHTML = '';
            
            // Botão Início
            const homeBtn = document.createElement('button');
            homeBtn.className = 'server-icon-btn' + (!currentServer ? ' active' : '');
            homeBtn.innerHTML = '🏠';
            homeBtn.title = 'Início';
            homeBtn.onclick = () => { currentServer = null; currentChannel = null; activeDM = null;
                document.getElementById('chat-box').innerHTML = '<div class="welcome-screen"><div class="welcome-icon">🐺</div><h2>Bem-vindo ao Cord!</h2><p>Seleciona um servidor à esquerda.</p></div>';
                document.getElementById('channel-list').innerHTML = '<p class="placeholder-text">Seleciona um servidor</p>';
                document.getElementById('sidebar-server-name').textContent = '🐺 Cord';
                document.getElementById('current-channel-name').textContent = 'Seleciona um canal';
                if (unsubMessages) { unsubMessages(); unsubMessages = null; }
                switchView('chat');
            };
            serverIconsList.appendChild(homeBtn);
            
            snapshot.forEach((doc) => {
                const server = doc.data();
                const btn = document.createElement('button');
                btn.className = 'server-icon-btn' + (currentServer === doc.id ? ' active' : '');
                btn.textContent = (server.name || 'S')[0].toUpperCase();
                btn.style.background = stringToColor(server.name);
                btn.title = server.name;
                btn.onclick = () => selectServer(doc.id, server.name);
                serverIconsList.appendChild(btn);
            });
        });
}

function selectServer(serverId, serverName) {
    currentServer = serverId;
    currentChannel = null;
    activeDM = null;
    document.getElementById('sidebar-server-name').textContent = '🐺 ' + serverName;
    document.getElementById('current-channel-name').textContent = 'Seleciona um canal';
    document.getElementById('channel-list').innerHTML = '<p class="placeholder-text">Carregando canais...</p>';
    document.getElementById('chat-box').innerHTML = `<div class="welcome-screen"><div class="welcome-icon">💬</div><h2>${escapeHtml(serverName)}</h2><p>Seleciona um canal para começar.</p></div>`;
    if (unsubMessages) { unsubMessages(); unsubMessages = null; }
    loadChannels(serverId);
    loadMembersSidePanel();
    switchView('chat');
    if (window.innerWidth <= 768) toggleSidebar();
}

function loadChannels(serverId) {
    db.collection('servers').doc(serverId).collection('channels').orderBy('createdAt')
        .onSnapshot((snapshot) => {
            const channelList = document.getElementById('channel-list');
            channelList.innerHTML = '';
            if (snapshot.empty) { channelList.innerHTML = '<p class="placeholder-text">Nenhum canal. Cria um!</p>'; return; }
            snapshot.forEach((doc) => {
                const channel = doc.data();
                const div = document.createElement('div');
                div.className = 'channel-item';
                div.innerHTML = `<span class="hash-icon">#</span> ${escapeHtml(channel.name)}`;
                div.onclick = () => selectChannel(serverId, doc.id, channel.name);
                if (currentChannel === doc.id) div.classList.add('active');
                channelList.appendChild(div);
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
                chatBox.innerHTML = `<div class="welcome-screen"><div class="welcome-icon">📭</div><h2>#${escapeHtml(channelName)}</h2><p>Nenhuma mensagem. Sê o primeiro!</p></div>`;
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
    const welcomeScreen = chatBox.querySelector('.welcome-screen');
    if (welcomeScreen) chatBox.innerHTML = '';
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    messageDiv._messageData = msg;
    
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
    if (msg.timestamp) timeStr = msg.timestamp.toDate().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
    
    const reactions = msg.reactions || {};
    let reactionsHtml = '';
    Object.entries(reactions).forEach(([emoji, users]) => {
        const isActive = Array.isArray(users) && users.includes(currentUser?.uid);
        reactionsHtml += `<span class="reaction-badge ${isActive ? 'active' : ''}" onclick="toggleReaction('${msgId}', '${emoji}')">${emoji} ${(users||[]).length}</span>`;
    });
    if (reactionsHtml) reactionsHtml = `<div class="reactions-row">${reactionsHtml}</div>`;
    
    const clickableName = (msg.userId && msg.userId !== 'system')
        ? `<span class="message-username ${nitroNameClass}" onclick="openUserProfile('${msg.userId}')" title="Ver perfil">${escapeHtml(msg.autor)}</span>`
        : `<span class="message-username ${nitroNameClass}">${escapeHtml(msg.autor)}</span>`;
    
    messageDiv.innerHTML = `
        <div class="message-avatar" style="background: ${avatarColor};" onclick="openUserProfile('${msg.userId || ''}')">
            <div class="avatar-frame ${nitroFrameClass}"></div>${avatarLetter}
        </div>
        <div class="message-content">
            <div class="message-header">${clickableName}${badgesHtml}<span class="message-time">${timeStr}</span></div>
            <div class="message-text">${formatMessageText(escapeHtml(msg.texto))}</div>${reactionsHtml}
        </div>`;
    chatBox.appendChild(messageDiv);
}

async function sendMsg() {
    const input = document.getElementById('msg-input');
    const texto = input.value.trim();
    if (!texto || !currentUser) return;
    if (activeDM) { await sendDirectMessage(activeDM, texto); }
    else if (currentServer && currentChannel) { await sendChannelMessage(texto); }
    else { showToast('Seleciona um canal ou DM!', true); return; }
    input.value = ''; input.style.height = 'auto';
}

async function sendChannelMessage(texto) {
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const userData = userDoc.data() || {};
        await db.collection('servers').doc(currentServer).collection('channels').doc(currentChannel)
            .collection('messages').add({
                autor: currentUser.displayName || currentUser.email.split('@')[0], texto,
                userId: currentUser.uid, isBot: false, isSystem: false,
                hasNitro: userData.nitro || false, badges: userData.badges || [],
                reactions: {}, timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        handleCommands(texto);
    } catch (error) { showToast('Erro ao enviar.', true); }
}

function handleCommands(texto) {
    const lower = texto.toLowerCase().trim();
    const commands = {
        '!ping': () => sendSystemMessage('🏓 Pong!'),
        '!hora': () => sendSystemMessage('🕐 ' + new Date().toLocaleString('pt-PT')),
        '!dado': () => sendSystemMessage('🎲 ' + (Math.floor(Math.random()*6)+1)),
        '!moeda': () => sendSystemMessage('🪙 ' + (Math.random()>0.5?'Cara':'Coroa')),
        '!coins': async () => { const d = await db.collection('users').doc(currentUser.uid).get(); sendSystemMessage('💰 ' + ((d.data()||{}).balance||0) + ' 🪙'); },
        '!rank': async () => {
            const s = await db.collection('users').orderBy('balance','desc').limit(5).get();
            let m = '🏆 Ranking:'; s.forEach((d,i) => m += `\n${i+1}. ${d.data().username} - ${d.data().balance||0} 🪙`);
            sendSystemMessage(m);
        },
        '!help': () => sendSystemMessage('📖 Comandos: !ping !hora !dado !moeda !coins !rank !serverinfo !help')
    };
    if (commands[lower]) commands[lower]();
    checkCustomBots(texto);
}

async function checkCustomBots(texto) {
    if (!currentServer) return;
    const bots = await db.collection('bots').where('servers', 'array-contains', currentServer).where('active','==',true).get();
    const lower = texto.toLowerCase().trim();
    bots.forEach(d => {
        const b = d.data();
        if (b.commands && b.commands[lower]) setTimeout(() => sendBotMessage(b.commands[lower], b.name, d.id), 300);
    });
}

function sendSystemMessage(t) {
    if (!currentServer || !currentChannel) return;
    db.collection('servers').doc(currentServer).collection('channels').doc(currentChannel)
        .collection('messages').add({ autor:'Sistema', texto:t, userId:'system', isBot:false, isSystem:true, hasNitro:false, badges:[], reactions:{}, timestamp:firebase.firestore.FieldValue.serverTimestamp() });
}

function sendBotMessage(t, n, bid) {
    if (!currentServer || !currentChannel) return;
    db.collection('servers').doc(currentServer).collection('channels').doc(currentChannel)
        .collection('messages').add({ autor:n, texto:t, userId:bid, isBot:true, isSystem:false, hasNitro:false, badges:[], reactions:{}, timestamp:firebase.firestore.FieldValue.serverTimestamp() });
}

async function toggleReaction(msgId, emoji) {
    if (!currentServer || !currentChannel || !currentUser) return;
    const ref = db.collection('servers').doc(currentServer).collection('channels').doc(currentChannel).collection('messages').doc(msgId);
    const doc = await ref.get();
    if (!doc.exists) return;
    const data = doc.data(), r = data.reactions || {};
    if (!r[emoji]) r[emoji] = [];
    const idx = r[emoji].indexOf(currentUser.uid);
    if (idx >= 0) r[emoji].splice(idx, 1); else r[emoji].push(currentUser.uid);
    if (r[emoji].length === 0) delete r[emoji];
    await ref.update({ reactions: r });
}

// =============================================
// MEMBROS LATERAL NO CHAT
// =============================================

function toggleMembersPanel() {
    const panel = document.getElementById('members-panel');
    panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
}

function showMembersPanel() {
    document.getElementById('members-panel').style.display = 'flex';
    loadMembersSidePanel();
}

async function loadMembersSidePanel() {
    if (!currentServer) return;
    const doc = await db.collection('servers').doc(currentServer).get();
    if (!doc.exists) return;
    const members = doc.data().members || [];
    const list = document.getElementById('members-side-list');
    list.innerHTML = '';
    for (const uid of members) {
        const u = await db.collection('users').doc(uid).get();
        const ud = u.data() || {};
        const div = document.createElement('div');
        div.className = 'member-side-item';
        div.onclick = () => openUserProfile(uid);
        div.innerHTML = `<div class="member-side-avatar" style="background:${stringToColor(ud.username||uid)};">${(ud.username||'?')[0]}</div><span>${escapeHtml(ud.username||'?')}</span>${uid===doc.data().ownerId?' 👑':''}`;
        list.appendChild(div);
    }
}

// =============================================
// AMIGOS E DM
// =============================================

function switchFriendsTab(tab) {
    currentFriendsTab = tab;
    document.querySelectorAll('#friends-view .panel-tab').forEach(t => t.classList.remove('active'));
    event?.target?.classList.add('active');
    loadFriendsPanel();
}

async function loadFriendsPanel() {
    if (!currentUser) return;
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    const userData = userDoc.data() || {};
    const friends = userData.friends || [];
    document.getElementById('my-friend-code').textContent = '#' + (userData.friendCode || '----');
    
    const friendsList = document.getElementById('friends-list');
    friendsList.innerHTML = '';
    
    // Filtrar por tab
    let filteredFriends = friends;
    if (currentFriendsTab === 'online') {
        // Simplificado: mostra todos por enquanto
        filteredFriends = friends;
    }
    
    if (currentFriendsTab === 'add') {
        document.getElementById('friends-add-card').style.display = 'block';
    } else {
        document.getElementById('friends-add-card').style.display = 'none';
    }
    
    if (filteredFriends.length === 0) {
        friendsList.innerHTML = '<p class="placeholder-text">Nenhum amigo encontrado.</p>';
    } else {
        for (const fid of filteredFriends) {
            const fDoc = await db.collection('users').doc(fid).get();
            const fd = fDoc.data() || {};
            const div = document.createElement('div');
            div.className = 'list-item';
            div.innerHTML = `
                <div class="list-item-avatar" style="background:${stringToColor(fd.username||'?')};" onclick="openUserProfile('${fid}')">${(fd.username||'?')[0]}</div>
                <div class="list-item-info" onclick="openUserProfile('${fid}')">
                    <div class="list-item-name">${escapeHtml(fd.username||'?')}</div>
                    <div class="list-item-sub">${fd.isOnline ? '🟢 Online' : '⚫ Offline'} ${fd.nitro?'⭐':''}</div>
                </div>
                <div class="list-item-actions">
                    <button class="btn btn-xs btn-primary" onclick="openDM('${fid}')">💬</button>
                    <button class="btn btn-xs btn-danger" onclick="removeFriend('${fid}')">❌</button>
                </div>`;
            friendsList.appendChild(div);
        }
    }
    loadDMList(friends);
}

async function loadDMList(friends) {
    const dmList = document.getElementById('dm-list');
    const dmChannelsList = document.getElementById('dm-channels-list');
    dmList.innerHTML = '';
    if (dmChannelsList) dmChannelsList.innerHTML = '';
    if (!friends || friends.length === 0) {
        dmList.innerHTML = '<p class="placeholder-text">Adiciona amigos.</p>';
        return;
    }
    for (const fid of friends) {
        const fDoc = await db.collection('users').doc(fid).get();
        const fd = fDoc.data() || {};
        const div = document.createElement('div');
        div.className = 'list-item';
        div.onclick = () => openDM(fid);
        div.innerHTML = `<div class="list-item-avatar" style="background:${stringToColor(fd.username||'?')};">${(fd.username||'?')[0]}</div><div class="list-item-info"><div class="list-item-name">${escapeHtml(fd.username||'?')}</div></div>`;
        dmList.appendChild(div);
        
        if (dmChannelsList) {
            const chDiv = document.createElement('div');
            chDiv.className = 'channel-item';
            chDiv.innerHTML = `💬 ${escapeHtml(fd.username||'?')}`;
            chDiv.onclick = () => openDM(fid);
            dmChannelsList.appendChild(chDiv);
        }
    }
}

function loadDMPanels() { if (currentUser) loadFriendsPanel(); }

async function addFriend() {
    const code = document.getElementById('friend-code-input').value.replace('#','').trim();
    const res = document.getElementById('add-friend-result');
    if (!code) { res.textContent = 'Insere um código.'; res.style.color='var(--red)'; return; }
    const snap = await db.collection('users').where('friendCode','==',parseInt(code)).limit(1).get();
    if (snap.empty) { res.textContent = 'Código inválido.'; res.style.color='var(--red)'; return; }
    const fid = snap.docs[0].id;
    if (fid === currentUser.uid) { res.textContent = 'Não podes adicionar-te!'; res.style.color='var(--red)'; return; }
    const uDoc = await db.collection('users').doc(currentUser.uid).get();
    if ((uDoc.data().friends||[]).includes(fid)) { res.textContent = 'Já são amigos!'; res.style.color='var(--yellow)'; return; }
    await db.collection('users').doc(currentUser.uid).update({ friends: firebase.firestore.FieldValue.arrayUnion(fid) });
    await db.collection('users').doc(fid).update({ friends: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) });
    res.textContent = '✅ Adicionado!'; res.style.color='var(--green)';
    document.getElementById('friend-code-input').value = '';
    showToast('Amigo adicionado! 🎉');
    loadFriendsPanel();
}

function openDM(friendId) {
    activeDM = friendId; currentChannel = null;
    if (unsubMessages) unsubMessages();
    const dmId = [currentUser.uid, friendId].sort().join('_');
    document.getElementById('current-channel-name').textContent = '💬 DM';
    document.getElementById('sidebar-server-name').textContent = '💬 Mensagem Privada';
    unsubMessages = db.collection('dms').doc(dmId).collection('messages').orderBy('timestamp','asc')
        .onSnapshot(s => {
            const box = document.getElementById('chat-box');
            box.innerHTML = '';
            if (s.empty) { box.innerHTML = '<div class="welcome-screen"><div class="welcome-icon">💬</div><h2>Conversa Privada</h2><p>Escreve algo!</p></div>'; return; }
            s.forEach(d => renderMessage(d.data(), d.id));
            box.scrollTop = box.scrollHeight;
        });
    switchView('chat');
}

async function sendDirectMessage(fid, texto) {
    const uDoc = await db.collection('users').doc(currentUser.uid).get();
    const dmId = [currentUser.uid, fid].sort().join('_');
    await db.collection('dms').doc(dmId).collection('messages').add({
        autor: currentUser.displayName || currentUser.email.split('@')[0], texto, userId: currentUser.uid,
        hasNitro: (uDoc.data()||{}).nitro||false, badges: (uDoc.data()||{}).badges||[],
        reactions: {}, timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
}

async function removeFriend(fid) {
    if (!confirm('Remover amigo?')) return;
    await db.collection('users').doc(currentUser.uid).update({ friends: firebase.firestore.FieldValue.arrayRemove(fid) });
    await db.collection('users').doc(fid).update({ friends: firebase.firestore.FieldValue.arrayRemove(currentUser.uid) });
    showToast('Amigo removido.');
    loadFriendsPanel();
}

// =============================================
// PERFIS
// =============================================

async function openUserProfile(userId) {
    if (!userId || userId === 'system') return;
    currentProfileUserId = userId;
    const doc = await db.collection('users').doc(userId).get();
    if (!doc.exists) { showToast('Utilizador não encontrado.', true); return; }
    const data = doc.data();
    const isOwn = userId === currentUser?.uid;
    const isFriend = (data.friends || []).includes(currentUser?.uid);
    showProfileModal(buildProfileHTML(data, userId, isOwn, isFriend));
    loadProfileBadges(userId, data);
    loadMutualFriends(userId, data);
    loadMutualServers(userId, data);
}

function buildProfileHTML(data, userId, isOwn, isFriend) {
    const username = data.username || '?';
    const bio = data.bio || 'Sem bio.';
    const nitro = data.nitro || false;
    const balance = data.balance || 0;
    const friendCode = data.friendCode || '----';
    const created = data.createdAt ? formatDate(data.createdAt.toDate()) : '?';
    const seen = data.lastSeen ? formatLastSeen(data.lastSeen.toDate()) : '?';
    const color = stringToColor(username);
    
    let btns = '';
    if (isOwn) btns = '<button class="btn btn-sm btn-primary" onclick="closeProfileModal();switchView(\'settings\');">✏️ Editar</button>';
    else if (isFriend) btns = `<button class="btn btn-sm btn-primary" onclick="openDM('${userId}');closeProfileModal();">💬 DM</button><button class="btn btn-sm btn-danger" onclick="removeFriend('${userId}');closeProfileModal();">❌ Remover</button>`;
    else btns = `<button class="btn btn-sm btn-primary" onclick="addFriendById('${userId}');">➕ Adicionar</button>`;
    
    return `
        <div class="profile-modal-content">
            <div class="profile-header" style="background:linear-gradient(180deg,${color} 0%,var(--bg-secondary) 70%);">
                <div class="profile-avatar-container">
                    <div class="profile-avatar" style="background:${color};">${username[0]}</div>
                    <div class="profile-status-dot ${data.isOnline?'online':'offline'}"></div>
                </div>
                <h2 class="profile-username ${nitro?'nitro-name':''}">${escapeHtml(username)}</h2>
            </div>
            <div class="profile-body">
                <div class="profile-section"><h4>📝 Bio</h4><p>${escapeHtml(bio)}</p></div>
                <div class="profile-section"><h4>📊 Stats</h4><div class="profile-stats"><div class="stat-item"><span class="stat-icon">💰</span><span class="stat-value">${balance}</span><span class="stat-label">Coins</span></div><div class="stat-item"><span class="stat-icon">#</span><span class="stat-value">${friendCode}</span><span class="stat-label">Código</span></div></div></div>
                <div class="profile-section"><h4>🏅 Badges</h4><div id="profile-badges-list">...</div></div>
                <div class="profile-section"><h4>👥 Amigos em Comum</h4><div id="profile-mutual-friends">...</div></div>
                <div class="profile-section"><h4>🌐 Servidores em Comum</h4><div id="profile-mutual-servers">...</div></div>
                <div class="profile-section"><h4>📅 Datas</h4><div class="profile-dates"><div class="date-item"><span>📆 Membro desde:</span><span>${created}</span></div><div class="date-item"><span>🟢 Visto:</span><span>${seen}</span></div></div></div>
                <div class="profile-actions">${btns}</div>
            </div>
        </div>`;
}

function showProfileModal(content) {
    let modal = document.getElementById('profile-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'profile-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = '<div class="modal profile-modal-wrapper"><button class="profile-close-btn" onclick="closeProfileModal()">✕</button><div id="profile-modal-content"></div></div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) closeProfileModal(); });
    }
    document.getElementById('profile-modal-content').innerHTML = content;
    modal.style.display = 'flex';
}

function closeProfileModal() {
    const modal = document.getElementById('profile-modal');
    if (modal) modal.style.display = 'none';
    currentProfileUserId = null;
}

async function loadProfileBadges(uid, data) {
    const el = document.getElementById('profile-badges-list');
    if (!el) return;
    const badges = [];
    if (data.nitro) badges.push('⭐ Nitro');
    if ((data.badges||[]).includes('vip')) badges.push('💎 VIP');
    if ((data.badges||[]).includes('og')) badges.push('👑 OG');
    if ((data.inventory||[]).includes('effect_glow')) badges.push('✨ Glow');
    el.innerHTML = badges.length ? badges.map(b => `<span class="badge-item">${b}</span>`).join(' ') : '<span style="color:var(--text-muted);font-size:11px;">Nenhum.</span>';
}

async function loadMutualFriends(uid, data) {
    const el = document.getElementById('profile-mutual-friends');
    if (!el || !currentUser) return;
    const myDoc = await db.collection('users').doc(currentUser.uid).get();
    const mutual = (data.friends||[]).filter(f => (myDoc.data().friends||[]).includes(f));
    if (!mutual.length) { el.innerHTML = '<span style="color:var(--text-muted);font-size:11px;">Nenhum.</span>'; return; }
    let html = '';
    for (const fid of mutual.slice(0,5)) {
        const f = await db.collection('users').doc(fid).get();
        const fd = f.data()||{};
        html += `<div class="mutual-item" onclick="openUserProfile('${fid}');closeProfileModal();"><div class="mutual-avatar" style="background:${stringToColor(fd.username||'?')};">${(fd.username||'?')[0]}</div><span>${escapeHtml(fd.username||'?')}</span></div>`;
    }
    el.innerHTML = html;
}

async function loadMutualServers(uid, data) {
    const el = document.getElementById('profile-mutual-servers');
    if (!el || !currentUser) return;
    const targetSnap = await db.collection('servers').where('members','array-contains',uid).get();
    const targetIds = targetSnap.docs.map(d=>d.id);
    const mySnap = await db.collection('servers').where('members','array-contains',currentUser.uid).get();
    const mutual = mySnap.docs.filter(d=>targetIds.includes(d.id));
    if (!mutual.length) { el.innerHTML = '<span style="color:var(--text-muted);font-size:11px;">Nenhum.</span>'; return; }
    el.innerHTML = mutual.slice(0,5).map(d => `<div class="mutual-item" onclick="selectServer('${d.id}','${escapeHtml(d.data().name)}');closeProfileModal();"><span class="server-dot" style="background:var(--green);"></span>${escapeHtml(d.data().name)}</div>`).join('');
}

async function addFriendById(fid) {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    if ((doc.data().friends||[]).includes(fid)) { showToast('Já são amigos!'); return; }
    await db.collection('users').doc(currentUser.uid).update({ friends: firebase.firestore.FieldValue.arrayUnion(fid) });
    await db.collection('users').doc(fid).update({ friends: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) });
    showToast('Amigo adicionado! 🎉');
    closeProfileModal();
    loadFriendsPanel();
}

function formatDate(d) { const m=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']; return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()}`; }
function formatLastSeen(d) { const diff=Math.floor((new Date()-d)/1000); if(diff<60)return 'Agora'; if(diff<3600)return `Há ${Math.floor(diff/60)}min`; if(diff<86400)return `Há ${Math.floor(diff/3600)}h`; return formatDate(d); }
function addProfileStyles() {
    if (document.getElementById('profile-styles')) return;
    const s = document.createElement('style'); s.id='profile-styles';
    s.textContent = `.profile-modal-wrapper{max-width:500px;padding:0;overflow:hidden;max-height:90vh;overflow-y:auto;}.profile-close-btn{position:absolute;top:12px;right:12px;z-index:10;background:rgba(0,0,0,0.5);color:#fff;border:none;width:32px;height:32px;border-radius:50%;cursor:pointer;}.profile-header{padding:30px 20px 20px;text-align:center;}.profile-avatar{width:80px;height:80px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:700;color:#fff;border:4px solid var(--bg-secondary);margin:0 auto;}.profile-status-dot{position:absolute;bottom:2px;right:2px;width:16px;height:16px;border-radius:50%;border:3px solid var(--bg-secondary);}.profile-status-dot.online{background:var(--green);}.profile-status-dot.offline{background:#747f8d;}.profile-username{font-size:22px;font-weight:700;color:var(--text-bright);margin-top:8px;}.profile-body{padding:16px 20px;}.profile-section{margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid var(--border-subtle);}.profile-section h4{font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:8px;}.profile-stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;}.stat-item{background:var(--bg-tertiary);border-radius:8px;padding:10px;text-align:center;}.stat-value{font-size:16px;font-weight:700;color:var(--text-bright);}.badge-item{display:inline-flex;align-items:center;gap:4px;background:var(--bg-tertiary);padding:4px 8px;border-radius:12px;margin:2px;font-size:11px;}.mutual-item{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;font-size:13px;}.mutual-item:hover{background:var(--bg-hover);}.mutual-avatar{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;}.date-item{display:flex;justify-content:space-between;padding:5px 0;color:var(--text-muted);font-size:12px;}.date-item span:last-child{color:var(--text-bright);font-weight:500;}.profile-actions{display:flex;gap:8px;flex-wrap:wrap;padding-top:8px;}`;
    document.head.appendChild(s);
}

// =============================================
// NITRO E LOJA
// =============================================

async function loadNitroPanel() {
    if (!currentUser) return;
    const doc = await db.collection('users').doc(currentUser.uid).get();
    const data = doc.data() || {};
    document.getElementById('nitro-balance').textContent = data.balance || 0;
    
    document.getElementById('profile-effects').innerHTML = `
        <div class="shop-item"><div class="shop-item-info"><div class="shop-item-name">✨ Glow</div></div><span class="shop-item-price">300 🪙</span><button class="btn btn-xs btn-primary" onclick="buyEffect('glow',300)">Comprar</button></div>
        <div class="shop-item"><div class="shop-item-info"><div class="shop-item-name">🌈 Arco-Íris</div></div><span class="shop-item-price">400 🪙</span><button class="btn btn-xs btn-primary" onclick="buyEffect('rainbow',400)">Comprar</button></div>
        <div class="shop-item"><div class="shop-item-info"><div class="shop-item-name">💎 Cristal</div></div><span class="shop-item-price">600 🪙</span><button class="btn btn-xs btn-primary" onclick="buyEffect('crystal',600)">Comprar</button></div>`;
    
    document.getElementById('badges-shop').innerHTML = `
        <div class="shop-item"><div class="shop-item-info"><div class="shop-item-name">💎 VIP</div></div><span class="shop-item-price">800 🪙</span><button class="btn btn-xs btn-primary" onclick="buyBadge('vip',800)">Comprar</button></div>
        <div class="shop-item"><div class="shop-item-info"><div class="shop-item-name">👑 OG</div></div><span class="shop-item-price">1500 🪙</span><button class="btn btn-xs btn-primary" onclick="buyBadge('og',1500)">Comprar</button></div>
        <div class="shop-item"><div class="shop-item-info"><div class="shop-item-name">🤖 Bot Master</div></div><span class="shop-item-price">1000 🪙</span><button class="btn btn-xs btn-primary" onclick="buyBadge('botmaster',1000)">Comprar</button></div>`;
}

async function buyNitro() {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    if ((doc.data().balance||0) < 500) return showToast('Precisas de 500 🪙!', true);
    if (doc.data().nitro) return showToast('Já tens Nitro!', true);
    await db.collection('users').doc(currentUser.uid).update({ nitro: true, balance: firebase.firestore.FieldValue.increment(-500) });
    showToast('Nitro ativado! ⭐');
    loadNitroPanel();
}

async function buyEffect(type, price) {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    const data = doc.data() || {};
    if ((data.balance||0) < price) return showToast('Sem moedas!', true);
    if ((data.inventory||[]).includes('effect_'+type)) return showToast('Já tens!', true);
    await db.collection('users').doc(currentUser.uid).update({ balance: firebase.firestore.FieldValue.increment(-price), inventory: firebase.firestore.FieldValue.arrayUnion('effect_'+type) });
    showToast('Comprado! ✨');
    loadNitroPanel();
}

async function buyBadge(type, price) {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    const data = doc.data() || {};
    if ((data.balance||0) < price) return showToast('Sem moedas!', true);
    if ((data.badges||[]).includes(type)) return showToast('Já tens!', true);
    await db.collection('users').doc(currentUser.uid).update({ balance: firebase.firestore.FieldValue.increment(-price), badges: firebase.firestore.FieldValue.arrayUnion(type) });
    showToast('Comprado! 🏅');
    loadNitroPanel();
}

async function dailyReward() {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    const data = doc.data() || {};
    const now = new Date();
    const last = data.lastDaily ? data.lastDaily.toDate() : null;
    if (last && now.toDateString() === last.toDateString()) return showToast('Já recebeste hoje!', true);
    const reward = 50 + Math.floor(Math.random() * 51);
    await db.collection('users').doc(currentUser.uid).update({ balance: firebase.firestore.FieldValue.increment(reward), lastDaily: firebase.firestore.FieldValue.serverTimestamp() });
    showToast('🎁 +' + reward + ' 🪙!');
    loadNitroPanel();
}

// =============================================
// MEMBROS
// =============================================

async function loadMembersPanel() {
    if (!currentServer) { document.getElementById('members-list').innerHTML = '<p class="placeholder-text">Seleciona um servidor.</p>'; return; }
    const doc = await db.collection('servers').doc(currentServer).get();
    if (!doc.exists) return;
    const data = doc.data();
    const invites = data.invites || [];
    const link = invites.length > 0 ? `https://cord.app/invite/${invites[invites.length-1]}` : 'Nenhum convite gerado';
    document.getElementById('invite-link-display').textContent = link;
    
    const members = data.members || [];
    const list = document.getElementById('members-list');
    list.innerHTML = '';
    for (const uid of members) {
        const u = await db.collection('users').doc(uid).get();
        const ud = u.data() || {};
        const div = document.createElement('div');
        div.className = 'list-item';
        div.onclick = () => openUserProfile(uid);
        div.innerHTML = `<div class="list-item-avatar" style="background:${stringToColor(ud.username||uid)};">${(ud.username||'?')[0]}</div><div class="list-item-info"><div class="list-item-name">${escapeHtml(ud.username||'?')} ${uid===data.ownerId?'👑':''}</div></div>`;
        list.appendChild(div);
    }
    
    const roles = data.roles || [];
    const rolesList = document.getElementById('roles-list');
    rolesList.innerHTML = roles.length ? roles.map(r => `<div class="shop-item"><span style="color:${r.color};">● ${escapeHtml(r.name)}</span><button class="btn btn-xs btn-primary" onclick="assignRole('${r.id}')">Atribuir</button></div>`).join('') : '<p class="placeholder-text">Nenhum cargo.</p>';
}

async function generateInvite() {
    if (!currentServer) return showToast('Seleciona servidor!', true);
    const code = Math.random().toString(36).substring(2,8).toUpperCase();
    await db.collection('servers').doc(currentServer).update({ invites: firebase.firestore.FieldValue.arrayUnion(code) });
    document.getElementById('invite-link-display').textContent = `https://cord.app/invite/${code}`;
    showToast('Convite: ' + code);
}

function copyInviteLink() {
    const link = document.getElementById('invite-link-display').textContent;
    if (link.includes('Nenhum')) return showToast('Gera um convite!', true);
    navigator.clipboard.writeText(link).then(() => showToast('Link copiado! 📋'));
}

async function joinServerByInvite() {
    const code = document.getElementById('join-invite-code').value.trim().toUpperCase();
    if (!code) return;
    const snap = await db.collection('servers').where('invites','array-contains',code).limit(1).get();
    if (snap.empty) return showToast('Inválido!', true);
    const doc = snap.docs[0];
    if ((doc.data().members||[]).includes(currentUser.uid)) return showToast('Já estás!');
    await db.collection('servers').doc(doc.id).update({ members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) });
    document.getElementById('join-invite-code').value = '';
    showToast('Entraste! 🎉');
    loadServers();
}

async function addRole() {
    if (!currentServer) return;
    const name = prompt('Nome do cargo:');
    if (!name) return;
    const color = prompt('Cor (ex: #ff0000):', '#6366f1');
    const doc = await db.collection('servers').doc(currentServer).get();
    const roles = (doc.data().roles||[]);
    roles.push({ id: 'role_'+Date.now(), name, color });
    await db.collection('servers').doc(currentServer).update({ roles });
    loadMembersPanel();
}

async function assignRole(rid) {
    const uid = prompt('ID do membro:');
    if (!uid) return;
    await db.collection('users').doc(uid).update({ roles: firebase.firestore.FieldValue.arrayUnion(rid) });
    showToast('Cargo atribuído!');
}

// =============================================
// DESCUBRIR SERVIDORES
// =============================================

function showDiscoverModal() {
    document.getElementById('discover-modal').style.display = 'flex';
    searchPublicServers();
}

async function searchPublicServers() {
    const query = (document.getElementById('discover-search')?.value || '').toLowerCase();
    const snap = await db.collection('servers').where('isPublic','==',true).limit(20).get();
    const results = document.getElementById('discover-results');
    results.innerHTML = '';
    
    let servers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (query) servers = servers.filter(s => s.name.toLowerCase().includes(query));
    
    if (!servers.length) { results.innerHTML = '<p class="placeholder-text">Nenhum servidor encontrado.</p>'; return; }
    
    servers.forEach(s => {
        const div = document.createElement('div');
        div.className = 'shop-item';
        div.innerHTML = `<div class="shop-item-info"><div class="shop-item-name">${escapeHtml(s.name)}</div><div class="shop-item-desc">${(s.members||[]).length} membros</div></div><button class="btn btn-xs btn-primary" onclick="joinPublicServer('${s.id}')">Entrar</button>`;
        results.appendChild(div);
    });
}

async function joinPublicServer(serverId) {
    const doc = await db.collection('servers').doc(serverId).get();
    if (!doc.exists) return;
    if ((doc.data().members||[]).includes(currentUser.uid)) return showToast('Já estás!');
    await db.collection('servers').doc(serverId).update({ members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) });
    showToast('Entraste! 🎉');
    closeModal('discover-modal');
    loadServers();
}

// =============================================
// BOTS (SISTEMA MELHORADO)
// =============================================

function loadBotsPanel() { loadMyBots(); loadBotServerSelects(); }

function loadMyBots() {
    if (!currentUser) return;
    db.collection('bots').where('ownerId','==',currentUser.uid).onSnapshot(snap => {
        const list = document.getElementById('my-bots-list');
        list.innerHTML = '';
        if (snap.empty) { list.innerHTML = '<p class="placeholder-text">Nenhum bot.</p>'; return; }
        snap.forEach(doc => {
            const bot = doc.data();
            const serversCount = (bot.servers || []).length;
            const div = document.createElement('div');
            div.className = 'shop-item';
            div.innerHTML = `
                <div class="shop-item-info">
                    <div class="shop-item-name">🤖 ${escapeHtml(bot.name)}</div>
                    <div class="shop-item-desc">🟢 Ativo • ${serversCount} servidor(es)</div>
                    <div class="token-display" onclick="copyBotToken('${doc.id}',this)">${(bot.token||'').substring(0,15)}...<span class="copied-tooltip">Copiado!</span></div>
                </div>
                <div style="display:flex;gap:4px;">
                    <button class="btn btn-xs btn-primary" onclick="editBot('${doc.id}')">✏️</button>
                    <button class="btn btn-xs btn-danger" onclick="deleteBot('${doc.id}')">🗑️</button>
                </div>`;
            list.appendChild(div);
        });
    });
}

async function loadBotServerSelects() {
    const bs = document.getElementById('select-bot-to-add');
    const ss = document.getElementById('select-server-to-add');
    bs.innerHTML = '<option value="">Seleciona um bot...</option>';
    ss.innerHTML = '<option value="">Seleciona um servidor...</option>';
    const bots = await db.collection('bots').where('ownerId','==',currentUser.uid).get();
    bots.forEach(d => { const b=d.data(); bs.innerHTML += `<option value="${d.id}">${b.name} (${(b.servers||[]).length} servidores)</option>`; });
    const servers = await db.collection('servers').where('members','array-contains',currentUser.uid).get();
    servers.forEach(d => { ss.innerHTML += `<option value="${d.id}">${d.data().name}</option>`; });
}

async function createBot() {
    const name = document.getElementById('new-bot-name').value.trim();
    if (!name) return showToast('Dá um nome!', true);
    const desc = document.getElementById('new-bot-desc').value.trim();
    const prefix = document.getElementById('new-bot-prefix').value.trim() || '!';
    const token = 'bot_' + Math.random().toString(36).substring(2,15) + Math.random().toString(36).substring(2,10);
    await db.collection('bots').add({
        name, desc, token, prefix, ownerId: currentUser.uid, active: true,
        servers: [], commands: {}, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    document.getElementById('new-bot-name').value = '';
    document.getElementById('new-bot-desc').value = '';
    showToast('Bot criado! 🤖 Token: ' + token.substring(0,15) + '...');
    loadBotsPanel();
}

async function addBotToServer() {
    const botId = document.getElementById('select-bot-to-add').value;
    const serverId = document.getElementById('select-server-to-add').value;
    if (!botId || !serverId) return showToast('Seleciona ambos!', true);
    
    // Adicionar servidor à lista do bot
    const botDoc = await db.collection('bots').doc(botId).get();
    const botData = botDoc.data() || {};
    const servers = botData.servers || [];
    if (servers.includes(serverId)) return showToast('Bot já está neste servidor!');
    
    await db.collection('bots').doc(botId).update({
        servers: firebase.firestore.FieldValue.arrayUnion(serverId),
        serverId: serverId // compatibilidade com versão antiga
    });
    
    // Mensagem no canal geral
    const chSnap = await db.collection('servers').doc(serverId).collection('channels').limit(1).get();
    if (!chSnap.empty) {
        await db.collection('servers').doc(serverId).collection('channels').doc(chSnap.docs[0].id)
            .collection('messages').add({
                autor: 'Sistema', texto: `🤖 O bot **${botData.name}** entrou no servidor!`,
                userId: 'system', isBot: false, isSystem: true, hasNitro: false,
                badges: [], reactions: {}, timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
    }
    
    showToast('Bot adicionado! 🎉');
    loadBotsPanel();
    loadBotServerList(botId);
}

async function loadBotServerList(botId) {
    const doc = await db.collection('bots').doc(botId).get();
    const servers = (doc.data()||{}).servers || [];
    const list = document.getElementById('bot-servers-list');
    if (!list) return;
    list.innerHTML = '<b>Servidores do bot:</b><br>';
    if (!servers.length) { list.innerHTML += 'Nenhum servidor.'; return; }
    for (const sid of servers) {
        const s = await db.collection('servers').doc(sid).get();
        list.innerHTML += `<div>• ${escapeHtml((s.data()||{}).name||sid)}</div>`;
    }
}

async function editBot(id) {
    const name = prompt('Nome:');
    if (!name) return;
    const cmds = prompt('Comandos (formato: !cmd=resposta, separados por vírgula):\nEx: !ola=Olá!, !adeus=Até logo!');
    const commands = {};
    if (cmds) cmds.split(',').forEach(p => { const [c,r] = p.split('='); if(c&&r) commands[c.trim().toLowerCase()]=r.trim(); });
    await db.collection('bots').doc(id).update({ name, commands });
    showToast('Atualizado! ✏️');
}

async function deleteBot(id) {
    if (!confirm('Apagar bot?')) return;
    await db.collection('bots').doc(id).delete();
    showToast('Apagado! 🗑️');
}

async function copyBotToken(id, el) {
    const doc = await db.collection('bots').doc(id).get();
    await navigator.clipboard.writeText(doc.data().token);
    const tt = el.querySelector('.copied-tooltip');
    if (tt) { tt.classList.add('show'); setTimeout(() => tt.classList.remove('show'), 1500); }
    showToast('Token copiado! 📋');
}

function copyCodeExample() {
    const code = document.getElementById('code-example').textContent;
    navigator.clipboard.writeText(code).then(() => showToast('Código copiado! 📋'));
}

// =============================================
// DEFINIÇÕES
// =============================================

async function loadSettingsPanel() {
    if (!currentUser) return;
    const doc = await db.collection('users').doc(currentUser.uid).get();
    const data = doc.data() || {};
    document.getElementById('settings-username').value = data.username || '';
    document.getElementById('settings-bio').value = data.bio || '';
    const inv = data.inventory || [];
    const names = { 'effect_glow':'✨ Glow', 'effect_rainbow':'🌈 Arco-Íris', 'effect_crystal':'💎 Cristal' };
    document.getElementById('inventory-list').innerHTML = inv.length ? inv.map(i => `<div style="padding:6px;background:var(--bg-tertiary);border-radius:4px;margin:2px;font-size:12px;">${names[i]||i}</div>`).join('') : '<p class="placeholder-text">Vazio.</p>';
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
        dark: {'--bg-primary':'#1a1b1e','--bg-secondary':'#1f2024','--bg-tertiary':'#2a2b30','--text-normal':'#e4e4e7','--text-muted':'#a1a1aa','--text-bright':'#fff'},
        light: {'--bg-primary':'#f4f4f5','--bg-secondary':'#fff','--bg-tertiary':'#e4e4e7','--text-normal':'#18181b','--text-muted':'#71717a','--text-bright':'#09090b'},
        midnight: {'--bg-primary':'#09090b','--bg-secondary':'#0f0f14','--bg-tertiary':'#1a1a24','--text-normal':'#d4d4d8','--text-muted':'#71717a','--text-bright':'#fafafa'},
        ocean: {'--bg-primary':'#0c1929','--bg-secondary':'#112240','--bg-tertiary':'#1a365d','--text-normal':'#ccd6f6','--text-muted':'#8892b0','--text-bright':'#e6f1ff'}
    };
    const th = themes[t] || themes.dark;
    for (const [p,v] of Object.entries(th)) document.documentElement.style.setProperty(p,v);
    showToast('Tema: ' + t);
}

// =============================================
// MODAIS
// =============================================

function showServerModal() { document.getElementById('server-modal').style.display = 'flex'; }
function showChannelModal() { if (!currentServer) return showToast('Seleciona servidor!', true); document.getElementById('channel-modal').style.display = 'flex'; }
function showServerSettings() { if (currentServer) switchView('members'); }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

async function createServer() {
    const name = document.getElementById('server-name').value.trim();
    const template = document.getElementById('server-template').value;
    if (!name) return;
    const templates = {
        default: ['geral'],
        gaming: ['geral', 'jogos', 'clips', 'eventos'],
        study: ['geral', 'duvidas', 'recursos', 'anuncios'],
        art: ['geral', 'arte', 'feedback', 'comissoes']
    };
    const channels = templates[template] || templates.default;
    const ref = await db.collection('servers').add({
        name, ownerId: currentUser.uid, members: [currentUser.uid], invites: [], roles: [],
        isPublic: true, template, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    for (const ch of channels) {
        await db.collection('servers').doc(ref.id).collection('channels').add({ name: ch, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    }
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
    const sidebar = document.getElementById('channel-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const isOpen = sidebar.classList.contains('open');
    if (isOpen) { sidebar.classList.remove('open'); overlay.classList.remove('show'); document.body.style.overflow = ''; }
    else { sidebar.classList.add('open'); overlay.classList.add('show'); document.body.style.overflow = 'hidden'; }
}

function showToast(msg, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
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
    if (!str) return 'hsl(0,0%,50%)';
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash) % 360}, 60%, 55%)`;
}

function formatMessageText(text) {
    text = text.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
    text = text.replace(/`([^`]+)`/g, '<span class="code-inline">$1</span>');
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    return text;
}

function searchMessages() {
    const query = document.getElementById('search-messages')?.value.toLowerCase();
    const messages = document.querySelectorAll('.message');
    messages.forEach(msg => {
        const text = msg.querySelector('.message-text')?.textContent.toLowerCase() || '';
        msg.style.display = !query || text.includes(query) ? 'flex' : 'none';
    });
}

function showEmojiPicker() {
    const emojis = ['😀','😂','❤️','🔥','👍','🎉','😢','😡','⭐','💯'];
    const input = document.getElementById('msg-input');
    input.value += emojis[Math.floor(Math.random()*emojis.length)];
    input.focus();
}

// =============================================
// EVENT LISTENERS
// =============================================

document.getElementById('server-modal')?.addEventListener('click', function(e) { if (e.target === this) closeModal('server-modal'); });
document.getElementById('channel-modal')?.addEventListener('click', function(e) { if (e.target === this) closeModal('channel-modal'); });
document.getElementById('discover-modal')?.addEventListener('click', function(e) { if (e.target === this) closeModal('discover-modal'); });
document.getElementById('msg-input')?.addEventListener('input', function() { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 100) + 'px'; });
document.getElementById('sidebar-overlay')?.addEventListener('click', toggleSidebar);

document.addEventListener('click', function(e) {
    const sidebar = document.getElementById('channel-sidebar');
    if (!sidebar || !sidebar.classList.contains('open')) return;
    if (window.innerWidth > 768) return;
    const clicked = e.target.closest('.channel-item') || e.target.closest('.quick-nav-item');
    if (clicked) setTimeout(toggleSidebar, 150);
});

document.addEventListener('gesturestart', function(e) { e.preventDefault(); });

console.log('🐺 Cord v2.0 - Inicializado com sucesso!');
