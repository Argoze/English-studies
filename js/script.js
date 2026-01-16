// State Management
let logs = [];
let cards = [];
let fullLogs = [];
let fullCards = [];
let currentCardIndex = 0;
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
    if (cards.length > 0) renderCard(0);

    // Try to connect to Supabase (hard‑coded)
    if (typeof window.supabase !== 'undefined') {
        try {
            supabaseClient = window.supabase.createClient(SB_URL, SB_KEY);
            console.log("Supabase client created (hard‑coded)");
            loadFromSupabase();
        } catch (e) {
            console.error("Supabase init error", e);
        }
    } else {
        console.warn("Supabase library not loaded – running offline");
    }
}

// Run init immediately if DOM already loaded, otherwise wait for DOMContentLoaded
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
        fullLogs = [...logs]; // Sync master list
        renderLogs();
        calculateStreak();
        localStorage.setItem('study_logs', JSON.stringify(logs));
    }
    // Cards
    const { data: dbCards, error: cardError } = await supabaseClient.from('cards').select('*');
    if (!cardError && dbCards) {
        cards = dbCards;
        fullCards = [...cards]; // Sync master list
        if (cards.length > 0) renderCard(0);
        localStorage.setItem('study_cards', JSON.stringify(cards));
    }
}

// ---------- Navigation ----------
function switchView(viewId, btnEl) {
    // Sections
    document.querySelectorAll('.view-section').forEach(sec => {
        sec.classList.toggle('active', sec.id === viewId);
    });
    // Buttons
    if (btnEl) {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        btnEl.classList.add('active');
    }
}
// expose for HTML inline calls
window.switchView = switchView;

// ---------- Journal ----------
function addLog() {
    const topicEl = document.getElementById('log-topic');
    const contentEl = document.getElementById('log-content');
    if (!topicEl || !contentEl) return alert('Campos de log não encontrados');
    const topic = topicEl.value.trim();
    const tagsVal = document.getElementById('log-tags')?.value.trim() || '';
    const content = contentEl.value.trim();
    if (!topic || !content) return alert('Preencha tópico e conteúdo');
    const entry = {
        id: Date.now(),
        date: new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        topic,
        tags: tagsVal, // Save tags
        content
    };
    console.log('Attempting to insert log entry', entry, 'Supabase client?', !!supabaseClient);
    logs.unshift(entry);
    fullLogs.unshift(entry); // Keep master list in sync
    renderLogs();
    calculateStreak(); // meaningful action update
    if (supabaseClient) {
        supabaseClient.from('logs').insert([entry]).then(({ error }) => {
            if (error) console.error('Supabase insert error', error);
            else console.log('Log entry inserted successfully');
        });
    }
    saveLogs();
    topicEl.value = '';
    contentEl.value = '';
}
window.addLog = addLog;

function saveLogs() {
    localStorage.setItem('study_logs', JSON.stringify(logs));
}

function deleteLog(id) {
    if (!confirm('Apagar este registro?')) {
        return;
    }
    // Use, loose equality to catch string/number mismatches
    logs = logs.filter(l => l.id != id);

    renderLogs();
    if (supabaseClient) {
        supabaseClient.from('logs').delete().eq('id', id).then(({ error }) => {
            if (error) console.error('Supabase delete error', error);
            else console.log('Supabase delete success');
        });
    }
    saveLogs();
}
window.deleteLog = deleteLog;

function renderLogs() {
    const container = document.getElementById('entries-list');
    if (!container) return;
    const parse = (typeof marked !== 'undefined' && marked.parse) ? marked.parse : text => text;
    container.innerHTML = logs.map(log => `
    <div class="log-entry">
      <div class="entry-header" style="display:flex;justify-content:space-between;align-items:start;">
        <div>
          <div class="log-date">${log.date}</div>
          <h3 style="color:var(--accent);margin-bottom:0.5rem;">${log.topic}</h3>
          ${log.tags ? `<div class="tags-container">${log.tags.split(',').map(t => `<span class="tag-chip">${t.trim()}</span>`).join('')}</div>` : ''}
        </div>
        <button class="delete-btn" onclick="deleteLog(${log.id})" title="Apagar">🗑️</button>
      </div>
      <div class="log-content-body">${parse(log.content)}</div>
    </div>
  `).join('');
}

// ---------- Flashcards ----------
function addCard() {
    const frontEl = document.getElementById('card-front');
    const backEl = document.getElementById('card-back');
    if (!frontEl || !backEl) return alert('Campos de cartão não encontrados');
    const front = frontEl.value.trim();
    const back = backEl.value.trim();
    if (!front || !back) return alert('Preencha frente e verso');
    const newCard = { id: Date.now(), front, back };
    console.log('Attempting to insert card', newCard, 'Supabase client?', !!supabaseClient);
    cards.push(newCard);
    if (supabaseClient) {
        supabaseClient.from('cards').insert([newCard]).then(({ error }) => {
            if (error) console.error('Supabase card error', error);
            else console.log('Card inserted successfully');
        });
    }
    localStorage.setItem('study_cards', JSON.stringify(cards));
    frontEl.value = '';
    backEl.value = '';
    if (cards.length === 1) renderCard(0);
    alert('Cartão adicionado!');
}
window.addCard = addCard;

function renderCard(idx) {
    if (cards.length === 0) return;
    const card = cards[idx];
    const front = document.getElementById('card-front-text');
    const back = document.getElementById('card-back-text');
    const el = document.getElementById('active-card');
    if (el) el.classList.remove('flipped');
    if (front) front.textContent = card.front;
    if (back) back.textContent = card.back;
}
window.renderCard = renderCard;

function flipCard() { document.getElementById('active-card').classList.toggle('flipped'); }
window.flipCard = flipCard;

function nextCard() { if (cards.length === 0) return; currentCardIndex = (currentCardIndex + 1) % cards.length; renderCard(currentCardIndex); }
function prevCard() { if (cards.length === 0) return; currentCardIndex = (currentCardIndex - 1 + cards.length) % cards.length; renderCard(currentCardIndex); }
window.nextCard = nextCard;
window.prevCard = prevCard;

function deleteCurrentCard() {
    if (cards.length === 0) return;
    if (!confirm('Apagar este cartão?')) {
        return;
    }
    const toDel = cards[currentCardIndex];
    cards.splice(currentCardIndex, 1);

    if (supabaseClient && toDel.id) {
        supabaseClient.from('cards').delete().eq('id', toDel.id).then(({ error }) => {
            if (error) console.error('Supabase del card error', error);
            else console.log('Supabase card delete success');
        });
    }
    localStorage.setItem('study_cards', JSON.stringify(cards));
    if (currentCardIndex >= cards.length) currentCardIndex = Math.max(0, cards.length - 1);
    if (cards.length === 0) {
        document.getElementById('card-front-text').textContent = 'Adicione um cartão!';
        document.getElementById('card-back-text').textContent = '...';
        document.getElementById('active-card').classList.remove('flipped');
    } else {
        renderCard(currentCardIndex);
    }
}
window.deleteCurrentCard = deleteCurrentCard;

// ---------- Backup ----------
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
    if (!confirm('Esta ação substituirá TODOS os dados. Continuar?')) { if (input) input.value = ''; return; }
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
            renderCard(0);
            calculateStreak();

            alert('Backup restaurado com sucesso!');
        } catch (err) { alert('Erro ao ler backup'); console.error(err); }
    };
    reader.readAsText(file);
    input.value = '';
}
window.importData = importData;

// ---------- Connection UI (kept for completeness) ----------
function saveConnection() {
    const url = document.getElementById('supabase-url').value;
    const key = document.getElementById('supabase-key').value;
    if (!url || !key) return alert('Preencha ambos os campos!');
    localStorage.setItem('supabase_url', url);
    localStorage.setItem('supabase_key', key);
    alert('Dados salvos! Recarregando...');
    location.reload();
}
window.saveConnection = saveConnection;

// ---------- New Features: Search, Streak ----------

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
    currentCardIndex = 0;
    if (cards.length === 0) {
        document.getElementById('card-front-text').textContent = 'Sem resultados';
        document.getElementById('card-back-text').textContent = '...';
        document.getElementById('active-card').classList.remove('flipped');
    } else {
        renderCard(0);
    }
}
window.handleSearch = handleSearch;

function calculateStreak() {
    if (!logs || logs.length === 0) {
        updateStreakDisplay(0);
        return;
    }

    // Get unique days from timestamps (ids)
    const uniqueDays = [...new Set(logs.map(l => {
        const d = new Date(l.id);
        return d.toISOString().split('T')[0]; // YYYY-MM-DD
    }))].sort().reverse();

    if (uniqueDays.length === 0) {
        updateStreakDisplay(0);
        return;
    }

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Check if streak is active (studied today or yesterday)
    // If most recent study was before yesterday, streak is broken -> 0
    if (uniqueDays[0] !== today && uniqueDays[0] !== yesterday) {
        updateStreakDisplay(0);
        return;
    }

    let streak = 1;
    let currentCheck = uniqueDays[0]; // Start with the most recent active day

    // Count backwards
    for (let i = 1; i < uniqueDays.length; i++) {
        const expectedPrev = new Date(new Date(currentCheck).getTime() - 86400000).toISOString().split('T')[0];
        // Handle timezone edge cases roughly or just string compare
        // Actually: new Date('2023-01-02') is UTC midnight.
        // It's safer to just subtract 1 day from Date object.

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
