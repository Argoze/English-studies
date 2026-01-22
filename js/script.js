// State Management
let logs = [];
let fullLogs = [];
let fullCards = [];
let currentCardIndex = 0;
let isEditingCard = false; // State for edit mode
let supabaseClient = null;

// Config (hard‑coded for always‑on connection)
const SB_URL = "https://erwxfqhwahkyawgkbsxs.supabase.co";
const SB_KEY = "sb_publishable_fA02Xl6DiAr61Mc53DxKfA_K9BjI7n3";

// ---------- Initialization ----------
function initApp() {
    console.log("Initializing app...");
    // Load local data first
    try {
        logs = JSON.parse(localStorage.getItem('study_logs')) || [];
        cards = JSON.parse(localStorage.getItem('study_cards')) || [];
    } catch (e) {
        console.error("Local storage parse error", e);
        logs = [];
        cards = [];
    }
    renderLogs();
    renderCardsGrid();

    // Try to connect to Supabase (hard‑coded)
    if (typeof window.supabase !== 'undefined') {
        try {
            supabaseClient = window.supabase.createClient(SB_URL, SB_KEY);
            loadFromSupabase();
        } catch (e) {
            console.error("Supabase init error", e);
        }
    } else {
        console.warn("Supabase library not loaded – running offline");
    }

    // Load config into settings UI if exists
    if (localStorage.getItem('supabase_url')) document.getElementById('supabase-url').value = localStorage.getItem('supabase_url');
    if (localStorage.getItem('supabase_key')) document.getElementById('supabase-key').value = localStorage.getItem('supabase_key');

    // Init Modal Click Outside Listeners
    initModalClosers();
}

function initModalClosers() {
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                // Determine which modal to close based on ID
                if (overlay.id === 'journal-modal') closeJournalModal();
                if (overlay.id === 'study-modal') closeStudyModal();
                if (overlay.id === 'settings-modal') closeSettingsModal();
            }
        });
    });
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initApp();
} else {
    document.addEventListener('DOMContentLoaded', initApp);
}

// ---------- Supabase sync helpers ----------
async function loadFromSupabase() {
    if (!supabaseClient) return;
    // Logs
    const { data: dbLogs, error: logError } = await supabaseClient.from('logs').select('*').order('id', { ascending: false });
    if (!logError && dbLogs) {
        logs = dbLogs;
        fullLogs = [...logs];
        renderLogs();
        calculateStreak();
        localStorage.setItem('study_logs', JSON.stringify(logs));
    }
    // Cards
    const { data: dbCards, error: cardError } = await supabaseClient.from('cards').select('*');
    if (!cardError && dbCards) {
        cards = dbCards;
        fullCards = [...cards];
        renderCardsGrid();
        localStorage.setItem('study_cards', JSON.stringify(cards));
    }
}

// ---------- Navigation ----------
function switchView(viewId, btnEl) {
    document.querySelectorAll('.view-section').forEach(sec => {
        sec.classList.toggle('active', sec.id === viewId);
    });
    if (btnEl) {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        btnEl.classList.add('active');
    }
}
window.switchView = switchView;

// ---------- Journal (Grid & Modal) ----------
// 1. Render Grid
function renderLogs() {
    const grid = document.getElementById('logs-grid');
    if (!grid) return;

    if (logs.length === 0) {
        grid.innerHTML = '<p style="text-align:center;width:100%;">Nenhum registro encontrado. Escreva algo hoje!</p>';
        return;
    }

    grid.innerHTML = logs.map((log, index) => {
        // Create a plain text preview (strip simple markdown)
        const preview = log.content.replace(/[#*`]/g, '').slice(0, 100) + (log.content.length > 100 ? '...' : '');
        return `
        <div class="grid-card" onclick="openJournalModal(${log.id})" style="aspect-ratio:auto; min-height:200px; align-items:start; padding:1.5rem; text-align:left;">
            <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.5rem;">${log.date}</div>
            <h3 style="color:var(--accent); margin-bottom:0.5rem; font-size:1.2rem;">${log.topic}</h3>
            ${log.tags ? `<div class="tags-container" style="justify-content:flex-start;">${log.tags.split(',').slice(0, 3).map(t => `<span class="tag-chip" style="font-size:0.6rem;">${t.trim()}</span>`).join('')}</div>` : ''}
            <p style="font-size:0.9rem; color:var(--text-primary); margin-top:1rem; opacity:0.8; line-height:1.4;">${preview}</p>
        </div>`;
    }).join('');
}
window.renderLogs = renderLogs;

// 2. Add Log
function addLog() {
    const topicEl = document.getElementById('log-topic');
    const contentEl = document.getElementById('log-content');
    if (!topicEl || !contentEl) return;

    const topic = topicEl.value.trim();
    const tagsVal = document.getElementById('log-tags')?.value.trim() || '';
    const content = contentEl.value.trim();

    if (!topic || !content) return alert('Preencha tópico e conteúdo');

    const entry = {
        id: Date.now(),
        date: new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        topic,
        tags: tagsVal,
        content
    };
    logs.unshift(entry);
    fullLogs.unshift(entry);

    renderLogs();
    calculateStreak();

    if (supabaseClient) {
        supabaseClient.from('logs').insert([entry]).then(({ error }) => {
            if (error) console.error('Supabase insert error', error);
        });
    }
    saveLogs();

    topicEl.value = '';
    contentEl.value = '';
    document.getElementById('log-tags').value = '';
}
window.addLog = addLog;

function saveLogs() {
    localStorage.setItem('study_logs', JSON.stringify(logs));
}

// 3. Journal Modal Logic
function openJournalModal(id) {
    const log = logs.find(l => l.id == id);
    if (!log) return;

    renderLogModalContent(log);
    document.getElementById('journal-modal').style.display = 'flex';
}
window.openJournalModal = openJournalModal;

function closeJournalModal() {
    document.getElementById('journal-modal').style.display = 'none';
}
window.closeJournalModal = closeJournalModal;

// Safe Edit Helper
function enableLogEdit(id) {
    const log = logs.find(l => l.id == id);
    if (log) {
        renderLogModalContent(log, true);
    }
}
window.enableLogEdit = enableLogEdit;

function renderLogModalContent(log, isEditing = false) {
    const body = document.getElementById('journal-modal-body');
    const parse = (typeof marked !== 'undefined' && marked.parse) ? marked.parse : text => text;

    if (isEditing) {
        // Edit Form
        body.innerHTML = `
            <input type="text" id="edit-topic" value="${log.topic}" class="edit-card-input" style="height:auto; margin-bottom:1rem; font-size:1.5rem; font-weight:bold; width:100%;">
            <input type="text" id="edit-tags" value="${log.tags || ''}" placeholder="Tags (ex: react, grammar)" class="edit-card-input" style="height:auto; margin-bottom:1rem; font-size:1rem; width:100%;">
            <textarea id="edit-content" class="edit-card-input" rows="10" style="font-size:1rem; line-height:1.6; width:100%;">${log.content}</textarea>
            <div style="margin-top:1rem; text-align:right;">
                <button class="nav-btn" onclick="openJournalModal(${log.id})">Cancelar</button>
                <button class="nav-btn active" onclick="saveLogEdit(${log.id})">Salvar</button>
            </div>
        `;
    } else {
        // Read View - using enableLogEdit(id) to avoid inline object parsing issues
        body.innerHTML = `
            <div style="border-bottom:1px solid var(--glass-border); padding-bottom:1rem; margin-bottom:1rem;">
                <div style="font-size:0.9rem; color:var(--text-secondary); margin-bottom:0.5rem;">${log.date}</div>
                <h2 style="color:var(--accent); margin-bottom:0.5rem;">${log.topic}</h2>
                ${log.tags ? `<div class="tags-container">${log.tags.split(',').map(t => `<span class="tag-chip">${t.trim()}</span>`).join('')}</div>` : ''}
            </div>
            <div class="log-content-body">${parse(log.content)}</div>
            <div style="margin-top:2rem; border-top:1px solid var(--glass-border); padding-top:1rem; display:flex; justify-content:flex-end; gap:1rem;">
                <button class="edit-btn" onclick="enableLogEdit(${log.id})">✏️ Editar</button>
                <button class="delete-btn" onclick="deleteLog(${log.id})">🗑️ Apagar</button>
            </div>
            <!-- Added Footer Close Button -->
            <button onclick="closeJournalModal()" class="nav-btn" style="width:100%; margin-top:2rem; background:rgba(255,255,255,0.05); border:1px solid var(--glass-border);">Fechar Leitura</button>
        `;
    }
}
window.renderLogModalContent = renderLogModalContent;


function saveLogEdit(id) {
    const topicVal = document.getElementById('edit-topic').value.trim();
    const tagsVal = document.getElementById('edit-tags').value.trim();
    const contentVal = document.getElementById('edit-content').value.trim();

    if (!topicVal || !contentVal) return alert('Tópico e Conteúdo são obrigatórios');

    const logIndex = logs.findIndex(l => l.id == id);
    if (logIndex !== -1) {
        logs[logIndex].topic = topicVal;
        logs[logIndex].tags = tagsVal;
        logs[logIndex].content = contentVal;

        // Sync full
        const fIdx = fullLogs.findIndex(l => l.id == id);
        if (fIdx !== -1) fullLogs[fIdx] = logs[logIndex];
    }

    saveLogs(); // Local

    if (supabaseClient) {
        supabaseClient.from('logs').update({
            topic: topicVal,
            tags: tagsVal,
            content: contentVal
        }).eq('id', id).then(({ error }) => {
            if (error) console.error('Supabase log update error', error);
        });
    }

    renderLogs(); // Update Grid
    openJournalModal(id); // Re-render modal in read mode
}
window.saveLogEdit = saveLogEdit;

function deleteLog(id) {
    if (!confirm('Apagar este registro?')) return;

    logs = logs.filter(l => l.id != id);
    fullLogs = fullLogs.filter(l => l.id != id);

    renderLogs();
    saveLogs();

    if (supabaseClient) {
        supabaseClient.from('logs').delete().eq('id', id).then(({ error }) => {
            if (error) console.error('Supabase delete error', error);
        });
    }

    closeJournalModal();
}
window.deleteLog = deleteLog;


// ---------- Flashcards (Grid & Modal) ----------

// 1. Render Grid
function renderCardsGrid() {
    const grid = document.getElementById('cards-grid');
    if (!grid) return;

    if (cards.length === 0) {
        grid.innerHTML = '<p style="text-align:center;width:100%;">Nenhum cartão encontrado. Adicione um acima!</p>';
        return;
    }

    grid.innerHTML = cards.map((card, index) => `
        <div class="grid-card" onclick="openStudyModal(${index})">
            <label>PERGUNTA</label>
            <div class="grid-card-content">${card.front}</div>
        </div>
    `).join('');
}
window.renderCardsGrid = renderCardsGrid;

// 2. Add Card
function addCard() {
    const frontEl = document.getElementById('card-front');
    const backEl = document.getElementById('card-back');
    if (!frontEl || !backEl) return alert('Campos de cartão não encontrados');
    const front = frontEl.value.trim();
    const back = backEl.value.trim();
    if (!front || !back) return alert('Preencha frente e verso');
    const newCard = { id: Date.now(), front, back };

    cards.push(newCard);
    fullCards.push(newCard); // Sync master list

    if (supabaseClient) {
        supabaseClient.from('cards').insert([newCard]).then(({ error }) => {
            if (error) console.error('Supabase card error', error);
        });
    }
    localStorage.setItem('study_cards', JSON.stringify(cards));
    frontEl.value = '';
    backEl.value = '';

    renderCardsGrid();
    alert('Cartão adicionado!');
}
window.addCard = addCard;

// 3. Modal Logic
function openStudyModal(index) {
    currentCardIndex = index;
    renderCardInModal();
    document.getElementById('study-modal').style.display = 'flex';
}
window.openStudyModal = openStudyModal;

function closeStudyModal() {
    // If editing, maybe prompt or just cancel edit?
    if (isEditingCard) toggleEditCard(); // Force exit edit mode
    document.getElementById('study-modal').style.display = 'none';
}
window.closeStudyModal = closeStudyModal;

function renderCardInModal() {
    if (cards.length === 0) return;
    const card = cards[currentCardIndex];
    const front = document.getElementById('card-front-text');
    const back = document.getElementById('card-back-text');
    const el = document.getElementById('active-card');

    // Reset state
    if (el) el.classList.remove('flipped');

    // Safety check if elements exist (modal might be hidden/removed)
    if (front) front.textContent = card.front;
    if (back) back.textContent = card.back;
}

function flipCard() {
    if (isEditingCard) return;
    document.getElementById('active-card').classList.toggle('flipped');
}
window.flipCard = flipCard;

function nextCard() {
    if (cards.length === 0) return;
    currentCardIndex = (currentCardIndex + 1) % cards.length;
    renderCardInModal();
}

function prevCard() {
    if (cards.length === 0) return;
    currentCardIndex = (currentCardIndex - 1 + cards.length) % cards.length;
    renderCardInModal();
}
window.nextCard = nextCard;
window.prevCard = prevCard;

function deleteCurrentCard() {
    if (cards.length === 0) return;
    if (!confirm('Apagar este cartão?')) return;

    const toDel = cards[currentCardIndex];
    cards.splice(currentCardIndex, 1);
    // Also remove from master list if needed, or rely on reload
    const masterIdx = fullCards.findIndex(c => c.id === toDel.id);
    if (masterIdx !== -1) fullCards.splice(masterIdx, 1);

    if (supabaseClient && toDel.id) {
        supabaseClient.from('cards').delete().eq('id', toDel.id).then(({ error }) => {
            if (error) console.error('Supabase del card error', error);
        });
    }
    localStorage.setItem('study_cards', JSON.stringify(cards));

    if (cards.length === 0) {
        closeStudyModal();
        renderCardsGrid();
    } else {
        if (currentCardIndex >= cards.length) currentCardIndex = 0;
        renderCardInModal();
        renderCardsGrid(); // Update background grid too
    }
}
window.deleteCurrentCard = deleteCurrentCard;

function toggleEditCard() {
    if (cards.length === 0) return;
    isEditingCard = !isEditingCard;

    // Scoped selectors within the modal
    const modalContent = document.querySelector('.modal-content');
    const btn = modalContent.querySelector('#edit-card-btn');
    const deleteBtn = modalContent.querySelector('.delete-btn');
    const navs = modalContent.querySelectorAll('.nav-btn');
    const activeCard = document.getElementById('active-card');

    if (isEditingCard) {
        // Enter Edit Mode
        const card = cards[currentCardIndex];

        navs.forEach(b => b.disabled = true);
        deleteBtn.style.display = 'none';

        // Force front side
        activeCard.classList.remove('flipped');

        const frontContainer = activeCard.querySelector('.card-front .card-content');
        const backContainer = activeCard.querySelector('.card-back .card-content');

        frontContainer.innerHTML = `<textarea id="edit-front-input" class="edit-card-input" placeholder="Pergunta" onclick="event.stopPropagation()">${card.front}</textarea>`;
        backContainer.innerHTML = `<textarea id="edit-back-input" class="edit-card-input" placeholder="Resposta" onclick="event.stopPropagation()">${card.back}</textarea>`;

        btn.textContent = '💾';
        btn.title = 'Salvar Alterações';
    } else {
        // Save Changes
        saveCardEdit();
    }
}
window.toggleEditCard = toggleEditCard;

function saveCardEdit() {
    const frontVal = document.getElementById('edit-front-input').value.trim();
    const backVal = document.getElementById('edit-back-input').value.trim();

    if (!frontVal || !backVal) {
        alert('Os campos não podem ficar vazios!');
        isEditingCard = true;
        return;
    }

    const card = cards[currentCardIndex];
    card.front = frontVal;
    card.back = backVal;

    // Update master list
    const masterIdx = fullCards.findIndex(c => c.id === card.id);
    if (masterIdx !== -1) fullCards[masterIdx] = card;

    localStorage.setItem('study_cards', JSON.stringify(cards));

    if (supabaseClient && card.id) {
        supabaseClient.from('cards').update({ front: frontVal, back: backVal }).eq('id', card.id).then(({ error }) => {
            if (error) console.error('Supabase update error', error);
        });
    }

    // Restore UI
    const modalContent = document.querySelector('.modal-content');
    const navs = modalContent.querySelectorAll('.nav-btn');
    const deleteBtn = modalContent.querySelector('.delete-btn');
    navs.forEach(b => b.disabled = false);
    deleteBtn.style.display = 'inline-block';

    renderCardInModal(); // Restore HTML
    renderCardsGrid();   // Update Grid Background

    const btn = document.getElementById('edit-card-btn');
    btn.textContent = '✏️';
    btn.title = 'Editar Cartão';
}
window.saveCardEdit = saveCardEdit;

// ---------- Search & Streak ----------
function handleSearch(query) {
    const term = query.toLowerCase();

    if (!term) {
        logs = [...fullLogs];
        cards = [...fullCards];
    } else {
        logs = fullLogs.filter(log =>
            log.topic.toLowerCase().includes(term) ||
            log.content.toLowerCase().includes(term) ||
            (log.tags && log.tags.toLowerCase().includes(term))
        );
        cards = fullCards.filter(card =>
            card.front.toLowerCase().includes(term) ||
            card.back.toLowerCase().includes(term)
        );
    }

    renderLogs();
    renderCardsGrid(); // Will allow user to see search results in Grid
}
window.handleSearch = handleSearch;

function calculateStreak() {
    if (!logs || logs.length === 0) {
        updateStreakDisplay(0);
        return;
    }
    const uniqueDays = [...new Set(logs.map(l => {
        const d = new Date(l.id);
        return d.toISOString().split('T')[0];
    }))].sort().reverse();

    if (uniqueDays.length === 0) {
        updateStreakDisplay(0);
        return;
    }

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    if (uniqueDays[0] !== today && uniqueDays[0] !== yesterday) {
        updateStreakDisplay(0);
        return;
    }

    let streak = 1;
    let currentCheck = uniqueDays[0];
    for (let i = 1; i < uniqueDays.length; i++) {
        const expectedPrev = new Date(new Date(currentCheck).getTime() - 86400000).toISOString().split('T')[0];
        if (uniqueDays[i] === expectedPrev) {
            streak++;
            currentCheck = expectedPrev;
        } else {
            break;
        }
    }
    updateStreakDisplay(streak);
}
window.calculateStreak = calculateStreak;

function updateStreakDisplay(days) {
    const el = document.getElementById('streak-display');
    if (el) {
        el.style.display = 'inline-block';
        el.innerHTML = `🔥 ${days} dia${days !== 1 ? 's' : ''} seguido${days !== 1 ? 's' : ''}!`;
    }
}

// ---------- Settings / Data ----------
function openSettingsModal() {
    document.getElementById('settings-modal').style.display = 'flex';
}
window.openSettingsModal = openSettingsModal;

function closeSettingsModal() {
    document.getElementById('settings-modal').style.display = 'none';
}
window.closeSettingsModal = closeSettingsModal;

function saveConnection() {
    const url = document.getElementById('supabase-url').value;
    const key = document.getElementById('supabase-key').value;
    localStorage.setItem('supabase_url', url);
    localStorage.setItem('supabase_key', key);
    alert('Conexão salva! Recarregando...');
    location.reload();
}
window.saveConnection = saveConnection;

// Export/Import reusing existing logic
function exportData() {
    const data = { logs, cards, exportDate: new Date().toISOString() };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data));
    const a = document.createElement('a');
    a.setAttribute('href', dataStr);
    a.setAttribute('download', 'meus_estudos_backup.json');
    document.body.appendChild(a);
    a.click();
    a.remove();
}
window.exportData = exportData;

function importData(input) {
    if (!confirm('Esta ação substituirá TODOS os dados atuais. Continuar?')) { if (input) input.value = ''; return; }
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.logs) {
                logs = data.logs;
                fullLogs = [...logs];
                localStorage.setItem('study_logs', JSON.stringify(logs));
            }
            if (data.cards) {
                cards = data.cards;
                fullCards = [...cards];
                localStorage.setItem('study_cards', JSON.stringify(cards));
            }
            renderLogs();
            renderCardsGrid();
            calculateStreak();
            alert('Backup restaurado com sucesso! Seus dados agora estão neste navegador.');
            closeSettingsModal();
        } catch (err) { alert('Erro ao ler backup'); console.error(err); }
    };
    reader.readAsText(file);
    input.value = '';
}
window.importData = importData;
