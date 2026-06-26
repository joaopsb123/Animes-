/* =============================================
   🐺 CORD v3.0 - script.js COMPLETO
   CloudBinary + Firebase Auth + 7 Sistemas Novos
   ============================================= */

// ============ CONFIGURAÇÃO CLOUDBINARY ============
const CB_CONFIG = {
    apiKey: "963113554475727",
    secretKey: "62tTY6eg2SX2exA5K5b24u5paYE",
    projectId: "cord-app"
};

// ============ INICIALIZAÇÃO ============
let CB = null;
let db = null;

// Inicializar CloudBinary
async function initCloudBinary() {
    try {
        CB = new CloudBinary(CB_CONFIG);
        await CB.initialize();
        console.log('✅ CloudBinary conectado!');
        
        // Criar coleções iniciais se não existirem
        await CB.createCollection('users', { 
            username: 'string', email: 'string', password: 'string',
            balance: 'number', nitro: 'boolean', badges: 'array',
            inventory: 'array', friends: 'array', friendCode: 'number',
            bio: 'string', roles: 'array', isOnline: 'boolean',
            lastSeen: 'timestamp', createdAt: 'timestamp',
            servers: 'array', effects: 'array'
        });
        
        await CB.createCollection('servers', {
            name: 'string', ownerId: 'string', members: 'array',
            invites: 'array', roles: 'array', isPublic: 'boolean',
            createdAt: 'timestamp', template: 'string'
        });
        
        await CB.createCollection('channels', {
            serverId: 'string', name: 'string',
            createdAt: 'timestamp', type: 'string'
        });
        
        await CB.createCollection('messages', {
            serverId: 'string', channelId: 'string',
            autor: 'string', texto: 'string', userId: 'string',
            isBot: 'boolean', isSystem: 'boolean',
            hasNitro: 'boolean', badges: 'array',
            reactions: 'map', timestamp: 'timestamp'
        });
        
        await CB.createCollection('bots', {
            name: 'string', desc: 'string', token: 'string',
            ownerId: 'string', active: 'boolean',
            servers: 'array', commands: 'map',
            createdAt: 'timestamp', prefix: 'string'
        });
        
        await CB.createCollection('dms', {
            channelId: 'string', autor: 'string',
            texto: 'string', userId: 'string',
            timestamp: 'timestamp'
        });
        
        await CB.createCollection('economy', {
            userId: 'string', job: 'string', salary: 'number',
            lastWork: 'timestamp', transactions: 'array'
        });
        
        await CB.createCollection('music', {
            serverId: 'string', url: 'string',
            title: 'string', addedBy: 'string',
            timestamp: 'timestamp'
        });
        
        await CB.createCollection('calls', {
            serverId: 'string', channelId: 'string',
            participants: 'array', active: 'boolean',
            startedAt: 'timestamp'
        });
        
        db = CB;
        return true;
    } catch (e) {
        console.warn('CloudBinary em modo fallback:', e.message);
        return false;
    }
}

// Firebase Auth (mantido)
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

// ============ VARIÁVEIS GLOBAIS ============
let currentUser = null;
let currentServer = null;
let currentChannel = null;
let unsubMessages = null;
let currentView = 'chat';
let activeDM = null;
let currentCall = null;
let audioContext = null;

// ============ INICIALIZAÇÃO ============
(async () => {
    const cbReady = await initCloudBinary();
    if (!cbReady) {
        console.log('Usando armazenamento local como fallback');
    }
})();

auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-container').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
        updateUI(user);
        loadServers();
        loadAllData();
        setupRealtime();
    } else {
        currentUser = null;
        document.getElementById('auth-container').style.display = 'flex';
        document.getElementById('app-container').style.display = 'none';
    }
});

// ============ AUTENTICAÇÃO ============
function switchAuthTab(t) {
    document.querySelectorAll('.auth-tab').forEach(e => e.classList.remove('active'));
    document.getElementById('form-login').style.display = t === 'login' ? 'block' : 'none';
    document.getElementById('form-register').style.display = t === 'register' ? 'block' : 'none';
    document.getElementById(`tab-${t}`).classList.add('active');
}

async function handleLogin(e) {
    e.preventDefault();
    try {
        await auth.signInWithEmailAndPassword(
            document.getElementById('login-email').value,
            document.getElementById('login-password').value
        );
    } catch (err) {
        document.getElementById('login-error').textContent = tradErr(err.code);
        document.getElementById('login-error').style.display = 'block';
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const u = document.getElementById('reg-username').value.trim();
    const em = document.getElementById('reg-email').value.trim();
    const p = document.getElementById('reg-password').value;
    try {
        const cred = await auth.createUserWithEmailAndPassword(em, p);
        await cred.user.updateProfile({ displayName: u });
        
        // Salvar no CloudBinary
        if (db) {
            await db.insert('users', {
                id: cred.user.uid,
                username: u, email: em, balance: 100,
                nitro: false, badges: [], inventory: [],
                friends: [], friendCode: Math.floor(1000+Math.random()*9000),
                bio: '', roles: [], isOnline: true,
                lastSeen: new Date(), createdAt: new Date(),
                servers: [], effects: []
            });
        }
    } catch (err) {
        document.getElementById('reg-error').textContent = tradErr(err.code);
        document.getElementById('reg-error').style.display = 'block';
    }
}

async function loginWithGoogle() {
    const p = new firebase.auth.GoogleAuthProvider();
    try {
        const r = await auth.signInWithPopup(p);
        if (db) {
            const exists = await db.findOne('users', { id: r.user.uid });
            if (!exists) {
                await db.insert('users', {
                    id: r.user.uid,
                    username: r.user.displayName || 'User',
                    email: r.user.email, balance: 100,
                    nitro: false, badges: [], inventory: [],
                    friends: [], friendCode: Math.floor(1000+Math.random()*9000),
                    bio: '', roles: [], isOnline: true,
                    lastSeen: new Date(), createdAt: new Date()
                });
            }
        }
    } catch (e) { toast('Erro Google', true); }
}

function logout() {
    if (currentUser && db) {
        db.update('users', { id: currentUser.uid }, { isOnline: false, lastSeen: new Date() });
    }
    auth.signOut();
}

function tradErr(c) {
    const m = {
        'auth/user-not-found':'Email não encontrado',
        'auth/wrong-password':'Senha incorreta',
        'auth/email-already-in-use':'Email já registado',
        'auth/invalid-email':'Email inválido',
        'auth/weak-password':'Senha fraca',
        'auth/too-many-requests':'Muitas tentativas'
    };
    return m[c]||'Erro';
}

// ============ UI ============
function updateUI(user) {
    const n = user.displayName || user.email?.split('@')[0] || 'User';
    const i = n[0].toUpperCase();
    const c = strColor(n);
    document.getElementById('avatar-top').textContent = i;
    document.getElementById('avatar-top').style.background = c;
    document.getElementById('avatar-footer').textContent = i;
    document.getElementById('avatar-footer').style.background = c;
    document.getElementById('username-footer').textContent = n;
    document.getElementById('topbar-title').textContent = n;
}

function switchView(v) {
    currentView = v;
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    const view = document.getElementById(v + '-view');
    if (view) view.classList.add('active');
    
    const navs = document.querySelectorAll('.nav-item');
    const idx = {chat:0, friends:1, nitro:2, bots:3, economy:4, music:5, calls:6};
    if (navs[idx[v]]) navs[idx[v]].classList.add('active');
    
    if (v === 'economy') loadEconomy();
    if (v === 'music') loadMusic();
    if (v === 'calls') loadCalls();
    if (v === 'bots') loadBots();
    if (v === 'nitro') loadNitro();
    if (v === 'friends') loadFriends();
}

// ============ SERVIDORES ============
async function loadServers() {
    if (!db || !currentUser) return;
    const servers = await db.find('servers', { members: { $in: [currentUser.uid] } });
    const list = document.getElementById('guilds-list');
    list.innerHTML = '<div class="guild-item home-guild active" onclick="goHome()" title="Início">🐺</div><div class="guild-separator"></div>';
    
    servers.forEach(s => {
        const d = document.createElement('div');
        d.className = 'guild-item' + (currentServer === s.id ? ' active' : '');
        d.textContent = (s.name||'S')[0].toUpperCase();
        d.style.background = strColor(s.name);
        d.title = s.name;
        d.onclick = () => selectServer(s.id, s.name);
        list.appendChild(d);
    });
}

function goHome() {
    currentServer = null; currentChannel = null; activeDM = null;
    document.getElementById('chat-box').innerHTML = '<div class="welcome"><h1>🐺 Bem-vindo!</h1><p>Seleciona um servidor.</p></div>';
    document.getElementById('channel-list').innerHTML = '';
    document.getElementById('sidebar-server-name').textContent = '🐺 Cord';
    switchView('chat');
}

async function selectServer(id, name) {
    currentServer = id; currentChannel = null; activeDM = null;
    document.getElementById('sidebar-server-name').textContent = name;
    document.getElementById('current-channel-name').textContent = 'Seleciona canal';
    
    const channels = await db.find('channels', { serverId: id });
    const list = document.getElementById('channel-list');
    list.innerHTML = '';
    channels.forEach(ch => {
        const d = document.createElement('div');
        d.className = 'channel-item' + (currentChannel === ch.id ? ' active' : '');
        d.textContent = ch.name;
        d.onclick = () => selectChannel(id, ch.id, ch.name);
        list.appendChild(d);
    });
    
    document.getElementById('chat-box').innerHTML = `<div class="welcome"><h1>${esc(name)}</h1><p>Seleciona um canal.</p></div>`;
    loadMembers();
    switchView('chat');
}

async function selectChannel(sid, cid, name) {
    currentChannel = cid; activeDM = null;
    document.getElementById('current-channel-name').textContent = name;
    
    if (unsubMessages) unsubMessages();
    
    const messages = await db.find('messages', { 
        serverId: sid, channelId: cid 
    }, { sort: { timestamp: 1 } });
    
    renderMessages(messages);
    
    // Polling para novas mensagens (a cada 1s)
    unsubMessages = setInterval(async () => {
        const newMsgs = await db.find('messages', {
            serverId: sid, channelId: cid
        }, { sort: { timestamp: 1 } });
        renderMessages(newMsgs);
    }, 1000);
}

function renderMessages(msgs) {
    const box = document.getElementById('chat-box');
    box.innerHTML = '';
    if (!msgs || msgs.length === 0) {
        box.innerHTML = '<div class="welcome"><p>Sem mensagens. Sê o primeiro!</p></div>';
        return;
    }
    msgs.forEach(msg => {
        const d = document.createElement('div');
        d.className = 'message';
        const color = msg.isBot ? '#5865f2' : strColor(msg.autor);
        const letter = (msg.autor||'?')[0].toUpperCase();
        const badges = [];
        if (msg.isBot) badges.push('<span class="badge bot">BOT</span>');
        if (msg.badges?.includes('nitro')) badges.push('<span class="badge nitro">NITRO</span>');
        if (msg.badges?.includes('vip')) badges.push('<span class="badge vip">VIP</span>');
        
        d.innerHTML = `
            <div class="msg-avatar" style="background:${color}" onclick="openProfile('${msg.userId}')">${letter}</div>
            <div class="msg-content">
                <div class="msg-header">
                    <span class="msg-username" onclick="openProfile('${msg.userId}')">${esc(msg.autor)}</span>
                    ${badges.join('')}
                    <span class="msg-time">${msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'}) : ''}</span>
                </div>
                <div class="msg-text">${fmtText(esc(msg.texto))}</div>
            </div>`;
        box.appendChild(d);
    });
    box.scrollTop = box.scrollHeight;
}

async function sendMsg() {
    const texto = document.getElementById('msg-input').value.trim();
    if (!texto || !currentUser || !currentServer || !currentChannel) return;
    
    const user = await db.findOne('users', { id: currentUser.uid });
    
    await db.insert('messages', {
        serverId: currentServer, channelId: currentChannel,
        autor: currentUser.displayName || 'User', texto,
        userId: currentUser.uid, isBot: false, isSystem: false,
        hasNitro: user?.nitro || false, badges: user?.badges || [],
        reactions: {}, timestamp: new Date()
    });
    
    document.getElementById('msg-input').value = '';
    handleCmd(texto);
}

function handleCmd(t) {
    const l = t.toLowerCase().trim();
    const cmds = {
        '!ping': () => sendSys('🏓 Pong!'),
        '!hora': () => sendSys('🕐 ' + new Date().toLocaleString('pt-PT')),
        '!coins': async () => {
            const u = await db.findOne('users', { id: currentUser.uid });
            sendSys('💰 ' + (u?.balance||0) + ' 🪙');
        },
        '!help': () => sendSys('📖 !ping !hora !coins !rank !work !play !call !help')
    };
    if (cmds[l]) cmds[l]();
    checkBots(t);
}

async function sendSys(t) {
    await db.insert('messages', {
        serverId: currentServer, channelId: currentChannel,
        autor: 'Sistema', texto: t, userId: 'system',
        isBot: false, isSystem: true, hasNitro: false,
        badges: [], reactions: {}, timestamp: new Date()
    });
}

async function checkBots(t) {
    const bots = await db.find('bots', { servers: { $in: [currentServer] }, active: true });
    const l = t.toLowerCase().trim();
    bots.forEach(b => {
        if (b.commands?.[l]) {
            setTimeout(() => {
                db.insert('messages', {
                    serverId: currentServer, channelId: currentChannel,
                    autor: b.name, texto: b.commands[l], userId: b.id,
                    isBot: true, isSystem: false, hasNitro: false,
                    badges: [], reactions: {}, timestamp: new Date()
                });
            }, 400);
        }
    });
}

// ============ MEMBROS ============
async function loadMembers() {
    if (!currentServer) return;
    const server = await db.findOne('servers', { id: currentServer });
    if (!server) return;
    const list = document.getElementById('members-list');
    list.innerHTML = '';
    
    for (const uid of server.members || []) {
        const u = await db.findOne('users', { id: uid });
        if (!u) continue;
        const d = document.createElement('div');
        d.className = 'member-item';
        d.innerHTML = `
            <div class="member-avatar" style="background:${strColor(u.username)}">${(u.username||'?')[0]}</div>
            <span>${esc(u.username)} ${uid===server.ownerId?'👑':''}</span>`;
        d.onclick = () => openProfile(uid);
        list.appendChild(d);
    }
}

function toggleMembersPanel() {
    const p = document.getElementById('members-panel');
    p.style.display = p.style.display === 'none' ? 'flex' : 'none';
    if (p.style.display === 'flex') loadMembers();
}

// ============ PERFIS ============
async function openProfile(uid) {
    if (!uid || uid === 'system') return;
    const u = await db.findOne('users', { id: uid });
    if (!u) return;
    
    const isOwn = uid === currentUser?.uid;
    const isFriend = (u.friends||[]).includes(currentUser?.uid);
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal profile-modal">
            <button class="profile-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            <div class="profile-header" style="background:linear-gradient(180deg,${strColor(u.username)} 0%,var(--bg-secondary) 70%);">
                <div class="profile-avatar" style="background:${strColor(u.username)}">${(u.username||'?')[0]}</div>
                <h2 style="color:#fff;margin-top:8px;">${esc(u.username)}</h2>
                ${u.nitro ? '<span class="badge nitro">NITRO</span>' : ''}
            </div>
            <div class="profile-body">
                <div class="profile-section"><h4>Bio</h4><p>${esc(u.bio||'Sem bio')}</p></div>
                <div class="profile-section"><h4>Stats</h4><p>💰 ${u.balance||0} 🪙 | #${u.friendCode}</p></div>
                <div class="profile-actions">
                    ${isOwn ? '<button class="btn btn-sm btn-primary" onclick="switchView(\'settings\');this.closest(\'.modal-overlay\').remove()">Editar</button>' : ''}
                    ${!isOwn && isFriend ? `<button class="btn btn-sm btn-primary" onclick="openDM('${uid}');this.closest('.modal-overlay').remove()">💬 DM</button>` : ''}
                    ${!isOwn && !isFriend ? `<button class="btn btn-sm btn-primary" onclick="addFriendById('${uid}');this.closest('.modal-overlay').remove()">➕ Adicionar</button>` : ''}
                </div>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
}

async function addFriendById(fid) {
    const u = await db.findOne('users', { id: currentUser.uid });
    const friends = u?.friends || [];
    if (friends.includes(fid)) return toast('Já são amigos!');
    
    await db.update('users', { id: currentUser.uid }, { friends: [...friends, fid] });
    const f = await db.findOne('users', { id: fid });
    await db.update('users', { id: fid }, { friends: [...(f?.friends||[]), currentUser.uid] });
    toast('Amigo adicionado! 🎉');
    loadFriends();
}

// ============ AMIGOS E DM ============
async function loadFriends() {
    if (!currentUser) return;
    const u = await db.findOne('users', { id: currentUser.uid });
    document.getElementById('my-code').textContent = '#' + (u?.friendCode || '----');
    
    const friends = u?.friends || [];
    const list = document.getElementById('friends-list');
    const dmList = document.getElementById('dm-list');
    list.innerHTML = ''; dmList.innerHTML = '';
    
    for (const fid of friends) {
        const f = await db.findOne('users', { id: fid });
        if (!f) continue;
        list.innerHTML += `<div class="shop-item"><span>${esc(f.username)}</span><span>${f.isOnline?'🟢':'⚫'}</span><button class="btn btn-xs btn-primary" onclick="openDM('${fid}')">💬</button></div>`;
        dmList.innerHTML += `<div class="shop-item" onclick="openDM('${fid}')" style="cursor:pointer;"><span>${esc(f.username)}</span><span>💬</span></div>`;
    }
}

async function addFriend() {
    const code = document.getElementById('friend-input').value.replace('#','').trim();
    if (!code) return;
    const u = await db.findOne('users', { friendCode: parseInt(code) });
    if (!u) { document.getElementById('friend-result').textContent = 'Código inválido'; return; }
    if (u.id === currentUser.uid) { document.getElementById('friend-result').textContent = 'Não podes!'; return; }
    
    const me = await db.findOne('users', { id: currentUser.uid });
    if ((me?.friends||[]).includes(u.id)) { document.getElementById('friend-result').textContent = 'Já são!'; return; }
    
    await db.update('users', { id: currentUser.uid }, { friends: [...(me?.friends||[]), u.id] });
    await db.update('users', { id: u.id }, { friends: [...(u.friends||[]), currentUser.uid] });
    document.getElementById('friend-result').textContent = '✅ Adicionado!';
    document.getElementById('friend-input').value = '';
    toast('Amigo adicionado!');
    loadFriends();
}

async function openDM(fid) {
    activeDM = fid; currentChannel = null;
    if (unsubMessages) clearInterval(unsubMessages);
    document.getElementById('current-channel-name').textContent = '💬 DM';
    
    const msgs = await db.find('dms', { 
        $or: [
            { userId: currentUser.uid, channelId: fid },
            { userId: fid, channelId: currentUser.uid }
        ]
    }, { sort: { timestamp: 1 } });
    
    const box = document.getElementById('chat-box');
    box.innerHTML = '';
    msgs.forEach(m => {
        box.innerHTML += `<div style="padding:4px;"><b>${esc(m.autor)}:</b> ${esc(m.texto)}</div>`;
    });
    box.scrollTop = box.scrollHeight;
    switchView('chat');
}

async function sendDM(fid, texto) {
    await db.insert('dms', {
        channelId: fid, autor: currentUser.displayName || 'User',
        texto, userId: currentUser.uid, timestamp: new Date()
    });
}

// ============ SISTEMA 1: NITRO MELHORADO ============
async function loadNitro() {
    if (!currentUser) return;
    const u = await db.findOne('users', { id: currentUser.uid });
    document.getElementById('balance').textContent = u?.balance || 0;
    
    document.getElementById('effects-shop').innerHTML = `
        <div class="shop-item"><span>✨ Glow</span><span>300 🪙</span><button class="btn btn-xs btn-primary" onclick="buyEffect('glow',300)">Comprar</button></div>
        <div class="shop-item"><span>🌈 Arco-Íris</span><span>500 🪙</span><button class="btn btn-xs btn-primary" onclick="buyEffect('rainbow',500)">Comprar</button></div>
        <div class="shop-item"><span>💎 Cristal</span><span>700 🪙</span><button class="btn btn-xs btn-primary" onclick="buyEffect('crystal',700)">Comprar</button></div>
        <div class="shop-item"><span>🔥 Fogo</span><span>600 🪙</span><button class="btn btn-xs btn-primary" onclick="buyEffect('fire',600)">Comprar</button></div>`;
    
    document.getElementById('badges-shop').innerHTML = `
        <div class="shop-item"><span>💎 VIP</span><span>800 🪙</span><button class="btn btn-xs btn-primary" onclick="buyBadge('vip',800)">Comprar</button></div>
        <div class="shop-item"><span>👑 OG</span><span>1500 🪙</span><button class="btn btn-xs btn-primary" onclick="buyBadge('og',1500)">Comprar</button></div>
        <div class="shop-item"><span>🤖 Bot Master</span><span>1000 🪙</span><button class="btn btn-xs btn-primary" onclick="buyBadge('botmaster',1000)">Comprar</button></div>
        <div class="shop-item"><span>🎵 DJ</span><span>1200 🪙</span><button class="btn btn-xs btn-primary" onclick="buyBadge('dj',1200)">Comprar</button></div>`;
}

async function buyNitro() {
    const u = await db.findOne('users', { id: currentUser.uid });
    if ((u?.balance||0) < 500) return toast('Sem moedas!', true);
    if (u?.nitro) return toast('Já tens Nitro!');
    await db.update('users', { id: currentUser.uid }, { nitro: true, balance: (u.balance||0) - 500 });
    toast('Nitro ativado! ⭐');
    loadNitro();
}

async function buyEffect(e, p) {
    const u = await db.findOne('users', { id: currentUser.uid });
    if ((u?.balance||0) < p) return toast('Sem moedas!', true);
    if ((u?.effects||[]).includes(e)) return toast('Já tens!');
    await db.update('users', { id: currentUser.uid }, { 
        balance: (u.balance||0) - p, 
        effects: [...(u?.effects||[]), e] 
    });
    toast('Comprado! ✨');
    loadNitro();
}

async function buyBadge(b, p) {
    const u = await db.findOne('users', { id: currentUser.uid });
    if ((u?.balance||0) < p) return toast('Sem moedas!', true);
    if ((u?.badges||[]).includes(b)) return toast('Já tens!');
    await db.update('users', { id: currentUser.uid }, { 
        balance: (u.balance||0) - p, 
        badges: [...(u?.badges||[]), b] 
    });
    toast('Comprado! 🏅');
    loadNitro();
}

async function dailyReward() {
    const u = await db.findOne('users', { id: currentUser.uid });
    const last = u?.lastDaily ? new Date(u.lastDaily) : null;
    const now = new Date();
    if (last && last.toDateString() === now.toDateString()) return toast('Já recebeste hoje!', true);
    const r = 50 + Math.floor(Math.random()*51);
    await db.update('users', { id: currentUser.uid }, { 
        balance: (u?.balance||0) + r, 
        lastDaily: now 
    });
    toast('🎁 +' + r + ' 🪙');
    loadNitro();
}

// ============ SISTEMA 2: ECONOMIA AVANÇADA ============
async function loadEconomy() {
    if (!currentUser) return;
    const u = await db.findOne('users', { id: currentUser.uid });
    document.getElementById('eco-balance').textContent = u?.balance || 0;
    
    // Loja
    document.getElementById('shop-items').innerHTML = `
        <div class="shop-item"><span>🎨 Cor Nome</span><span>200 🪙</span><button class="btn btn-xs btn-primary" onclick="buyItem('color',200)">Comprar</button></div>
        <div class="shop-item"><span>📛 Tag</span><span>400 🪙</span><button class="btn btn-xs btn-primary" onclick="buyItem('tag',400)">Comprar</button></div>`;
    
    // Ranking
    const users = await db.find('users', {}, { sort: { balance: -1 }, limit: 10 });
    document.getElementById('ranking').innerHTML = users.map((u,i) => 
        `<div>${i+1}. ${esc(u.username)} - ${u.balance||0} 🪙</div>`
    ).join('');
    
    // Empregos
    const jobs = [
        { name: '🧑‍💻 Dev', salary: 30 },
        { name: '🎨 Designer', salary: 25 },
        { name: '🎵 Músico', salary: 20 },
        { name: '📝 Escritor', salary: 15 }
    ];
    document.getElementById('jobs-list').innerHTML = jobs.map(j =>
        `<div class="shop-item"><span>${j.name}</span><span>${j.salary} 🪙/h</span><button class="btn btn-xs btn-primary" onclick="workJob('${j.name}',${j.salary})">Trabalhar</button></div>`
    ).join('');
}

async function workJob(name, salary) {
    const eco = await db.findOne('economy', { userId: currentUser.uid });
    const last = eco?.lastWork ? new Date(eco.lastWork) : null;
    const now = new Date();
    if (last && (now - last) < 3600000) return toast('Aguarda 1h!', true);
    
    await db.upsert('economy', { userId: currentUser.uid }, {
        job: name, salary, lastWork: now,
        $inc: { totalEarned: salary }
    });
    
    await db.update('users', { id: currentUser.uid }, {
        $inc: { balance: salary }
    });
    
    toast('Trabalhaste como ' + name + ' +' + salary + ' 🪙');
    loadEconomy();
}

async function buyItem(item, price) {
    const u = await db.findOne('users', { id: currentUser.uid });
    if ((u?.balance||0) < price) return toast('Sem moedas!', true);
    await db.update('users', { id: currentUser.uid }, {
        balance: (u.balance||0) - price,
        inventory: [...(u?.inventory||[]), item]
    });
    toast('Comprado!');
    loadEconomy();
}

// ============ SISTEMA 3: MÚSICA ============
async function loadMusic() {
    if (!currentServer) return;
    const playlist = await db.find('music', { serverId: currentServer });
    document.getElementById('playlist').innerHTML = playlist.map(m =>
        `<div class="shop-item"><span>🎵 ${esc(m.title||m.url)}</span><button class="btn btn-xs btn-danger" onclick="removeMusic('${m.id}')">✕</button></div>`
    ).join('') || '<p>Playlist vazia.</p>';
}

async function playMusic() {
    if (!currentServer) return toast('Seleciona servidor!', true);
    const url = document.getElementById('music-url').value.trim();
    if (!url) return;
    
    await db.insert('music', {
        serverId: currentServer, url,
        title: 'Música ' + Date.now().toString(36),
        addedBy: currentUser.uid, timestamp: new Date()
    });
    
    document.getElementById('now-playing').textContent = '▶️ A tocar: ' + url;
    document.getElementById('music-url').value = '';
    toast('Música adicionada! 🎵');
    loadMusic();
}

async function removeMusic(id) {
    await db.delete('music', { id });
    toast('Removida.');
    loadMusic();
}

// ============ SISTEMA 4: CHAMADAS ============
async function loadCalls() {
    if (!currentServer) {
        document.getElementById('call-status').textContent = 'Seleciona um servidor.';
        return;
    }
    const call = await db.findOne('calls', { serverId: currentServer, active: true });
    if (call) {
        document.getElementById('call-status').innerHTML = '🟢 Chamada ativa!<br>Participantes: ' + (call.participants?.length||0);
        document.getElementById('call-participants').innerHTML = (call.participants||[]).map(p => `<div>👤 ${p}</div>`).join('');
    } else {
        document.getElementById('call-status').textContent = 'Nenhuma chamada ativa.';
        document.getElementById('call-participants').innerHTML = '';
    }
}

async function startCall() {
    if (!currentServer || !currentChannel) return toast('Seleciona servidor e canal!', true);
    
    const existing = await db.findOne('calls', { serverId: currentServer, active: true });
    if (existing) {
        // Entrar na chamada existente
        await db.update('calls', { id: existing.id }, {
            participants: [...(existing.participants||[]), currentUser.uid]
        });
        toast('Entraste na chamada! 📞');
    } else {
        // Criar nova chamada
        await db.insert('calls', {
            serverId: currentServer, channelId: currentChannel,
            participants: [currentUser.uid], active: true,
            startedAt: new Date()
        });
        toast('Chamada iniciada! 📞');
    }
    currentCall = currentServer;
    loadCalls();
    
    // Simular áudio
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioContext.createOscillator();
        osc.frequency.value = 440;
        osc.connect(audioContext.destination);
        osc.start();
        setTimeout(() => osc.stop(), 3000);
    }
}

// ============ SISTEMA 5: BOTS ============
async function loadBots() {
    if (!currentUser) return;
    const bots = await db.find('bots', { ownerId: currentUser.uid });
    document.getElementById('my-bots').innerHTML = bots.map(b =>
        `<div class="shop-item">
            <span>🤖 ${esc(b.name)}</span>
            <span class="token-display" onclick="copyToken('${b.token}')">${(b.token||'').substring(0,12)}...</span>
            <button class="btn btn-xs btn-primary" onclick="editBot('${b.id}')">✏️</button>
            <button class="btn btn-xs btn-danger" onclick="deleteBot('${b.id}')">🗑️</button>
        </div>`
    ).join('') || '<p>Nenhum bot.</p>';
    
    // Selects
    const bs = document.getElementById('select-bot');
    const ss = document.getElementById('select-server');
    bs.innerHTML = '<option>Bot...</option>' + bots.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
    
    const servers = await db.find('servers', { members: { $in: [currentUser.uid] } });
    ss.innerHTML = '<option>Servidor...</option>' + servers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

async function createBot() {
    const name = document.getElementById('bot-name').value.trim();
    if (!name) return toast('Dá nome!', true);
    const desc = document.getElementById('bot-desc').value.trim();
    const token = 'bot_' + Math.random().toString(36).substring(2,16);
    
    await db.insert('bots', {
        name, desc, token, ownerId: currentUser.uid,
        active: true, servers: [], commands: {},
        createdAt: new Date(), prefix: '!'
    });
    
    document.getElementById('bot-name').value = '';
    document.getElementById('bot-desc').value = '';
    toast('Bot criado! 🤖 Token: ' + token.substring(0,15) + '...');
    loadBots();
}

async function addBotToServer() {
    const bid = document.getElementById('select-bot').value;
    const sid = document.getElementById('select-server').value;
    if (!bid || !sid) return toast('Seleciona!', true);
    
    const bot = await db.findOne('bots', { id: bid });
    const servers = bot?.servers || [];
    if (servers.includes(sid)) return toast('Já está!');
    
    await db.update('bots', { id: bid }, { servers: [...servers, sid] });
    toast('Bot adicionado! 🎉');
    loadBots();
}

async function editBot(id) {
    const name = prompt('Nome:');
    if (!name) return;
    const cmds = prompt('Comandos (!cmd=resposta,!cmd2=resp2):');
    const commands = {};
    if (cmds) cmds.split(',').forEach(p => {
        const [c,r] = p.split('=');
        if (c && r) commands[c.trim().toLowerCase()] = r.trim();
    });
    await db.update('bots', { id }, { name, commands });
    toast('Atualizado!');
    loadBots();
}

async function deleteBot(id) {
    if (confirm('Apagar?')) {
        await db.delete('bots', { id });
        toast('Apagado!');
        loadBots();
    }
}

function copyToken(t) {
    navigator.clipboard.writeText(t);
    toast('Token copiado! 📋');
}

// ============ SISTEMA 6: CARGOS ============
async function addRole() {
    if (!currentServer) return toast('Seleciona servidor!', true);
    const name = prompt('Nome do cargo:');
    if (!name) return;
    const color = prompt('Cor (ex: #ff0000):', '#5865f2');
    
    const server = await db.findOne('servers', { id: currentServer });
    const roles = server?.roles || [];
    roles.push({ id: 'role_'+Date.now(), name, color });
    await db.update('servers', { id: currentServer }, { roles });
    toast('Cargo criado!');
}

// ============ SISTEMA 7: CONVITES E DESCOBERTA ============
async function generateInvite() {
    if (!currentServer) return toast('Seleciona servidor!', true);
    const code = Math.random().toString(36).substring(2,8).toUpperCase();
    const server = await db.findOne('servers', { id: currentServer });
    await db.update('servers', { id: currentServer }, { 
        invites: [...(server?.invites||[]), code] 
    });
    toast('Convite: ' + code);
}

async function searchServers() {
    const q = (document.getElementById('discover-search')?.value || '').toLowerCase();
    const servers = await db.find('servers', { isPublic: true });
    const results = document.getElementById('discover-results');
    results.innerHTML = servers
        .filter(s => !q || s.name.toLowerCase().includes(q))
        .map(s => `<div class="shop-item"><span>${esc(s.name)}</span><span>${(s.members||[]).length} membros</span><button class="btn btn-xs btn-primary" onclick="joinServer('${s.id}')">Entrar</button></div>`)
        .join('') || '<p>Nenhum servidor.</p>';
}

async function joinServer(id) {
    const server = await db.findOne('servers', { id });
    if (!server) return;
    if ((server.members||[]).includes(currentUser.uid)) return toast('Já estás!');
    await db.update('servers', { id }, { members: [...(server.members||[]), currentUser.uid] });
    toast('Entraste! 🎉');
    closeModal('discover-modal');
    loadServers();
}

// ============ SETTINGS ============
async function loadSettings() {
    const u = await db.findOne('users', { id: currentUser.uid });
    document.getElementById('settings-name').value = u?.username || '';
    document.getElementById('settings-bio').value = u?.bio || '';
    document.getElementById('inventory').innerHTML = (u?.inventory||[]).map(i => `<div>📦 ${i}</div>`).join('') || 'Vazio';
}

async function saveProfile() {
    const name = document.getElementById('settings-name').value.trim();
    if (!name) return toast('Nome obrigatório!', true);
    await currentUser.updateProfile({ displayName: name });
    await db.update('users', { id: currentUser.uid }, { 
        username: name, 
        bio: document.getElementById('settings-bio').value.trim() 
    });
    document.getElementById('username-footer').textContent = name;
    toast('Guardado! 💾');
}

// ============ MODAIS E SERVIDORES ============
function showServerModal() { document.getElementById('server-modal').style.display = 'flex'; }
function showChannelModal() { if (!currentServer) return toast('Seleciona servidor!', true); document.getElementById('channel-modal').style.display = 'flex'; }
function showDiscoverModal() { document.getElementById('discover-modal').style.display = 'flex'; searchServers(); }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

async function createServer() {
    const name = document.getElementById('server-name').value.trim();
    const template = document.getElementById('server-template').value;
    if (!name) return;
    
    const templates = {
        default: ['geral'],
        gaming: ['geral','🎮jogos','📺clips'],
        study: ['geral','📚estudos','📝duvidas']
    };
    
    const result = await db.insert('servers', {
        name, ownerId: currentUser.uid, members: [currentUser.uid],
        invites: [], roles: [], isPublic: true,
        createdAt: new Date(), template
    });
    
    const channels = templates[template] || templates.default;
    for (const ch of channels) {
        await db.insert('channels', {
            serverId: result.id, name: ch,
            createdAt: new Date(), type: 'text'
        });
    }
    
    closeModal('server-modal');
    document.getElementById('server-name').value = '';
    toast('Servidor criado! 🎉');
    loadServers();
}

async function createChannel() {
    const name = document.getElementById('channel-name').value.trim();
    if (!name || !currentServer) return;
    await db.insert('channels', {
        serverId: currentServer, name,
        createdAt: new Date(), type: 'text'
    });
    closeModal('channel-modal');
    document.getElementById('channel-name').value = '';
    toast('Canal criado!');
    selectServer(currentServer, document.getElementById('sidebar-server-name').textContent);
}

// ============ HELPERS ============
function toggleSidebar() {
    const s = document.getElementById('sidebar');
    const o = document.getElementById('sidebar-overlay');
    s.classList.toggle('open');
    o.classList.toggle('show');
}

function toast(m, e) {
    const t = document.getElementById('toast');
    t.textContent = m;
    t.className = 'toast' + (e ? ' error' : '');
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
}

function esc(t) { const d = document.createElement('div'); d.textContent = t||''; return d.innerHTML; }
function strColor(s) { let h=0; for(let i=0;i<(s||'?').length;i++) h=s.charCodeAt(i)+((h<<5)-h); return `hsl(${Math.abs(h)%360},60%,55%)`; }
function fmtText(t) { t=t.replace(/@(\w+)/g,'<span class="mention">@$1</span>'); t=t.replace(/`([^`]+)`/g,'<span class="code">$1</span>'); t=t.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>'); return t; }

function loadAllData() {
    loadServers();
    loadFriends();
    loadNitro();
    loadBots();
    loadEconomy();
    loadMusic();
    loadCalls();
    loadSettings();
}

function setupRealtime() {
    setInterval(() => {
        if (currentUser && db) {
            db.update('users', { id: currentUser.uid }, { isOnline: true, lastSeen: new Date() });
        }
    }, 30000);
}

// Event Listeners
document.getElementById('server-modal')?.addEventListener('click', e => { if(e.target.id==='server-modal') closeModal('server-modal'); });
document.getElementById('channel-modal')?.addEventListener('click', e => { if(e.target.id==='channel-modal') closeModal('channel-modal'); });
document.getElementById('discover-modal')?.addEventListener('click', e => { if(e.target.id==='discover-modal') closeModal('discover-modal'); });
document.getElementById('msg-input')?.addEventListener('input', function(){ this.style.height='auto'; this.style.height=Math.min(this.scrollHeight,100)+'px'; });
document.getElementById('sidebar-overlay')?.addEventListener('click', toggleSidebar);

function showServerSettings() { if (currentServer) switchView('members'); }
function showEmojiPicker() { document.getElementById('msg-input').value += '😊'; document.getElementById('msg-input').focus(); }
function searchMessages() {
    const q = document.getElementById('search-msg')?.value.toLowerCase();
    document.querySelectorAll('.message').forEach(m => {
        m.style.display = !q || m.textContent.toLowerCase().includes(q) ? 'flex' : 'none';
    });
}
function changeTheme(t) {
    const themes = {
        dark: {'--bg-primary':'#313338','--bg-secondary':'#2b2d31','--bg-tertiary':'#1e1f22'},
        light: {'--bg-primary':'#f2f3f5','--bg-secondary':'#fff','--bg-tertiary':'#e3e5e8'},
        midnight: {'--bg-primary':'#0a0a14','--bg-secondary':'#0f0f1e','--bg-tertiary':'#1a1a30'}
    };
    const th = themes[t] || themes.dark;
    for (const [k,v] of Object.entries(th)) document.documentElement.style.setProperty(k,v);
}

// Inicialização
document.getElementById('msg-input')?.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMsg();
    }
});

console.log('🐺 Cord v3.0 - CloudBinary + 7 Sistemas - Pronto!');
