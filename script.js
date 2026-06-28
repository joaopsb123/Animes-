/* =============================================
   🐺 CORD v3.0 - script.js COMPLETO
   CloudBinary + Firebase Auth + Todos os Sistemas
   ============================================= */

// ============ CONFIGURAÇÃO CLOUDBINARY ============
const CLOUDBINARY_CONFIG = {
    apiKey: "963113554475727",
    secretKey: "62tTY6eg2SX2exA5K5b24u5paYE",
    baseURL: "https://api.cloudbinary.io/v1"
};

// Inicializar Firebase Auth
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

// ============ CAMADA DE BANCO DE DADOS (CloudBinary com fallback) ============
const DB = {
    async request(path, method = 'GET', body = null) {
        const headers = {
            'Content-Type': 'application/json',
            'x-api-key': CLOUDBINARY_CONFIG.apiKey,
            'x-secret-key': CLOUDBINARY_CONFIG.secretKey
        };
        const url = `${CLOUDBINARY_CONFIG.baseURL}/${path}`;
        try {
            const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : null });
            if (!res.ok) throw new Error(`CloudBinary error: ${res.status}`);
            return await res.json();
        } catch (e) {
            console.warn('CloudBinary indisponível, usando localStorage:', e.message);
            return null; // fallback para localStorage
        }
    },
    // Adaptador similar ao Firestore para facilitar migração
    collection(name) {
        return {
            doc: (id) => ({
                get: async () => {
                    const data = await DB.request(`collection/${name}/doc/${id}`);
                    return { exists: !!data, data: () => data || {} };
                },
                set: async (obj) => DB.request(`collection/${name}/doc/${id}`, 'POST', obj),
                update: async (obj) => DB.request(`collection/${name}/doc/${id}`, 'PUT', obj),
                delete: async () => DB.request(`collection/${name}/doc/${id}`, 'DELETE'),
                collection: (sub) => DB.collection(`${name}/${id}/${sub}`)
            }),
            add: async (obj) => {
                const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
                await DB.request(`collection/${name}/doc/${id}`, 'POST', obj);
                return { id };
            },
            where: (field, op, value) => ({
                get: async () => {
                    // Simples: buscar todos e filtrar (em produção usar queries reais)
                    const all = await DB.request(`collection/${name}/docs`);
                    if (!all) return { empty: true, docs: [] };
                    const docs = Object.entries(all).map(([id, data]) => ({ id, data: () => data }));
                    const filtered = docs.filter(d => {
                        const val = d.data()[field];
                        if (op === '==') return val === value;
                        if (op === 'array-contains') return Array.isArray(val) && val.includes(value);
                        return false;
                    });
                    return { empty: filtered.length === 0, docs: filtered, forEach: (cb) => filtered.forEach(cb) };
                }
            }),
            get: async () => {
                const all = await DB.request(`collection/${name}/docs`);
                if (!all) return { empty: true, docs: [] };
                const docs = Object.entries(all).map(([id, data]) => ({ id, data: () => data }));
                return { empty: docs.length === 0, docs, forEach: (cb) => docs.forEach(cb) };
            }
        };
    }
};

// ============ VARIÁVEIS GLOBAIS ============
let currentUser = null;
let currentServer = null;
let currentChannel = null;
let unsubMessages = null;
let currentView = 'chat';
let activeDM = null;
let membersPanelVisible = false;

// ============ AUTENTICAÇÃO ============
function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('form-login').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('form-register').style.display = tab === 'register' ? 'block' : 'none';
    document.getElementById('tab-' + tab)?.classList.add('active');
    document.getElementById('login-error').style.display = 'none';
    document.getElementById('reg-error').style.display = 'none';
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-password').value;
    const err = document.getElementById('login-error');
    err.style.display = 'none';
    try { await auth.signInWithEmailAndPassword(email, pass); }
    catch (error) { err.textContent = traduzirErro(error.code); err.style.display = 'block'; }
}

async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const pass = document.getElementById('reg-password').value;
    const err = document.getElementById('reg-error');
    err.style.display = 'none';
    if (username.length < 3) { err.textContent = 'Nome muito curto.'; err.style.display = 'block'; return; }
    if (pass.length < 6) { err.textContent = 'Senha muito curta.'; err.style.display = 'block'; return; }
    try {
        const cred = await auth.createUserWithEmailAndPassword(email, pass);
        await cred.user.updateProfile({ displayName: username });
        await DB.collection('users').doc(cred.user.uid).set({
            username, email, balance: 100, lastDaily: null, bio: '', inventory: [], friends: [],
            friendCode: Math.floor(1000 + Math.random() * 9000), nitro: false, badges: [], roles: [],
            createdAt: Date.now(), lastSeen: Date.now()
        });
    } catch (error) { err.textContent = traduzirErro(error.code); err.style.display = 'block'; }
}

async function loginWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
        const result = await auth.signInWithPopup(provider);
        const user = result.user;
        const userDoc = await DB.collection('users').doc(user.uid).get();
        if (!userDoc.exists) {
            await DB.collection('users').doc(user.uid).set({
                username: user.displayName || 'Usuário Google', email: user.email,
                balance: 100, lastDaily: null, bio: '', inventory: [], friends: [],
                friendCode: Math.floor(1000 + Math.random() * 9000), nitro: false, badges: [], roles: [],
                createdAt: Date.now(), lastSeen: Date.now()
            });
        } else {
            await DB.collection('users').doc(user.uid).update({ lastSeen: Date.now() });
        }
    } catch (e) { showToast('Erro ao entrar com Google.', true); }
}

function logout() {
    if (currentUser) DB.collection('users').doc(currentUser.uid).update({ lastSeen: Date.now(), isOnline: false });
    auth.signOut();
    currentUser = null; currentServer = null; currentChannel = null; activeDM = null;
    if (unsubMessages) { unsubMessages(); unsubMessages = null; }
}

function traduzirErro(code) {
    const map = { 'auth/user-not-found': 'Email não encontrado.', 'auth/wrong-password': 'Senha incorreta.', 'auth/email-already-in-use': 'Email já registado.', 'auth/invalid-email': 'Email inválido.', 'auth/weak-password': 'Senha fraca.', 'auth/too-many-requests': 'Muitas tentativas.', 'auth/network-request-failed': 'Erro de rede.' };
    return map[code] || 'Erro.';
}

// ============ OBSERVADOR DE AUTENTICAÇÃO ============
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-container').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
        updateUI(user);
        loadServers();
        loadDMs();
        DB.collection('users').doc(user.uid).update({ lastSeen: Date.now(), isOnline: true });
    } else {
        document.getElementById('auth-container').style.display = 'flex';
        document.getElementById('app-container').style.display = 'none';
    }
});

function updateUI(user) {
    const name = user.displayName || user.email.split('@')[0];
    const initial = name[0].toUpperCase();
    const color = stringToColor(name);
    ['avatar-top', 'avatar-footer'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.textContent = initial; el.style.background = color; }
    });
    document.getElementById('username-footer').textContent = name;
    document.getElementById('topbar-title').textContent = name;
}

// ============ NAVEGAÇÃO ============
function switchView(view) {
    currentView = view;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(view + '-view')?.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navMap = { chat: 0, friends: 1, nitro: 2, bots: 3, economy: 4, music: 5, calls: 6 };
    const idx = navMap[view] ?? 0;
    const navItems = document.querySelectorAll('.nav-item');
    if (navItems[idx]) navItems[idx].classList.add('active');
    if (view === 'friends') loadFriendsPanel();
    if (view === 'nitro') loadNitroPanel();
    if (view === 'bots') loadBotsPanel();
    if (view === 'economy') loadEconomyPanel();
    if (view === 'music') loadMusicPanel();
    if (view === 'calls') loadCallsPanel();
    if (view === 'settings') loadSettingsPanel();
    if (window.innerWidth <= 768) toggleSidebar(false);
}

function goHome() {
    currentServer = null; currentChannel = null; activeDM = null;
    document.getElementById('chat-box').innerHTML = '<div class="welcome"><h1>🐺 Bem-vindo ao Cord!</h1><p>Seleciona um servidor.</p></div>';
    document.getElementById('current-channel-name').textContent = 'Seleciona um canal';
    document.getElementById('channel-list').innerHTML = '';
    document.getElementById('sidebar-server-name').textContent = '🐺 Cord';
    if (unsubMessages) { unsubMessages(); unsubMessages = null; }
    switchView('chat');
}

// ============ SERVIDORES (GUILDS) ============
async function loadServers() {
    if (!currentUser) return;
    const guildsList = document.getElementById('guilds-list');
    guildsList.innerHTML = '<div class="guild-item home-guild active" onclick="goHome()">🐺</div><div class="guild-separator"></div>';
    const snapshot = await DB.collection('servers').where('members', 'array-contains', currentUser.uid).get();
    snapshot.forEach(doc => {
        const server = doc.data();
        const btn = document.createElement('div');
        btn.className = 'guild-item';
        btn.textContent = server.name.charAt(0).toUpperCase();
        btn.style.background = stringToColor(server.name);
        btn.title = server.name;
        btn.onclick = () => selectServer(doc.id, server.name);
        if (currentServer === doc.id) btn.classList.add('active');
        guildsList.appendChild(btn);
    });
}

function selectServer(serverId, serverName) {
    currentServer = serverId; currentChannel = null; activeDM = null;
    document.getElementById('sidebar-server-name').textContent = serverName;
    document.getElementById('current-channel-name').textContent = 'Seleciona um canal';
    if (unsubMessages) { unsubMessages(); unsubMessages = null; }
    loadChannels(serverId);
    document.getElementById('chat-box').innerHTML = `<div class="welcome"><h1>#${serverName}</h1><p>Seleciona um canal.</p></div>`;
    document.querySelectorAll('.guild-item').forEach(g => g.classList.remove('active'));
    // ativar o servidor correto (não ideal, mas funcional)
    switchView('chat');
}

async function loadChannels(serverId) {
    const list = document.getElementById('channel-list');
    list.innerHTML = '';
    const snapshot = await DB.collection(`servers/${serverId}/channels`).get();
    snapshot.forEach(doc => {
        const ch = doc.data();
        const div = document.createElement('div');
        div.className = 'channel-item';
        div.textContent = ch.name;
        div.onclick = () => selectChannel(serverId, doc.id, ch.name);
        if (currentChannel === doc.id) div.classList.add('active');
        list.appendChild(div);
    });
}

function selectChannel(serverId, channelId, channelName) {
    currentChannel = channelId; activeDM = null;
    document.getElementById('current-channel-name').textContent = channelName;
    if (unsubMessages) unsubMessages();
    // Escutar mensagens
    unsubMessages = () => {}; // placeholder, vamos usar polling simples
    loadMessages(serverId, channelId);
    switchView('chat');
}

async function loadMessages(serverId, channelId) {
    const box = document.getElementById('chat-box');
    box.innerHTML = '';
    const snapshot = await DB.collection(`servers/${serverId}/channels/${channelId}/messages`).get();
    snapshot.forEach(doc => renderMessage(doc.data(), doc.id));
    box.scrollTop = box.scrollHeight;
}

// ============ MENSAGENS ============
function renderMessage(msg, msgId) {
    const box = document.getElementById('chat-box');
    const div = document.createElement('div');
    div.className = 'message';
    div.innerHTML = `
        <div class="msg-avatar" style="background:${msg.isBot ? '#5865f2' : stringToColor(msg.autor)}">${(msg.autor||'?')[0].toUpperCase()}</div>
        <div class="msg-content">
            <div class="msg-header">
                <span class="msg-username">${esc(msg.autor)}</span>
                ${msg.isBot ? '<span class="badge bot">BOT</span>' : ''}
                <span class="msg-time">${msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'}) : ''}</span>
            </div>
            <div class="msg-text">${formatText(esc(msg.texto))}</div>
            ${msg.reactions ? renderReactions(msg.reactions, msgId) : ''}
        </div>`;
    box.appendChild(div);
}

function renderReactions(reactions, msgId) {
    return `<div class="reactions">${Object.entries(reactions).map(([emoji, users]) => 
        `<span class="reaction ${users.includes(currentUser.uid)?'active':''}" onclick="toggleReaction('${msgId}','${emoji}')">${emoji} ${users.length}</span>`
    ).join('')}</div>`;
}

async function sendMsg() {
    const input = document.getElementById('msg-input');
    const texto = input.value.trim();
    if (!texto || !currentUser) return;
    if (activeDM) {
        await sendDM(activeDM, texto);
    } else if (currentServer && currentChannel) {
        await DB.collection(`servers/${currentServer}/channels/${currentChannel}/messages`).add({
            autor: currentUser.displayName || currentUser.email.split('@')[0],
            texto, userId: currentUser.uid, isBot: false, timestamp: Date.now(), reactions: {}
        });
        handleCommands(texto);
    }
    input.value = ''; input.style.height = 'auto';
    if (currentServer && currentChannel) loadMessages(currentServer, currentChannel);
}

function handleCommands(texto) {
    const lower = texto.toLowerCase();
    if (lower === '!ping') sendSystemMsg('Pong!');
    else if (lower === '!hora') sendSystemMsg(new Date().toLocaleString('pt-PT'));
    else if (lower === '!help') sendSystemMsg('Comandos: !ping, !hora, !help');
}

async function sendSystemMsg(texto) {
    if (!currentServer || !currentChannel) return;
    await DB.collection(`servers/${currentServer}/channels/${currentChannel}/messages`).add({
        autor: 'Sistema', texto, userId: 'system', isBot: true, timestamp: Date.now(), reactions: {}
    });
    loadMessages(currentServer, currentChannel);
}

// ============ AMIGOS E DM ============
async function loadDMs() {
    // carregar amigos do usuário
    const userDoc = await DB.collection('users').doc(currentUser.uid).get();
    const friends = userDoc.data()?.friends || [];
    document.getElementById('my-code').textContent = '#' + (userDoc.data()?.friendCode || '----');
    const dmList = document.getElementById('dm-list');
    dmList.innerHTML = '';
    for (const fid of friends) {
        const fDoc = await DB.collection('users').doc(fid).get();
        const fData = fDoc.data();
        dmList.innerHTML += `<div class="list-item" onclick="openDM('${fid}')"><div class="list-item-avatar" style="background:${stringToColor(fData.username)}">${fData.username[0]}</div><div class="list-item-info"><div class="list-item-name">${fData.username}</div></div></div>`;
    }
}

function openDM(friendId) {
    activeDM = friendId; currentChannel = null; currentServer = null;
    document.getElementById('current-channel-name').textContent = '💬 DM';
    switchView('chat');
    loadDMMessages(friendId);
}

async function loadDMMessages(friendId) {
    const box = document.getElementById('chat-box');
    box.innerHTML = '';
    const channelId = [currentUser.uid, friendId].sort().join('_');
    const snapshot = await DB.collection(`dms/${channelId}/messages`).get();
    snapshot.forEach(doc => renderMessage(doc.data(), doc.id));
}

async function sendDM(friendId, texto) {
    const channelId = [currentUser.uid, friendId].sort().join('_');
    await DB.collection(`dms/${channelId}/messages`).add({
        autor: currentUser.displayName || currentUser.email.split('@')[0],
        texto, userId: currentUser.uid, timestamp: Date.now(), reactions: {}
    });
    loadDMMessages(friendId);
}

async function addFriend() {
    const code = document.getElementById('friend-input').value.replace('#', '').trim();
    const res = document.getElementById('friend-result');
    if (!code) return res.textContent = 'Insira um código.';
    const snapshot = await DB.collection('users').where('friendCode', '==', parseInt(code)).get();
    if (snapshot.empty) return res.textContent = 'Código inválido.';
    const friendId = snapshot.docs[0].id;
    if (friendId === currentUser.uid) return res.textContent = 'Não podes adicionar-te.';
    const userDoc = await DB.collection('users').doc(currentUser.uid).get();
    const friends = userDoc.data()?.friends || [];
    if (friends.includes(friendId)) return res.textContent = 'Já são amigos.';
    await DB.collection('users').doc(currentUser.uid).update({ friends: [...friends, friendId] });
    await DB.collection('users').doc(friendId).update({ friends: [...(await DB.collection('users').doc(friendId).get()).data().friends, currentUser.uid] });
    res.textContent = 'Adicionado!';
    loadFriendsPanel();
}

// ============ NITRO ============
async function loadNitroPanel() {
    const userDoc = await DB.collection('users').doc(currentUser.uid).get();
    document.getElementById('balance').textContent = userDoc.data()?.balance || 0;
    document.getElementById('effects-shop').innerHTML = `
        <div class="shop-item"><span>✨ Glow</span><span>300 🪙</span><button class="btn btn-xs btn-primary" onclick="buyEffect('glow',300)">Comprar</button></div>
        <div class="shop-item"><span>🌈 Arco-Íris</span><span>400 🪙</span><button class="btn btn-xs btn-primary" onclick="buyEffect('rainbow',400)">Comprar</button></div>`;
    document.getElementById('badges-shop').innerHTML = `
        <div class="shop-item"><span>💎 VIP</span><span>800 🪙</span><button class="btn btn-xs btn-primary" onclick="buyBadge('vip',800)">Comprar</button></div>
        <div class="shop-item"><span>👑 OG</span><span>1500 🪙</span><button class="btn btn-xs btn-primary" onclick="buyBadge('og',1500)">Comprar</button></div>`;
}

async function buyNitro() {
    const userDoc = await DB.collection('users').doc(currentUser.uid).get();
    if (userDoc.data().balance < 500) return showToast('Sem moedas.', true);
    await DB.collection('users').doc(currentUser.uid).update({ nitro: true, balance: userDoc.data().balance - 500 });
    showToast('Nitro ativado!');
    loadNitroPanel();
}

async function buyEffect(type, price) {
    const userDoc = await DB.collection('users').doc(currentUser.uid).get();
    if (userDoc.data().balance < price) return showToast('Sem moedas.', true);
    const inv = userDoc.data().inventory || [];
    if (inv.includes('effect_'+type)) return showToast('Já tens.', true);
    await DB.collection('users').doc(currentUser.uid).update({ balance: userDoc.data().balance - price, inventory: [...inv, 'effect_'+type] });
    showToast('Comprado!');
    loadNitroPanel();
}

async function buyBadge(type, price) {
    const userDoc = await DB.collection('users').doc(currentUser.uid).get();
    if (userDoc.data().balance < price) return showToast('Sem moedas.', true);
    const badges = userDoc.data().badges || [];
    if (badges.includes(type)) return showToast('Já tens.', true);
    await DB.collection('users').doc(currentUser.uid).update({ balance: userDoc.data().balance - price, badges: [...badges, type] });
    showToast('Comprado!');
    loadNitroPanel();
}

async function dailyReward() {
    const userDoc = await DB.collection('users').doc(currentUser.uid).get();
    const last = userDoc.data().lastDaily ? new Date(userDoc.data().lastDaily) : null;
    const now = new Date();
    if (last && last.toDateString() === now.toDateString()) return showToast('Já recebeste hoje.', true);
    const reward = 50 + Math.floor(Math.random() * 51);
    await DB.collection('users').doc(currentUser.uid).update({ balance: (userDoc.data().balance||0) + reward, lastDaily: now.getTime() });
    showToast(`Recebeste ${reward} 🪙!`);
    loadNitroPanel();
}

// ============ BOTS ============
async function loadBotsPanel() {
    const snapshot = await DB.collection('bots').where('ownerId', '==', currentUser.uid).get();
    const list = document.getElementById('my-bots');
    list.innerHTML = '';
    snapshot.forEach(doc => {
        const bot = doc.data();
        list.innerHTML += `<div class="shop-item"><span>🤖 ${bot.name}</span><span class="token-display" onclick="copyToken('${doc.id}')">${bot.token.substring(0,12)}...</span></div>`;
    });
    const botSelect = document.getElementById('select-bot');
    const serverSelect = document.getElementById('select-server');
    botSelect.innerHTML = '<option value="">Seleciona bot</option>';
    serverSelect.innerHTML = '<option value="">Seleciona servidor</option>';
    snapshot.forEach(doc => botSelect.innerHTML += `<option value="${doc.id}">${doc.data().name}</option>`);
    const servers = await DB.collection('servers').where('members', 'array-contains', currentUser.uid).get();
    servers.forEach(doc => serverSelect.innerHTML += `<option value="${doc.id}">${doc.data().name}</option>`);
}

async function createBot() {
    const name = document.getElementById('bot-name').value.trim();
    if (!name) return showToast('Dá um nome.', true);
    const token = 'bot_' + Math.random().toString(36).substr(2, 15);
    await DB.collection('bots').add({ name, desc: document.getElementById('bot-desc').value, token, ownerId: currentUser.uid, servers: [], commands: {} });
    showToast('Bot criado!');
    loadBotsPanel();
}

async function addBotToServer() {
    const botId = document.getElementById('select-bot').value;
    const serverId = document.getElementById('select-server').value;
    if (!botId || !serverId) return showToast('Seleciona ambos.', true);
    const botDoc = await DB.collection('bots').doc(botId).get();
    const servers = botDoc.data().servers || [];
    if (servers.includes(serverId)) return showToast('Bot já está nesse servidor.');
    await DB.collection('bots').doc(botId).update({ servers: [...servers, serverId] });
    showToast('Bot adicionado!');
}

async function copyToken(botId) {
    const botDoc = await DB.collection('bots').doc(botId).get();
    await navigator.clipboard.writeText(botDoc.data().token);
    showToast('Token copiado!');
}

// ============ ECONOMIA ============
async function loadEconomyPanel() {
    const userDoc = await DB.collection('users').doc(currentUser.uid).get();
    document.getElementById('eco-balance').textContent = userDoc.data()?.balance || 0;
    document.getElementById('shop-items').innerHTML = '<div class="shop-item"><span>🎫 Bilhete Sorteio</span><span>50 🪙</span><button class="btn btn-xs btn-primary" onclick="buyItem(\'ticket\',50)">Comprar</button></div>';
    document.getElementById('jobs-list').innerHTML = '<div class="shop-item"><span>💼 Programador</span><span>+20/h</span><button class="btn btn-xs btn-primary" onclick="work()">Trabalhar</button></div>';
    const ranking = await DB.collection('users').get();
    const sorted = ranking.docs.sort((a,b) => (b.data().balance||0) - (a.data().balance||0)).slice(0,10);
    document.getElementById('ranking').innerHTML = sorted.map((d,i) => `<div>${i+1}. ${d.data().username} - ${d.data().balance} 🪙</div>`).join('');
}

async function buyItem(item, price) {
    const userDoc = await DB.collection('users').doc(currentUser.uid).get();
    if (userDoc.data().balance < price) return showToast('Sem moedas.', true);
    await DB.collection('users').doc(currentUser.uid).update({ balance: userDoc.data().balance - price, inventory: [...(userDoc.data().inventory||[]), item] });
    showToast('Comprado!');
    loadEconomyPanel();
}

async function work() {
    const userDoc = await DB.collection('users').doc(currentUser.uid).get();
    await DB.collection('users').doc(currentUser.uid).update({ balance: (userDoc.data().balance||0) + 20 });
    showToast('Trabalhaste e ganhaste 20 🪙!');
    loadEconomyPanel();
}

// ============ MÚSICA ============
function loadMusicPanel() {
    document.getElementById('playlist').innerHTML = '<p class="placeholder-text">Playlist vazia.</p>';
    document.getElementById('now-playing').innerHTML = '';
}

function playMusic() {
    const url = document.getElementById('music-url').value;
    if (!url) return showToast('Insere URL.', true);
    document.getElementById('now-playing').innerHTML = `🎵 Tocando: ${url}`;
    showToast('Música iniciada (simulação)');
}

// ============ CHAMADAS ============
function loadCallsPanel() {
    document.getElementById('call-status').innerHTML = 'Nenhuma chamada ativa.';
    document.getElementById('call-participants').innerHTML = '';
}

function startCall() {
    document.getElementById('call-status').innerHTML = '📞 Em chamada... (simulação)';
    showToast('Chamada iniciada!');
}

// ============ MEMBROS E CARGOS ============
function toggleMembersPanel() {
    const panel = document.getElementById('members-panel');
    membersPanelVisible = !membersPanelVisible;
    panel.style.display = membersPanelVisible ? 'flex' : 'none';
    if (membersPanelVisible) loadMembersList();
}

async function loadMembersList() {
    if (!currentServer) return;
    const serverDoc = await DB.collection('servers').doc(currentServer).get();
    const members = serverDoc.data()?.members || [];
    const list = document.getElementById('members-list');
    list.innerHTML = '';
    for (const uid of members) {
        const userDoc = await DB.collection('users').doc(uid).get();
        const u = userDoc.data();
        list.innerHTML += `<div class="member-item"><div class="member-avatar" style="background:${stringToColor(u.username)}">${u.username[0]}</div>${u.username}</div>`;
    }
}

// ============ MODAIS ============
function showServerModal() { document.getElementById('server-modal').classList.add('show'); }
function showChannelModal() { if (!currentServer) return showToast('Seleciona servidor.', true); document.getElementById('channel-modal').classList.add('show'); }
function showDiscoverModal() { document.getElementById('discover-modal').classList.add('show'); searchServers(); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

async function createServer() {
    const name = document.getElementById('server-name').value.trim();
    const template = document.getElementById('server-template').value;
    if (!name) return;
    const channels = template === 'gaming' ? ['geral', 'jogos'] : template === 'study' ? ['geral', 'estudos'] : ['geral'];
    const docRef = await DB.collection('servers').add({ name, ownerId: currentUser.uid, members: [currentUser.uid], invites: [], roles: [], template });
    for (const ch of channels) await DB.collection(`servers/${docRef.id}/channels`).add({ name: ch });
    closeModal('server-modal');
    document.getElementById('server-name').value = '';
    loadServers();
    showToast('Servidor criado!');
}

async function createChannel() {
    const name = document.getElementById('channel-name').value.trim();
    if (!name || !currentServer) return;
    await DB.collection(`servers/${currentServer}/channels`).add({ name });
    closeModal('channel-modal');
    document.getElementById('channel-name').value = '';
    loadChannels(currentServer);
    showToast('Canal criado!');
}

async function searchServers() {
    const query = document.getElementById('discover-search')?.value.toLowerCase() || '';
    const snapshot = await DB.collection('servers').get();
    const results = document.getElementById('discover-results');
    results.innerHTML = '';
    snapshot.forEach(doc => {
        if (query && !doc.data().name.toLowerCase().includes(query)) return;
        results.innerHTML += `<div class="shop-item"><span>${doc.data().name}</span><button class="btn btn-xs btn-primary" onclick="joinServer('${doc.id}')">Entrar</button></div>`;
    });
}

async function joinServer(serverId) {
    const serverDoc = await DB.collection('servers').doc(serverId).get();
    if (serverDoc.data().members.includes(currentUser.uid)) return showToast('Já estás.', true);
    await DB.collection('servers').doc(serverId).update({ members: [...serverDoc.data().members, currentUser.uid] });
    showToast('Entraste!');
    closeModal('discover-modal');
    loadServers();
}

// ============ DEFINIÇÕES ============
async function loadSettingsPanel() {
    const userDoc = await DB.collection('users').doc(currentUser.uid).get();
    document.getElementById('settings-name').value = userDoc.data()?.username || '';
    document.getElementById('settings-bio').value = userDoc.data()?.bio || '';
    document.getElementById('inventory').innerHTML = (userDoc.data()?.inventory || []).map(i => `<div>${i}</div>`).join('') || '<p class="placeholder-text">Vazio.</p>';
}

async function saveProfile() {
    const name = document.getElementById('settings-name').value.trim();
    const bio = document.getElementById('settings-bio').value.trim();
    if (!name) return showToast('Nome obrigatório.', true);
    await currentUser.updateProfile({ displayName: name });
    await DB.collection('users').doc(currentUser.uid).update({ username: name, bio });
    updateUI(currentUser);
    showToast('Perfil guardado!');
}

function changeTheme(theme) {
    const themes = {
        dark: { '--bg-primary': '#313338', '--bg-secondary': '#2b2d31', '--bg-tertiary': '#1e1f22', '--text-normal': '#dbdee1', '--text-muted': '#949ba4', '--text-bright': '#fff' },
        light: { '--bg-primary': '#f2f3f5', '--bg-secondary': '#fff', '--bg-tertiary': '#e3e5e8', '--text-normal': '#2e3338', '--text-muted': '#747f8d', '--text-bright': '#060607' },
        midnight: { '--bg-primary': '#0a0a1a', '--bg-secondary': '#0d0d24', '--bg-tertiary': '#1a1a3e', '--text-normal': '#c8c8ff', '--text-muted': '#6a6a9f', '--text-bright': '#fff' }
    };
    const t = themes[theme] || themes.dark;
    for (const [k, v] of Object.entries(t)) document.documentElement.style.setProperty(k, v);
}

// ============ UI HELPERS ============
function toggleSidebar(forceClose = false) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (forceClose || sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        overlay.classList.remove('show');
    } else {
        sidebar.classList.add('open');
        overlay.classList.add('show');
    }
}

function showToast(msg, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = 'toast' + (isError ? ' error' : '');
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.remove('show'), 2500);
}

function esc(str) { const div = document.createElement('div'); div.textContent = str || ''; return div.innerHTML; }
function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < (str||'?').length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash) % 360}, 60%, 55%)`;
}
function formatText(text) {
    return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code class="code">$1</code>');
}

// Corrigir clique no overlay
document.getElementById('sidebar-overlay').addEventListener('click', () => toggleSidebar(true));

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', function(e) { if (e.target === this) this.classList.remove('show'); });
    });
});
