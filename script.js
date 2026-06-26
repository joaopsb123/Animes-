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

/**
 * Alterna entre as tabs de Login e Registo
 */
function switchAuthTab(tab) {
    // Remove active de todas as tabs
    document.querySelectorAll('.auth-tab').forEach(t => {
        t.classList.remove('active');
    });

    // Mostra/esconde formulários
    const loginForm = document.getElementById('form-login');
    const registerForm = document.getElementById('form-register');
    
    if (tab === 'login') {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        document.getElementById('tab-login').classList.add('active');
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        document.getElementById('tab-register').classList.add('active');
    }

    // Limpa erros
    document.getElementById('login-error').style.display = 'none';
    document.getElementById('reg-error').style.display = 'none';
}

/**
 * Processa o login com email e senha
 */
async function handleLogin(event) {
    event.preventDefault();
    
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errorElement = document.getElementById('login-error');
    
    errorElement.style.display = 'none';

    try {
        await auth.signInWithEmailAndPassword(email, password);
        // Sucesso - o onAuthStateChanged vai tratar do resto
    } catch (error) {
        errorElement.textContent = translateAuthError(error.code);
        errorElement.style.display = 'block';
    }
}

/**
 * Processa o registo de novo utilizador
 */
async function handleRegister(event) {
    event.preventDefault();
    
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const errorElement = document.getElementById('reg-error');
    
    errorElement.style.display = 'none';

    // Validação do nome
    if (username.length < 3) {
        errorElement.textContent = 'O nome deve ter pelo menos 3 caracteres.';
        errorElement.style.display = 'block';
        return;
    }

    // Validação da senha
    if (password.length < 6) {
        errorElement.textContent = 'A senha deve ter pelo menos 6 caracteres.';
        errorElement.style.display = 'block';
        return;
    }

    try {
        // Criar conta no Firebase Auth
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;

        // Atualizar perfil
        await user.updateProfile({
            displayName: username
        });

        // Criar documento do utilizador no Firestore
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

        // Sucesso - o onAuthStateChanged vai tratar do resto
    } catch (error) {
        errorElement.textContent = translateAuthError(error.code);
        errorElement.style.display = 'block';
    }
}

/**
 * Login com Google
 */
async function loginWithGoogle() {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        const result = await auth.signInWithPopup(provider);
        const user = result.user;

        // Verificar se é novo utilizador
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        if (!userDoc.exists) {
            // Criar documento para novo utilizador Google
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
            // Atualizar último login
            await db.collection('users').doc(user.uid).update({
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    } catch (error) {
        console.error('Erro no login Google:', error);
        showToast('Erro ao entrar com Google. Tenta novamente.', true);
    }
}

/**
 * Terminar sessão
 */
function logout() {
    // Limpar listeners
    if (unsubMessages) {
        unsubMessages();
        unsubMessages = null;
    }
    
    // Resetar variáveis
    currentServer = null;
    currentChannel = null;
    activeDM = null;
    
    auth.signOut();
}

/**
 * Traduz erros de autenticação para português
 */
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

/**
 * Gera um código de amigo único de 4 dígitos
 */
function generateFriendCode() {
    return Math.floor(1000 + Math.random() * 9000);
}

// =============================================
// OBSERVADOR DE AUTENTICAÇÃO
// =============================================

auth.onAuthStateChanged(async (user) => {
    if (user) {
        // Utilizador autenticado
        currentUser = user;
        
        // Mostrar app, esconder auth
        document.getElementById('auth-container').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
        
        // Atualizar UI com dados do utilizador
        updateUserInterface(user);
        
        // Carregar dados iniciais
        loadServers();
        loadAllPanels();
        
        // Atualizar último visto
        try {
            await db.collection('users').doc(user.uid).update({
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (err) {
            // Ignorar erro silenciosamente
        }
    } else {
        // Utilizador não autenticado
        currentUser = null;
        
        // Mostrar auth, esconder app
        document.getElementById('auth-container').style.display = 'flex';
        document.getElementById('app-container').style.display = 'none';
        
        // Limpar listeners
        if (unsubMessages) {
            unsubMessages();
            unsubMessages = null;
        }
        
        // Resetar variáveis
        currentServer = null;
        currentChannel = null;
        activeDM = null;
    }
});

/**
 * Atualiza a interface com os dados do utilizador
 */
function updateUserInterface(user) {
    const displayName = user.displayName || user.email.split('@')[0];
    const initial = displayName[0].toUpperCase();
    const avatarColor = stringToColor(displayName);
    
    // Atualizar avatares
    ['avatar-top', 'avatar-footer'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = initial;
            el.style.background = avatarColor;
        }
    });
    
    // Atualizar nomes
    document.getElementById('username-footer').textContent = displayName;
    document.getElementById('topbar-title').textContent = displayName;
}

// =============================================
// NAVEGAÇÃO DE VIEWS
// =============================================

/**
 * Alterna entre as diferentes views da aplicação
 */
function switchView(view) {
    currentView = view;
    
    // Esconder todas as views
    const viewIds = ['chat-view', 'friends-view', 'dashboard-view', 'nitro-view', 'members-view', 'settings-view'];
    viewIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = 'none';
        }
    });
    
    // Mostrar a view selecionada
    const selectedView = document.getElementById(view + '-view');
    if (selectedView) {
        selectedView.style.display = view === 'chat' ? 'flex' : 'block';
    }
    
    // Atualizar botões de navegação
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.view === view || btn.getAttribute('onclick')?.includes(`'${view}'`)) {
            btn.classList.add('active');
        }
    });
    
    // Carregar dados específicos da view
    switch (view) {
        case 'friends':
            loadFriendsPanel();
            break;
        case 'dashboard':
            loadBotsPanel();
            break;
        case 'nitro':
            loadNitroPanel();
            break;
        case 'members':
            loadMembersPanel();
            break;
        case 'settings':
            loadSettingsPanel();
            break;
    }
    
    // Fechar sidebar no mobile
    if (window.innerWidth <= 768) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar.classList.contains('open')) {
            toggleSidebar();
        }
    }
}

/**
 * Carrega dados de todos os painéis
 */
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

/**
 * Carrega a lista de servidores do utilizador
 */
function loadServers() {
    if (!currentUser) return;
    
    db.collection('servers')
        .where('members', 'array-contains', currentUser.uid)
        .onSnapshot((snapshot) => {
            const serverList = document.getElementById('server-list');
            serverList.innerHTML = '';
            
            if (snapshot.empty) {
                serverList.innerHTML = `
                    <p style="color:var(--text-muted);font-size:11px;padding:8px;text-align:center;">
                        Nenhum servidor ainda
                    </p>`;
                return;
            }
            
            snapshot.forEach((doc) => {
                const server = doc.data();
                const serverElement = document.createElement('div');
                serverElement.className = 'server-item';
                serverElement.innerHTML = `
                    <span class="server-dot"></span>
                    <span>${escapeHtml(server.name)}</span>
                `;
                serverElement.onclick = () => selectServer(doc.id, server.name);
                
                if (currentServer === doc.id) {
                    serverElement.classList.add('active');
                }
                
                serverList.appendChild(serverElement);
            });
        }, (error) => {
            console.error('Erro ao carregar servidores:', error);
        });
}

/**
 * Seleciona um servidor
 */
function selectServer(serverId, serverName) {
    currentServer = serverId;
    currentChannel = null;
    activeDM = null;
    
    // Limpar canais
    document.getElementById('channel-list').innerHTML = '';
    
    // Limpar chat
    document.getElementById('chat-box').innerHTML = `
        <div class="empty-state">
            <span class="icon">💬</span>
            <span class="empty-title">${escapeHtml(serverName)}</span>
            <span class="empty-desc">Seleciona um canal para começar</span>
        </div>`;
    
    document.getElementById('current-channel-name').textContent = 'Seleciona um canal';
    
    // Limpar listener de mensagens anterior
    if (unsubMessages) {
        unsubMessages();
        unsubMessages = null;
    }
    
    // Carregar canais
    loadChannels(serverId);
    
    // Ir para view de chat
    switchView('chat');
    
    // Fechar sidebar no mobile
    if (window.innerWidth <= 768) {
        toggleSidebar();
    }
}

/**
 * Carrega os canais de um servidor
 */
function loadChannels(serverId) {
    db.collection('servers')
        .doc(serverId)
        .collection('channels')
        .orderBy('createdAt')
        .onSnapshot((snapshot) => {
            const channelList = document.getElementById('channel-list');
            channelList.innerHTML = '';
            
            snapshot.forEach((doc) => {
                const channel = doc.data();
                const channelElement = document.createElement('div');
                channelElement.className = 'channel-item';
                channelElement.innerHTML = `
                    <span class="hash-icon">#</span>
                    <span>${escapeHtml(channel.name)}</span>
                `;
                channelElement.onclick = () => selectChannel(serverId, doc.id, channel.name);
                
                if (currentChannel === doc.id) {
                    channelElement.classList.add('active');
                }
                
                channelList.appendChild(channelElement);
            });
        });
}

/**
 * Seleciona um canal e carrega as mensagens
 */
function selectChannel(serverId, channelId, channelName) {
    currentChannel = channelId;
    activeDM = null;
    
    document.getElementById('current-channel-name').textContent = channelName;
    
    // Limpar listener anterior
    if (unsubMessages) {
        unsubMessages();
    }
    
    // Escutar mensagens em tempo real
    unsubMessages = db.collection('servers')
        .doc(serverId)
        .collection('channels')
        .doc(channelId)
        .collection('messages')
        .orderBy('timestamp', 'asc')
        .onSnapshot((snapshot) => {
            const chatBox = document.getElementById('chat-box');
            chatBox.innerHTML = '';
            
            if (snapshot.empty) {
                chatBox.innerHTML = `
                    <div class="empty-state">
                        <span class="icon">📭</span>
                        <span class="empty-title">Sem mensagens</span>
                        <span class="empty-desc">Sê o primeiro a escrever neste canal!</span>
                    </div>`;
                return;
            }
            
            snapshot.forEach((doc) => {
                renderMessage(doc.data(), doc.id);
            });
            
            // Scroll para o final
            chatBox.scrollTop = chatBox.scrollHeight;
        }, (error) => {
            console.error('Erro ao carregar mensagens:', error);
            showToast('Erro ao carregar mensagens', true);
        });
    
    // Fechar sidebar no mobile
    if (window.innerWidth <= 768) {
        toggleSidebar();
    }
}

// =============================================
// MENSAGENS
// =============================================

/**
 * Renderiza uma mensagem no chat
 */
function renderMessage(msg, msgId) {
    const chatBox = document.getElementById('chat-box');
    
    // Remover estado vazio se existir
    const emptyState = chatBox.querySelector('.empty-state');
    if (emptyState) {
        chatBox.innerHTML = '';
    }
    
    // Criar elemento da mensagem
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    
    // Cor do avatar
    const avatarColor = msg.isBot ? '#6366f1' : 
                       (msg.isSystem ? '#52525b' : stringToColor(msg.autor));
    
    // Letra do avatar
    const avatarLetter = (msg.autor || '?')[0].toUpperCase();
    
    // Classe Nitro para o nome
    const nitroNameClass = msg.hasNitro ? ' nitro-name' : '';
    
    // Classe Nitro para o avatar
    const nitroFrameClass = msg.hasNitro ? ' nitro-glow' : '';
    
    // Construir badges
    let badgesHtml = '';
    
    if (msg.isBot) {
        badgesHtml += '<span class="badge-tag bot">BOT</span>';
    }
    if (msg.isSystem) {
        badgesHtml += '<span class="badge-tag system">SYS</span>';
    }
    if (msg.badges && msg.badges.includes('nitro')) {
        badgesHtml += '<span class="badge-tag nitro">NITRO</span>';
    }
    if (msg.badges && msg.badges.includes('vip')) {
        badgesHtml += '<span class="badge-tag vip">VIP</span>';
    }
    if (msg.badges && msg.badges.includes('og')) {
        badgesHtml += '<span class="badge-tag og">OG</span>';
    }
    if (msg.badges && msg.badges.includes('botmaster')) {
        badgesHtml += '<span class="badge-tag botmaster">BOT MASTER</span>';
    }
    
    // Formatar hora
    let timeStr = '';
    if (msg.timestamp) {
        const date = msg.timestamp.toDate();
        timeStr = date.toLocaleTimeString('pt-PT', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    // Construir reações
    const reactions = msg.reactions || {};
    let reactionsHtml = '';
    
    Object.entries(reactions).forEach(([emoji, users]) => {
        const isActive = Array.isArray(users) && users.includes(currentUser?.uid);
        const count = Array.isArray(users) ? users.length : 0;
        reactionsHtml += `
            <span class="reaction-badge ${isActive ? 'active' : ''}" 
                  onclick="toggleReaction('${msgId}', '${emoji}')">
                ${emoji} ${count}
            </span>`;
    });
    
    if (reactionsHtml) {
        reactionsHtml = `<div class="reactions-row">${reactionsHtml}</div>`;
    }
    
    // Montar HTML da mensagem
    messageDiv.innerHTML = `
        <div class="message-avatar" style="background: ${avatarColor};">
            <div class="avatar-frame ${nitroFrameClass}"></div>
            ${avatarLetter}
        </div>
        <div class="message-content">
            <div class="message-header">
                <span class="message-username ${nitroNameClass}">${escapeHtml(msg.autor)}</span>
                ${badgesHtml}
                <span class="message-time">${timeStr}</span>
            </div>
            <div class="message-text">${formatMessageText(escapeHtml(msg.texto))}</div>
            ${reactionsHtml}
        </div>
    `;
    
    chatBox.appendChild(messageDiv);
}

/**
 * Envia uma mensagem no canal atual
 */
async function sendMsg() {
    const input = document.getElementById('msg-input');
    const texto = input.value.trim();
    
    if (!texto || !currentUser) return;
    
    // Verificar se é DM ou canal
    if (activeDM) {
        await sendDirectMessage(activeDM, texto);
    } else if (currentServer && currentChannel) {
        await sendChannelMessage(texto);
    } else {
        showToast('Seleciona um canal ou conversa privada primeiro!', true);
        return;
    }
    
    // Limpar input
    input.value = '';
    input.style.height = 'auto';
}

/**
 * Envia mensagem no canal do servidor
 */
async function sendChannelMessage(texto) {
    try {
        // Obter dados do utilizador para badges
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const userData = userDoc.data() || {};
        const hasNitro = userData.nitro || false;
        const badges = userData.badges || [];
        
        const messageData = {
            autor: currentUser.displayName || currentUser.email.split('@')[0],
            texto: texto,
            userId: currentUser.uid,
            isBot: false,
            isSystem: false,
            hasNitro: hasNitro,
            badges: badges,
            reactions: {},
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('servers')
            .doc(currentServer)
            .collection('channels')
            .doc(currentChannel)
            .collection('messages')
            .add(messageData);
        
        // Processar comandos
        handleCommands(texto);
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        showToast('Erro ao enviar mensagem. Tenta novamente.', true);
    }
}

/**
 * Processa comandos do chat
 */
function handleCommands(texto) {
    const lower = texto.toLowerCase().trim();
    
    const commands = {
        '!ping': () => sendSystemMessage('🏓 Pong! Latência: ' + Math.floor(Math.random() * 100) + 'ms'),
        '!hora': () => sendSystemMessage('🕐 Hora atual: ' + new Date().toLocaleString('pt-PT')),
        '!dado': () => sendSystemMessage('🎲 O dado caiu em: **' + (Math.floor(Math.random() * 6) + 1) + '**'),
        '!moeda': () => sendSystemMessage('🪙 Resultado: **' + (Math.random() > 0.5 ? 'Cara' : 'Coroa') + '**'),
        '!coins': async () => {
            const doc = await db.collection('users').doc(currentUser.uid).get();
            const balance = (doc.data() || {}).balance || 0;
            sendSystemMessage('💰 Tens **' + balance + '** 🪙 CordCoins');
        },
        '!rank': async () => {
            const snapshot = await db.collection('users')
                .orderBy('balance', 'desc')
                .limit(5)
                .get();
            
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
            const botsSnap = await db.collection('bots')
                .where('serverId', '==', currentServer)
                .get();
            
            sendSystemMessage(
                '📊 **' + escapeHtml(server.name || 'Servidor') + '**\n' +
                '👥 Membros: ' + ((server.members || []).length) + '\n' +
                '🤖 Bots: ' + botsSnap.size + '\n' +
                '👑 Dono: ' + (server.ownerId === currentUser.uid ? 'Tu' : 'Outro')
            );
        },
        '!help': () => {
            sendSystemMessage(
                '**📖 Comandos Disponíveis:**\n' +
                '`!ping` - Verifica latência\n' +
                '`!hora` - Hora atual\n' +
                '`!dado` - Lança um dado (1-6)\n' +
                '`!moeda` - Cara ou coroa\n' +
                '`!coins` - O teu saldo\n' +
                '`!rank` - Ranking global\n' +
                '`!serverinfo` - Informação do servidor\n' +
                '`!help` - Esta lista de comandos'
            );
        }
    };
    
    if (commands[lower]) {
        commands[lower]();
    }
    
    // Verificar bots personalizados
    checkCustomBots(texto);
}

/**
 * Verifica comandos de bots personalizados
 */
async function checkCustomBots(texto) {
    if (!currentServer) return;
    
    try {
        const botsSnapshot = await db.collection('bots')
            .where('serverId', '==', currentServer)
            .where('active', '==', true)
            .get();
        
        const lower = texto.toLowerCase().trim();
        
        botsSnapshot.forEach((doc) => {
            const bot = doc.data();
            if (bot.commands && bot.commands[lower]) {
                setTimeout(() => {
                    sendBotMessage(bot.commands[lower], bot.name, doc.id);
                }, 300 + Math.random() * 500);
            }
        });
    } catch (error) {
        // Ignorar erros silenciosamente
    }
}

/**
 * Envia mensagem do sistema
 */
function sendSystemMessage(texto) {
    if (!currentServer || !currentChannel) return;
    
    db.collection('servers')
        .doc(currentServer)
        .collection('channels')
        .doc(currentChannel)
        .collection('messages')
        .add({
            autor: 'Sistema',
            texto: texto,
            userId: 'system',
            isBot: false,
            isSystem: true,
            hasNitro: false,
            badges: [],
            reactions: {},
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
}

/**
 * Envia mensagem de bot
 */
function sendBotMessage(texto, botName, botId) {
    if (!currentServer || !currentChannel) return;
    
    db.collection('servers')
        .doc(currentServer)
        .collection('channels')
        .doc(currentChannel)
        .collection('messages')
        .add({
            autor: botName,
            texto: texto,
            userId: botId || 'system',
            isBot: true,
            isSystem: false,
            hasNitro: false,
            badges: [],
            reactions: {},
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
}

/**
 * Alterna reação numa mensagem
 */
async function toggleReaction(msgId, emoji) {
    if (!currentServer || !currentChannel || !currentUser) return;
    
    const messageRef = db.collection('servers')
        .doc(currentServer)
        .collection('channels')
        .doc(currentChannel)
        .collection('messages')
        .doc(msgId);
    
    try {
        const doc = await messageRef.get();
        if (!doc.exists) return;
        
        const data = doc.data();
        const reactions = data.reactions || {};
        
        if (!reactions[emoji]) {
            reactions[emoji] = [];
        }
        
        const userIndex = reactions[emoji].indexOf(currentUser.uid);
        
        if (userIndex >= 0) {
            // Remover reação
            reactions[emoji].splice(userIndex, 1);
        } else {
            // Adicionar reação
            reactions[emoji].push(currentUser.uid);
        }
        
        // Remover emoji se não houver reações
        if (reactions[emoji].length === 0) {
            delete reactions[emoji];
        }
        
        await messageRef.update({ reactions });
    } catch (error) {
        console.error('Erro ao alternar reação:', error);
    }
}

// =============================================
// AMIGOS E MENSAGENS PRIVADAS
// =============================================

/**
 * Carrega o painel de amigos
 */
async function loadFriendsPanel() {
    if (!currentUser) return;
    
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const userData = userDoc.data() || {};
        const friends = userData.friends || [];
        const friendCode = userData.friendCode || '----';
        
        // Mostrar código de amigo
        document.getElementById('my-friend-code').textContent = '#' + friendCode;
        
        // Carregar lista de amigos
        const friendsList = document.getElementById('friends-list');
        friendsList.innerHTML = '';
        
        if (friends.length === 0) {
            friendsList.innerHTML = `
                <p style="color:var(--text-muted);text-align:center;padding:15px;">
                    Ainda não tens amigos. Adiciona alguém pelo código!
                </p>`;
        } else {
            for (const friendId of friends) {
                const friendDoc = await db.collection('users').doc(friendId).get();
                const friendData = friendDoc.data() || {};
                
                const friendElement = document.createElement('div');
                friendElement.className = 'list-item';
                friendElement.innerHTML = `
                    <div class="list-item-avatar" style="background:${stringToColor(friendData.username || '?')};">
                        ${(friendData.username || '?')[0].toUpperCase()}
                    </div>
                    <div class="list-item-info">
                        <div class="list-item-name">${escapeHtml(friendData.username || 'Desconhecido')}</div>
                        <div class="list-item-sub">
                            ${friendData.nitro ? '⭐ Nitro' : ''} 
                            ${(friendData.badges || []).includes('vip') ? '💎 VIP' : ''}
                        </div>
                    </div>
                    <div class="list-item-actions">
                        <button class="btn btn-xs btn-primary" onclick="openDM('${friendId}')" title="Mensagem Privada">
                            💬
                        </button>
                    </div>
                `;
                friendsList.appendChild(friendElement);
            }
        }
        
        // Carregar lista de DMs
        loadDMList(friends);
        
    } catch (error) {
        console.error('Erro ao carregar amigos:', error);
    }
}

/**
 * Carrega lista de conversas privadas
 */
async function loadDMList(friends) {
    const dmList = document.getElementById('dm-list');
    dmList.innerHTML = '';
    
    if (!friends || friends.length === 0) {
        dmList.innerHTML = `
            <p style="color:var(--text-muted);text-align:center;padding:15px;">
                Adiciona amigos para conversar em privado.
            </p>`;
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
            <span style="color:var(--text-muted);font-size:11px;">💬</span>
        `;
        dmList.appendChild(dmElement);
    }
}

/**
 * Adiciona um amigo pelo código
 */
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
        // Procurar utilizador pelo código
        const snapshot = await db.collection('users')
            .where('friendCode', '==', parseInt(code))
            .limit(1)
            .get();
        
        if (snapshot.empty) {
            resultElement.textContent = 'Código inválido. Nenhum utilizador encontrado.';
            resultElement.style.color = 'var(--red)';
            return;
        }
        
        const friendDoc = snapshot.docs[0];
        const friendId = friendDoc.id;
        
        // Verificar se não é o próprio utilizador
        if (friendId === currentUser.uid) {
            resultElement.textContent = 'Não podes adicionar-te a ti mesmo!';
            resultElement.style.color = 'var(--red)';
            return;
        }
        
        // Verificar se já são amigos
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const userData = userDoc.data() || {};
        const friends = userData.friends || [];
        
        if (friends.includes(friendId)) {
            resultElement.textContent = 'Já são amigos!';
            resultElement.style.color = 'var(--yellow)';
            return;
        }
        
        // Adicionar amigo mutuamente
        await db.collection('users').doc(currentUser.uid).update({
            friends: firebase.firestore.FieldValue.arrayUnion(friendId)
        });
        
        await db.collection('users').doc(friendId).update({
            friends: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
        });
        
        const friendName = friendDoc.data().username || 'Utilizador';
        resultElement.textContent = '✅ Amigo adicionado: ' + friendName;
        resultElement.style.color = 'var(--green)';
        
        codeInput.value = '';
        showToast('Amigo adicionado com sucesso! 🎉');
        
        // Recarregar painel
        loadFriendsPanel();
        
    } catch (error) {
        console.error('Erro ao adicionar amigo:', error);
        resultElement.textContent = 'Erro ao adicionar amigo. Tenta novamente.';
        resultElement.style.color = 'var(--red)';
    }
}

/**
 * Abre uma conversa privada (DM)
 */
function openDM(friendId) {
    activeDM = friendId;
    currentChannel = null;
    
    // Limpar listener anterior
    if (unsubMessages) {
        unsubMessages();
    }
    
    // Criar ID único para o canal de DM
    const dmChannelId = [currentUser.uid, friendId].sort().join('_');
    
    document.getElementById('current-channel-name').textContent = '💬 Mensagem Privada';
    
    // Escutar mensagens da DM
    unsubMessages = db.collection('dms')
        .doc(dmChannelId)
        .collection('messages')
        .orderBy('timestamp', 'asc')
        .onSnapshot((snapshot) => {
            const chatBox = document.getElementById('chat-box');
            chatBox.innerHTML = '';
            
            if (snapshot.empty) {
                chatBox.innerHTML = `
                    <div class="empty-state">
                        <span class="icon">💬</span>
                        <span class="empty-title">Conversa Privada</span>
                        <span class="empty-desc">Nenhuma mensagem ainda. Diz olá!</span>
                    </div>`;
                return;
            }
            
            snapshot.forEach((doc) => {
                renderMessage(doc.data(), doc.id);
            });
            
            chatBox.scrollTop = chatBox.scrollHeight;
        }, (error) => {
            console.error('Erro ao carregar DM:', error);
        });
    
    // Ir para view de chat
    switchView('chat');
    
    // Fechar sidebar no mobile
    if (window.innerWidth <= 768) {
        toggleSidebar();
    }
}

/**
 * Envia mensagem privada
 */
async function sendDirectMessage(friendId, texto) {
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const userData = userDoc.data() || {};
        
        const dmChannelId = [currentUser.uid, friendId].sort().join('_');
        
        await db.collection('dms')
            .doc(dmChannelId)
            .collection('messages')
            .add({
                autor: currentUser.displayName || currentUser.email.split('@')[0],
                texto: texto,
                userId: currentUser.uid,
                hasNitro: userData.nitro || false,
                badges: userData.badges || [],
                reactions: {},
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
    } catch (error) {
        console.error('Erro ao enviar DM:', error);
        showToast('Erro ao enviar mensagem privada', true);
    }
}

// =============================================
// PAINEL NITRO
// =============================================

/**
 * Carrega o painel Nitro
 */
async function loadNitroPanel() {
    if (!currentUser) return;
    
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const userData = userDoc.data() || {};
        
        document.getElementById('nitro-balance').textContent = userData.balance || 0;
        
    } catch (error) {
        console.error('Erro ao carregar painel Nitro:', error);
    }
}

/**
 * Assina o Cord Nitro
 */
async function buyNitro() {
    if (!currentUser) return;
    
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const userData = userDoc.data() || {};
        const balance = userData.balance || 0;
        
        if (balance < 500) {
            showToast('Precisas de 500 🪙 para assinar o Nitro!', true);
            return;
        }
        
        // Verificar se já tem Nitro
        if (userData.nitro) {
            showToast('Já tens Nitro ativo! ⭐', true);
            return;
        }
        
        // Ativar Nitro
        const expiry = new Date();
        expiry.setMonth(expiry.getMonth() + 1);
        
        await db.collection('users').doc(currentUser.uid).update({
            nitro: true,
            nitroExpiry: firebase.firestore.Timestamp.fromDate(expiry),
            balance: firebase.firestore.FieldValue.increment(-500)
        });
        
        showToast('Nitro ativado! ⭐ Bem-vindo ao clube!', false);
        loadNitroPanel();
        
    } catch (error) {
        console.error('Erro ao comprar Nitro:', error);
        showToast('Erro ao processar a compra', true);
    }
}

/**
 * Compra um efeito de perfil
 */
async function buyEffect(effectType, price) {
    if (!currentUser) return;
    
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const userData = userDoc.data() || {};
        const balance = userData.balance || 0;
        const inventory = userData.inventory || [];
        
        if (balance < price) {
            showToast('Precisas de ' + price + ' 🪙 para este efeito!', true);
            return;
        }
        
        const effectId = 'effect_' + effectType;
        
        if (inventory.includes(effectId)) {
            showToast('Já tens este efeito!', true);
            return;
        }
        
        await db.collection('users').doc(currentUser.uid).update({
            balance: firebase.firestore.FieldValue.increment(-price),
            inventory: firebase.firestore.FieldValue.arrayUnion(effectId)
        });
        
        showToast('Efeito comprado com sucesso! ✨');
        loadNitroPanel();
        
    } catch (error) {
        console.error('Erro ao comprar efeito:', error);
        showToast('Erro ao processar a compra', true);
    }
}

/**
 * Compra um badge
 */
async function buyBadge(badgeType, price) {
    if (!currentUser) return;
    
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const userData = userDoc.data() || {};
        const balance = userData.balance || 0;
        const badges = userData.badges || [];
        
        if (balance < price) {
            showToast('Precisas de ' + price + ' 🪙 para este badge!', true);
            return;
        }
        
        if (badges.includes(badgeType)) {
            showToast('Já tens este badge!', true);
            return;
        }
        
        await db.collection('users').doc(currentUser.uid).update({
            balance: firebase.firestore.FieldValue.increment(-price),
            badges: firebase.firestore.FieldValue.arrayUnion(badgeType)
        });
        
        showToast('Badge comprado com sucesso! 🏅');
        loadNitroPanel();
        
    } catch (error) {
        console.error('Erro ao comprar badge:', error);
        showToast('Erro ao processar a compra', true);
    }
}

/**
 * Recompensa diária de moedas
 */
async function dailyReward() {
    if (!currentUser) return;
    
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const userData = userDoc.data() || {};
        const now = new Date();
        const lastDaily = userData.lastDaily ? userData.lastDaily.toDate() : null;
        
        // Verificar se já recebeu hoje
        if (lastDaily && now.toDateString() === lastDaily.toDateString()) {
            showToast('Já recebeste a recompensa hoje! Volta amanhã.', true);
            return;
        }
        
        // Gerar recompensa aleatória (50-100)
        const reward = 50 + Math.floor(Math.random() * 51);
        
        await db.collection('users').doc(currentUser.uid).update({
            balance: firebase.firestore.FieldValue.increment(reward),
            lastDaily: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showToast('🎁 Recebeste ' + reward + ' 🪙! Volta amanhã para mais.');
        loadNitroPanel();
        
    } catch (error) {
        console.error('Erro na recompensa diária:', error);
        showToast('Erro ao processar recompensa', true);
    }
}

// =============================================
// PAINEL DE MEMBROS
// =============================================

/**
 * Carrega o painel de membros
 */
async function loadMembersPanel() {
    if (!currentServer) {
        document.getElementById('members-list').innerHTML = `
            <p style="color:var(--text-muted);text-align:center;padding:15px;">
                Seleciona um servidor primeiro.
            </p>`;
        document.getElementById('invite-code-display').textContent = 'Nenhum';
        return;
    }
    
    try {
        const serverDoc = await db.collection('servers').doc(currentServer).get();
        if (!serverDoc.exists) return;
        
        const serverData = serverDoc.data();
        const members = serverData.members || [];
        const invites = serverData.invites || [];
        const roles = serverData.roles || [];
        
        // Mostrar código de convite
        const lastInvite = invites.length > 0 ? invites[invites.length - 1] : 'Nenhum';
        document.getElementById('invite-code-display').textContent = lastInvite;
        
        // Carregar lista de membros
        const membersList = document.getElementById('members-list');
        membersList.innerHTML = '';
        
        if (members.length === 0) {
            membersList.innerHTML = `
                <p style="color:var(--text-muted);text-align:center;padding:15px;">
                    Nenhum membro no servidor.
                </p>`;
        } else {
            for (const memberId of members) {
                const userDoc = await db.collection('users').doc(memberId).get();
                const userData = userDoc.data() || {};
                const isOwner = memberId === serverData.ownerId;
                const isNitro = userData.nitro || false;
                const memberRoles = (userData.roles || []).filter(r => 
                    roles.some(role => role.id === r)
                );
                
                const memberElement = document.createElement('div');
                memberElement.className = 'list-item';
                memberElement.innerHTML = `
                    <div class="list-item-avatar" style="background:${stringToColor(userData.username || memberId)};">
                        ${(userData.username || '?')[0].toUpperCase()}
                        ${isNitro ? '<div class="avatar-frame nitro-glow" style="position:absolute;inset:-2px;border-radius:50%;"></div>' : ''}
                    </div>
                    <div class="list-item-info">
                        <div class="list-item-name">
                            ${escapeHtml(userData.username || 'Desconhecido')}
                            ${isOwner ? ' 👑' : ''}
                        </div>
                        <div class="list-item-sub">
                            ${isNitro ? '⭐ Nitro ' : ''}
                            ${memberRoles.map(r => 
                                `<span style="color:${r.color};font-size:10px;">● ${r.name}</span>`
                            ).join(' ')}
                        </div>
                    </div>
                `;
                membersList.appendChild(memberElement);
            }
        }
        
        // Carregar cargos
        loadRolesList(roles);
        
    } catch (error) {
        console.error('Erro ao carregar membros:', error);
    }
}

/**
 * Carrega a lista de cargos
 */
function loadRolesList(roles) {
    const rolesList = document.getElementById('roles-list');
    
    if (!roles || roles.length === 0) {
        rolesList.innerHTML = `
            <p style="color:var(--text-muted);text-align:center;padding:10px;">
                Nenhum cargo criado ainda.
            </p>`;
        return;
    }
    
    rolesList.innerHTML = '';
    
    roles.forEach((role) => {
        const roleElement = document.createElement('div');
        roleElement.className = 'shop-item';
        roleElement.innerHTML = `
            <div class="shop-item-info">
                <div class="shop-item-name" style="color:${role.color};">
                    ● ${escapeHtml(role.name)}
                </div>
            </div>
            <button class="btn btn-xs btn-primary" onclick="assignRoleToMember('${role.id}')">
                Atribuir
            </button>
        `;
        rolesList.appendChild(roleElement);
    });
}

/**
 * Gera um novo código de convite
 */
async function generateInvite() {
    if (!currentServer) {
        showToast('Seleciona um servidor primeiro!', true);
        return;
    }
    
    try {
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        await db.collection('servers').doc(currentServer).update({
            invites: firebase.firestore.FieldValue.arrayUnion(code)
        });
        
        document.getElementById('invite-code-display').textContent = code;
        showToast('Convite gerado: ' + code);
        
    } catch (error) {
        console.error('Erro ao gerar convite:', error);
        showToast('Erro ao gerar convite', true);
    }
}

/**
 * Copia o código de convite
 */
function copyInviteCode() {
    const code = document.getElementById('invite-code-display').textContent;
    
    if (code === 'Nenhum') {
        showToast('Gera um convite primeiro!', true);
        return;
    }
    
    navigator.clipboard.writeText(code).then(() => {
        showToast('Código copiado! 📋');
    }).catch(() => {
        showToast('Erro ao copiar', true);
    });
}

/**
 * Entra num servidor por código de convite
 */
async function joinServerByInvite() {
    if (!currentUser) return;
    
    const codeInput = document.getElementById('join-invite-code');
    const code = codeInput.value.trim().toUpperCase();
    
    if (!code) {
        showToast('Insere um código de convite!', true);
        return;
    }
    
    try {
        const snapshot = await db.collection('servers')
            .where('invites', 'array-contains', code)
            .limit(1)
            .get();
        
        if (snapshot.empty) {
            showToast('Código de convite inválido!', true);
            return;
        }
        
        const serverDoc = snapshot.docs[0];
        const serverData = serverDoc.data();
        
        // Verificar se já é membro
        if (serverData.members && serverData.members.includes(currentUser.uid)) {
            showToast('Já estás neste servidor!', true);
            return;
        }
        
        // Adicionar como membro
        await db.collection('servers').doc(serverDoc.id).update({
            members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
        });
        
        codeInput.value = '';
        showToast('🎉 Entraste no servidor: ' + serverData.name);
        loadServers();
        
    } catch (error) {
        console.error('Erro ao entrar no servidor:', error);
        showToast('Erro ao processar convite', true);
    }
}

/**
 * Adiciona um novo cargo ao servidor
 */
async function addRole() {
    if (!currentServer) {
        showToast('Seleciona um servidor primeiro!', true);
        return;
    }
    
    const roleName = prompt('Nome do cargo:');
    if (!roleName || !roleName.trim()) return;
    
    const roleColor = prompt('Cor do cargo (ex: #ff0000):', '#6366f1');
    if (!roleColor || !roleColor.trim()) return;
    
    try {
        const serverDoc = await db.collection('servers').doc(currentServer).get();
        const serverData = serverDoc.data() || {};
        const roles = serverData.roles || [];
        
        const newRole = {
            id: 'role_' + Date.now(),
            name: roleName.trim(),
            color: roleColor.trim()
        };
        
        roles.push(newRole);
        
        await db.collection('servers').doc(currentServer).update({
            roles: roles
        });
        
        showToast('Cargo criado: ' + newRole.name);
        loadMembersPanel();
        
    } catch (error) {
        console.error('Erro ao criar cargo:', error);
        showToast('Erro ao criar cargo', true);
    }
}

/**
 * Atribui um cargo a um membro
 */
async function assignRoleToMember(roleId) {
    if (!currentServer) return;
    
    const memberId = prompt('ID do membro (visível na lista):');
    if (!memberId || !memberId.trim()) return;
    
    try {
        await db.collection('users').doc(memberId.trim()).update({
            roles: firebase.firestore.FieldValue.arrayUnion(roleId)
        });
        
        showToast('Cargo atribuído! 🎖️');
        loadMembersPanel();
        
    } catch (error) {
        console.error('Erro ao atribuir cargo:', error);
        showToast('Erro ao atribuir cargo. Verifica o ID.', true);
    }
}

// =============================================
// PAINEL DE BOTS
// =============================================

/**
 * Carrega o painel de bots
 */
function loadBotsPanel() {
    loadMyBots();
    loadBotServerSelects();
}

/**
 * Carrega os bots do utilizador
 */
function loadMyBots() {
    if (!currentUser) return;
    
    db.collection('bots')
        .where('ownerId', '==', currentUser.uid)
        .onSnapshot((snapshot) => {
            const botsList = document.getElementById('my-bots-list');
            botsList.innerHTML = '';
            
            if (snapshot.empty) {
                botsList.innerHTML = `
                    <p style="color:var(--text-muted);text-align:center;padding:15px;">
                        Nenhum bot criado ainda.
                    </p>`;
                return;
            }
            
            snapshot.forEach((doc) => {
                const bot = doc.data();
                const botElement = document.createElement('div');
                botElement.className = 'shop-item';
                botElement.innerHTML = `
                    <div class="shop-item-info">
                        <div class="shop-item-name">🤖 ${escapeHtml(bot.name)}</div>
                        <div class="shop-item-desc">
                            ${bot.active ? '🟢 Ativo' : '⚫ Inativo'} • 
                            ${bot.serverId ? 'Em servidor' : 'Sem servidor'}
                        </div>
                        <div class="token-display" onclick="copyBotToken('${doc.id}', this)" title="Clique para copiar o token">
                            ${(bot.token || '').substring(0, 15)}...
                            <span class="copied-tooltip">Copiado!</span>
                        </div>
                    </div>
                    <div style="display:flex;gap:4px;flex-shrink:0;">
                        <button class="btn btn-xs btn-primary" onclick="editBot('${doc.id}')">✏️</button>
                        <button class="btn btn-xs btn-danger" onclick="deleteBot('${doc.id}')">🗑️</button>
                    </div>
                `;
                botsList.appendChild(botElement);
            });
        });
}

/**
 * Carrega os selects para adicionar bot ao servidor
 */
async function loadBotServerSelects() {
    if (!currentUser) return;
    
    try {
        const botSelect = document.getElementById('select-bot-to-add');
        const serverSelect = document.getElementById('select-server-to-add');
        
        botSelect.innerHTML = '<option value="">Seleciona um bot...</option>';
        serverSelect.innerHTML = '<option value="">Seleciona um servidor...</option>';
        
        // Carregar bots do utilizador
        const botsSnapshot = await db.collection('bots')
            .where('ownerId', '==', currentUser.uid)
            .get();
        
        botsSnapshot.forEach((doc) => {
            const bot = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = bot.name + (bot.serverId ? ' (já em servidor)' : '');
            if (bot.serverId) option.disabled = true;
            botSelect.appendChild(option);
        });
        
        // Carregar servidores do utilizador
        const serversSnapshot = await db.collection('servers')
            .where('members', 'array-contains', currentUser.uid)
            .get();
        
        serversSnapshot.forEach((doc) => {
            const server = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = server.name;
            serverSelect.appendChild(option);
        });
        
    } catch (error) {
        console.error('Erro ao carregar selects:', error);
    }
}

/**
 * Cria um novo bot
 */
async function createBot() {
    if (!currentUser) return;
    
    const name = document.getElementById('new-bot-name').value.trim();
    const desc = document.getElementById('new-bot-desc').value.trim();
    
    if (!name) {
        showToast('Dá um nome ao bot!', true);
        return;
    }
    
    try {
        // Gerar token único
        const token = 'bot_' + Math.random().toString(36).substring(2, 15) + 
                      Math.random().toString(36).substring(2, 10);
        
        await db.collection('bots').add({
            name: name,
            desc: desc || 'Bot personalizado',
            token: token,
            ownerId: currentUser.uid,
            active: true,
            serverId: null,
            channelId: null,
            commands: {},
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Limpar campos
        document.getElementById('new-bot-name').value = '';
        document.getElementById('new-bot-desc').value = '';
        
        showToast('Bot criado com sucesso! 🤖 Copia o token para usar.');
        loadBotsPanel();
        
    } catch (error) {
        console.error('Erro ao criar bot:', error);
        showToast('Erro ao criar bot', true);
    }
}

/**
 * Adiciona um bot ao servidor
 */
async function addBotToServer() {
    if (!currentUser) return;
    
    const botId = document.getElementById('select-bot-to-add').value;
    const serverId = document.getElementById('select-server-to-add').value;
    
    if (!botId || !serverId) {
        showToast('Seleciona um bot e um servidor!', true);
        return;
    }
    
    try {
        // Atualizar bot
        await db.collection('bots').doc(botId).update({
            serverId: serverId,
            channelId: null
        });
        
        // Enviar mensagem de sistema no canal geral
        const botDoc = await db.collection('bots').doc(botId).get();
        const botName = (botDoc.data() || {}).name || 'Bot';
        
        const channelsSnapshot = await db.collection('servers')
            .doc(serverId)
            .collection('channels')
            .limit(1)
            .get();
        
        if (!channelsSnapshot.empty) {
            const channelId = channelsSnapshot.docs[0].id;
            
            await db.collection('servers')
                .doc(serverId)
                .collection('channels')
                .doc(channelId)
                .collection('messages')
                .add({
                    autor: 'Sistema',
                    texto: `🤖 O bot **${botName}** foi adicionado ao servidor!`,
                    userId: 'system',
                    isBot: false,
                    isSystem: true,
                    hasNitro: false,
                    badges: [],
                    reactions: {},
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
        }
        
        showToast('Bot adicionado ao servidor! 🎉');
        loadBotsPanel();
        
    } catch (error) {
        console.error('Erro ao adicionar bot:', error);
        showToast('Erro ao adicionar bot', true);
    }
}

/**
 * Edita um bot existente
 */
async function editBot(botId) {
    const newName = prompt('Novo nome do bot:');
    if (!newName || !newName.trim()) return;
    
    const newDesc = prompt('Nova descrição:', '') || '';
    
    const commandsStr = prompt(
        'Comandos personalizados (formato: !comando=resposta, !cmd2=resp2):\n' +
        'Exemplo: !ola=Olá mundo!, !adeus=Até logo!'
    );
    
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
        await db.collection('bots').doc(botId).update({
            name: newName.trim(),
            desc: newDesc.trim(),
            commands: commands
        });
        
        showToast('Bot atualizado! ✏️');
        
    } catch (error) {
        console.error('Erro ao editar bot:', error);
        showToast('Erro ao editar bot', true);
    }
}

/**
 * Remove um bot
 */
async function deleteBot(botId) {
    if (!confirm('Tens a certeza que queres apagar este bot? Esta ação é irreversível.')) {
        return;
    }
    
    try {
        await db.collection('bots').doc(botId).delete();
        showToast('Bot apagado 🗑️');
        loadBotsPanel();
        
    } catch (error) {
        console.error('Erro ao apagar bot:', error);
        showToast('Erro ao apagar bot', true);
    }
}

/**
 * Copia o token do bot
 */
async function copyBotToken(botId, element) {
    try {
        const botDoc = await db.collection('bots').doc(botId).get();
        const token = (botDoc.data() || {}).token || '';
        
        await navigator.clipboard.writeText(token);
        
        const tooltip = element.querySelector('.copied-tooltip');
        if (tooltip) {
            tooltip.classList.add('show');
            setTimeout(() => tooltip.classList.remove('show'), 1500);
        }
        
        showToast('Token copiado para a área de transferência! 📋');
        
    } catch (error) {
        console.error('Erro ao copiar token:', error);
        showToast('Erro ao copiar token', true);
    }
}

// =============================================
// PAINEL DE DEFINIÇÕES
// =============================================

/**
 * Carrega o painel de definições
 */
async function loadSettingsPanel() {
    if (!currentUser) return;
    
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const userData = userDoc.data() || {};
        
        // Preencher campos
        document.getElementById('settings-username').value = userData.username || '';
        document.getElementById('settings-bio').value = userData.bio || '';
        
        // Carregar inventário
        const inventory = userData.inventory || [];
        const inventoryList = document.getElementById('inventory-list');
        
        // Mapear nomes dos itens
        const itemNames = {
            'effect_glow': '✨ Efeito Glow',
            'effect_rainbow': '🌈 Moldura Arco-Íris',
            'effect_crystal': '💎 Moldura de Cristal',
            'badge_vip': '💎 Badge VIP',
            'badge_og': '👑 Badge OG',
            'badge_botmaster': '🤖 Badge Bot Master'
        };
        
        if (inventory.length === 0) {
            inventoryList.innerHTML = `
                <p style="color:var(--text-muted);text-align:center;padding:15px;">
                    O teu inventário está vazio. Visita a loja Nitro!
                </p>`;
        } else {
            inventoryList.innerHTML = inventory.map(item => `
                <div style="padding:8px 12px;background:var(--bg-tertiary);border-radius:var(--radius-sm);margin-bottom:4px;font-size:13px;">
                    ${itemNames[item] || item}
                </div>
            `).join('');
        }
        
    } catch (error) {
        console.error('Erro ao carregar definições:', error);
    }
}

/**
 * Guarda as alterações do perfil
 */
async function saveProfile() {
    if (!currentUser) return;
    
    const username = document.getElementById('settings-username').value.trim();
    const bio = document.getElementById('settings-bio').value.trim();
    
    if (!username) {
        showToast('O nome de utilizador não pode estar vazio!', true);
        return;
    }
    
    try {
        // Atualizar perfil no Auth
        await currentUser.updateProfile({
            displayName: username
        });
        
        // Atualizar documento no Firestore
        await db.collection('users').doc(currentUser.uid).update({
            username: username,
            bio: bio
        });
        
        // Atualizar interface
        document.getElementById('username-footer').textContent = username;
        document.getElementById('topbar-title').textContent = username;
        
        showToast('Perfil atualizado com sucesso! 💾');
        
    } catch (error) {
        console.error('Erro ao guardar perfil:', error);
        showToast('Erro ao guardar perfil', true);
    }
}

/**
 * Muda o tema da aplicação
 */
function changeTheme(theme) {
    const themes = {
        dark: {
            '--bg-primary': '#1a1b1e',
            '--bg-secondary': '#1f2024',
            '--bg-tertiary': '#2a2b30',
            '--bg-card': '#25262b',
            '--bg-input': '#1a1b20',
            '--text-normal': '#e4e4e7',
            '--text-muted': '#a1a1aa',
            '--text-bright': '#ffffff',
            '--border-subtle': 'rgba(255, 255, 255, 0.06)',
            '--border-medium': 'rgba(255, 255, 255, 0.1)'
        },
        light: {
            '--bg-primary': '#f4f4f5',
            '--bg-secondary': '#ffffff',
            '--bg-tertiary': '#e4e4e7',
            '--bg-card': '#fafafa',
            '--bg-input': '#ffffff',
            '--text-normal': '#18181b',
            '--text-muted': '#71717a',
            '--text-bright': '#09090b',
            '--border-subtle': 'rgba(0, 0, 0, 0.08)',
            '--border-medium': 'rgba(0, 0, 0, 0.12)'
        },
        midnight: {
            '--bg-primary': '#09090b',
            '--bg-secondary': '#0f0f14',
            '--bg-tertiary': '#1a1a24',
            '--bg-card': '#12121a',
            '--bg-input': '#0a0a10',
            '--text-normal': '#d4d4d8',
            '--text-muted': '#71717a',
            '--text-bright': '#fafafa',
            '--border-subtle': 'rgba(255, 255, 255, 0.04)',
            '--border-medium': 'rgba(255, 255, 255, 0.07)'
        }
    };
    
    const themeColors = themes[theme] || themes.dark;
    
    for (const [property, value] of Object.entries(themeColors)) {
        document.documentElement.style.setProperty(property, value);
    }
    
    const themeNames = {
        dark: '🌙 Escuro',
        light: '☀️ Claro',
        midnight: '🌑 Meia-Noite'
    };
    
    showToast('Tema alterado: ' + (themeNames[theme] || theme));
}

// =============================================
// MODAIS
// =============================================

/**
 * Mostra o modal de criar servidor
 */
function showServerModal() {
    document.getElementById('server-modal').style.display = 'flex';
    document.getElementById('server-name').focus();
}

/**
 * Mostra o modal de criar canal
 */
function showChannelModal() {
    if (!currentServer) {
        showToast('Seleciona um servidor primeiro!', true);
        return;
    }
    document.getElementById('channel-modal').style.display = 'flex';
    document.getElementById('channel-name').focus();
}

/**
 * Fecha um modal
 */
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

/**
 * Cria um novo servidor
 */
async function createServer() {
    if (!currentUser) return;
    
    const name = document.getElementById('server-name').value.trim();
    
    if (!name) {
        showToast('Dá um nome ao servidor!', true);
        return;
    }
    
    try {
        // Criar servidor
        const serverRef = await db.collection('servers').add({
            name: name,
            ownerId: currentUser.uid,
            members: [currentUser.uid],
            invites: [],
            roles: [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Criar canal padrão "geral"
        await db.collection('servers')
            .doc(serverRef.id)
            .collection('channels')
            .add({
                name: 'geral',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        
        // Fechar modal e limpar
        closeModal('server-modal');
        document.getElementById('server-name').value = '';
        
        showToast('Servidor criado com sucesso! 🎉');
        
    } catch (error) {
        console.error('Erro ao criar servidor:', error);
        showToast('Erro ao criar servidor', true);
    }
}

/**
 * Cria um novo canal
 */
async function createChannel() {
    if (!currentServer) return;
    
    const name = document.getElementById('channel-name').value.trim();
    
    if (!name) {
        showToast('Dá um nome ao canal!', true);
        return;
    }
    
    try {
        await db.collection('servers')
            .doc(currentServer)
            .collection('channels')
            .add({
                name: name,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        
        closeModal('channel-modal');
        document.getElementById('channel-name').value = '';
        
        showToast('Canal #' + name + ' criado!');
        
    } catch (error) {
        console.error('Erro ao criar canal:', error);
        showToast('Erro ao criar canal', true);
    }
}

// =============================================
// UI HELPERS
// =============================================

/**
 * Alterna a sidebar no mobile
 */
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    
    sidebar.classList.toggle('open');
    overlay.classList.toggle('show');
}

/**
 * Mostra uma notificação toast
 */
function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    
    toast.textContent = message;
    toast.className = 'toast';
    
    if (isError) {
        toast.classList.add('error');
    }
    
    toast.classList.add('show');
    
    // Esconder após 2.5 segundos
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
}

/**
 * Escapa HTML para prevenir XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Gera uma cor baseada numa string
 */
function stringToColor(str) {
    if (!str) return 'hsl(0, 0%, 50%)';
    
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 60%, 55%)`;
}

/**
 * Formata o texto da mensagem (menções, código, negrito)
 */
function formatMessageText(text) {
    if (!text) return '';
    
    // Menções @username
    text = text.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
    
    // Código inline `code`
    text = text.replace(/`([^`]+)`/g, '<span class="code-inline">$1</span>');
    
    // Negrito **texto**
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    
    // Itálico *texto*
    text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
    
    return text;
}

// =============================================
// EVENT LISTENERS
// =============================================

// Fechar modais ao clicar fora
document.getElementById('server-modal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeModal('server-modal');
    }
});

document.getElementById('channel-modal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeModal('channel-modal');
    }
});

// Auto-resize do textarea de chat
document.getElementById('msg-input').addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 100) + 'px';
});

// Fechar sidebar ao clicar no overlay
document.getElementById('sidebar-overlay').addEventListener('click', function() {
    toggleSidebar();
});

// Prevenir zoom em mobile
document.addEventListener('gesturestart', function(e) {
    e.preventDefault();
});

// =============================================
// INICIALIZAÇÃO
// =============================================

console.log('🐺 Cord - Rede Social Completa');
console.log('Inicializado com sucesso!');
console.log('Usa !help no chat para ver os comandos disponíveis.');
